import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

import type { S3Credentials } from "@/connections/types";
import type { DriveAdapter } from "@/drive/adapter";
import { topOfPath } from "@/drive/path-ids";
import {
  contentDisposition,
  type RelayScope,
  relayDownloadTarget,
  relayUploadSession,
} from "@/drive/relay";
import { afterSearchChange, cachedSearchListing } from "@/drive/search-cache";
import { textDriveSearch } from "@/drive/text-search";
import { bind } from "@/lib/bind";
import { ProviderError } from "@/lib/errors/provider-error";
import { parseSize } from "@/lib/size";
import type {
  DriveDownloadTarget,
  DriveEntry,
  DriveListing,
  DriveQuota,
  DriveStream,
  DriveUploadSession,
  NewUpload,
} from "@/types/drive";

import { corsPreflight, objectUrl, s3Client, s3Send } from "./client";

export function s3Drive(credentials: S3Credentials, scope: RelayScope | undefined): DriveAdapter {
  return bind<DriveAdapter, S3Credentials>(
    {
      topAncestor,
      listFolder,
      search,
      searchAst: (c, query) =>
        textDriveSearch(query, (text, cursor) => search(c, text, cursor), {
          nameIsExact: true,
        }),
      getEntry,
      getDownloadTarget: (c, fileId) => getDownloadTarget(c, fileId, scope),
      createUploadSession: (c, upload) =>
        afterSearchChange(searchScope(c), createUploadSession(c, upload, scope)),
      readStream,
      writeStream: (c, upload, body, signal) =>
        afterSearchChange(searchScope(c), writeStream(c, upload, body, signal)),
      createFolder: (c, parentId, name) =>
        afterSearchChange(searchScope(c), createFolder(c, parentId, name)),
      rename: (c, fileId, name) => afterSearchChange(searchScope(c), rename(c, fileId, name)),
      move: (c, fileId, parentId) => afterSearchChange(searchScope(c), move(c, fileId, parentId)),
      delete: (c, fileId) => afterSearchChange(searchScope(c), deleteEntry(c, fileId)),
      quota: () => quota(),
    },
    credentials,
  );
}

const MAX_KEYS = 1000;
const SEARCH_PAGE_RESULTS = 50;
const SEARCH_MAX_PAGES = 20;
const DELETE_BATCH = 1000;
const DOWNLOAD_EXPIRY_SEC = 300;
const UPLOAD_EXPIRY_SEC = 3600;

function rootPrefix(credentials: S3Credentials): string {
  return credentials.prefix ? `${credentials.prefix}/` : "";
}

function resolvePrefix(credentials: S3Credentials, parentId: string | null): string {
  const root = rootPrefix(credentials);
  if (!parentId) return root;

  const normalized = parentId.replace(/^\/+/, "");
  if (normalized.includes("..")) {
    throw new Error("That folder is not available on this server");
  }
  if (!normalized.startsWith(root)) {
    throw new Error("That folder is outside this connection");
  }
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function resolveKey(credentials: S3Credentials, key: string): string {
  const normalized = key.replace(/^\/+/, "");
  if (normalized.includes("..")) {
    throw new Error("That file is not available on this server");
  }
  if (!normalized.startsWith(rootPrefix(credentials))) {
    throw new Error("That file is outside this connection");
  }
  return normalized;
}

function checkName(name: string): string {
  if (!name || name === "." || name === ".." || /[/\\\0]/.test(name)) {
    throw new Error("That name is not allowed here");
  }
  return name;
}

function nameOf(key: string): string {
  const trimmed = key.endsWith("/") ? key.slice(0, -1) : key;
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

function topAncestor(credentials: S3Credentials, fileId: string): string {
  return topOfPath(resolveKey(credentials, fileId), rootPrefix(credentials));
}

function parentOf(key: string): string | null {
  const trimmed = key.endsWith("/") ? key.slice(0, -1) : key;
  const cut = trimmed.lastIndexOf("/");
  return cut === -1 ? null : trimmed.slice(0, cut + 1);
}

function folderEntry(prefix: string): DriveEntry {
  return {
    id: prefix,
    name: nameOf(prefix),
    kind: "folder",
    mimeType: null,
    size: null,
    modifiedAt: null,
    parentId: parentOf(prefix),
    webUrl: null,
    native: false,
  };
}

function fileEntry(object: {
  Key?: string;
  Size?: number;
  LastModified?: Date;
}): DriveEntry | null {
  const key = object.Key;
  if (!key || key.endsWith("/")) return null;
  return {
    id: key,
    name: nameOf(key),
    kind: "file",
    mimeType: null,
    size: object.Size ?? null,
    modifiedAt: object.LastModified?.toISOString() ?? null,
    parentId: parentOf(key),
    webUrl: null,
    native: false,
  };
}

function folderPrefixes(root: string, key: string): string[] {
  const prefixes: string[] = [];
  for (let at = key.indexOf("/", root.length); at !== -1; at = key.indexOf("/", at + 1)) {
    prefixes.push(key.slice(0, at + 1));
  }
  return prefixes;
}

const PAST_PREFIX = "\u{10FFFF}";

function list(
  credentials: S3Credentials,
  prefix: string,
  opts: { delimiter: boolean; cursor?: string },
): Promise<ListObjectsV2CommandOutput> {
  return s3Send(() =>
    s3Client(credentials.serverId).send(
      new ListObjectsV2Command({
        Bucket: credentials.bucket,
        Prefix: prefix || undefined,
        Delimiter: opts.delimiter ? "/" : undefined,
        StartAfter: opts.cursor,
        MaxKeys: MAX_KEYS,
      }),
    ),
  );
}

const listingPageSchema = z.object({
  objects: z.array(
    z.object({
      key: z.string(),
      size: z.number().nullable(),
      modified: z.string().nullable(),
    }),
  ),
  next: z.string().nullable(),
});

type ListingPage = z.infer<typeof listingPageSchema>;

function searchScope(credentials: S3Credentials): string {
  return `s3:${credentials.serverId}:${credentials.bucket}`;
}

async function searchPage(
  credentials: S3Credentials,
  root: string,
  cursor: string | undefined,
): Promise<ListingPage> {
  const page = await list(credentials, root, { delimiter: false, cursor });
  return {
    objects: (page.Contents ?? []).flatMap((object) =>
      object.Key
        ? [
            {
              key: object.Key,
              size: object.Size ?? null,
              modified: object.LastModified?.toISOString() ?? null,
            },
          ]
        : [],
    ),
    next: nextCursor(page),
  };
}

function nextCursor(page: ListObjectsV2CommandOutput): string | null {
  if (!page.IsTruncated) return null;
  const candidates = [
    ...(page.Contents ?? []).map((object) => object.Key),
    ...(page.CommonPrefixes ?? []).map((common) =>
      common.Prefix ? `${common.Prefix}${PAST_PREFIX}` : undefined,
    ),
  ].filter((key): key is string => !!key);
  let last: string | null = null;
  for (const key of candidates) {
    if (last === null || Buffer.compare(Buffer.from(key), Buffer.from(last)) > 0) {
      last = key;
    }
  }
  return last;
}

async function listFolder(
  credentials: S3Credentials,
  parentId: string | null,
  cursor?: string,
): Promise<DriveListing> {
  const prefix = resolvePrefix(credentials, parentId);
  const page = await list(credentials, prefix, { delimiter: true, cursor });

  const folders = (page.CommonPrefixes ?? [])
    .map((common) => common.Prefix ?? "")
    .filter((value) => value && value !== prefix)
    .map(folderEntry);
  const files = (page.Contents ?? []).flatMap((object) => {
    const entry = fileEntry(object);
    return entry ? [entry] : [];
  });

  return {
    entries: [...folders, ...files],
    cursor: nextCursor(page),
  };
}

async function search(
  credentials: S3Credentials,
  query: string,
  cursor?: string,
): Promise<DriveListing> {
  const needle = query.toLowerCase();
  const root = rootPrefix(credentials);
  const entries: DriveEntry[] = [];
  let next: string | null = cursor ?? null;
  let previous: string | null = next;
  for (let scanned = 0; scanned < SEARCH_MAX_PAGES; scanned++) {
    const start = next ?? undefined;
    // oxlint-disable-next-line eslint/no-await-in-loop -- each page needs the previous page's continuation token
    const page = await cachedSearchListing(
      searchScope(credentials),
      [root, start ?? null],
      listingPageSchema,
      () => searchPage(credentials, root, start),
    );
    for (const object of page.objects) {
      for (const prefix of folderPrefixes(root, object.key)) {
        if (previous?.startsWith(prefix)) continue;
        if (nameOf(prefix).toLowerCase().includes(needle)) {
          entries.push(folderEntry(prefix));
        }
      }
      const entry = fileEntry({
        Key: object.key,
        Size: object.size ?? undefined,
        LastModified: object.modified ? new Date(object.modified) : undefined,
      });
      if (entry?.name.toLowerCase().includes(needle)) entries.push(entry);
      previous = object.key;
    }
    next = page.next;
    if (!next || entries.length >= SEARCH_PAGE_RESULTS) break;
  }
  return { entries, cursor: next };
}

async function getEntry(credentials: S3Credentials, fileId: string): Promise<DriveEntry> {
  if (fileId.endsWith("/")) return folderEntry(resolvePrefix(credentials, fileId));

  const key = resolveKey(credentials, fileId);
  const head = await s3Send(() =>
    s3Client(credentials.serverId).send(
      new HeadObjectCommand({ Bucket: credentials.bucket, Key: key }),
    ),
  );
  return {
    id: key,
    name: nameOf(key),
    kind: "file",
    mimeType: head.ContentType ?? null,
    size: head.ContentLength ?? null,
    modifiedAt: head.LastModified?.toISOString() ?? null,
    parentId: parentOf(key),
    webUrl: null,
    native: false,
  };
}

async function getDownloadTarget(
  credentials: S3Credentials,
  fileId: string,
  scope: RelayScope | undefined,
): Promise<DriveDownloadTarget> {
  if (fileId.endsWith("/")) {
    return {
      kind: "unavailable",
      reason: "Folders cannot be downloaded",
      webUrl: null,
    };
  }

  const key = resolveKey(credentials, fileId);

  if (credentials.transfer === "relay") {
    return relayDownloadTarget(scope, await getEntry(credentials, key));
  }

  return {
    kind: "redirect",
    url: await getSignedUrl(
      s3Client(credentials.serverId),
      new GetObjectCommand({
        Bucket: credentials.bucket,
        Key: key,
        ResponseContentDisposition: contentDisposition(nameOf(key)),
      }),
      { expiresIn: DOWNLOAD_EXPIRY_SEC },
    ),
    expiresAt: new Date(Date.now() + DOWNLOAD_EXPIRY_SEC * 1000),
    name: nameOf(key),
  };
}

async function readStream(
  credentials: S3Credentials,
  fileId: string,
  signal: AbortSignal,
): Promise<DriveStream> {
  if (credentials.transfer !== "relay") {
    throw new Error("This drive downloads straight from the bucket");
  }
  if (fileId.endsWith("/")) {
    throw new Error("Folders cannot be downloaded");
  }

  const key = resolveKey(credentials, fileId);
  const object = await s3Send(() =>
    s3Client(credentials.serverId).send(
      new GetObjectCommand({ Bucket: credentials.bucket, Key: key }),
      { abortSignal: signal },
    ),
  );
  if (!object.Body) {
    throw new ProviderError("s3", 502, "empty body", "S3");
  }
  return {
    name: nameOf(key),
    size: object.ContentLength ?? null,
    mimeType: object.ContentType ?? null,
    body: object.Body.transformToWebStream(),
    release: () => {},
  };
}

async function createUploadSession(
  credentials: S3Credentials,
  upload: NewUpload,
  scope: RelayScope | undefined,
): Promise<DriveUploadSession> {
  const key = `${resolvePrefix(credentials, upload.parentId)}${checkName(upload.name)}`;

  if (credentials.transfer === "relay") {
    return relayUploadSession(scope, upload);
  }

  return {
    strategy: "presigned-put",
    url: await getSignedUrl(
      s3Client(credentials.serverId),
      new PutObjectCommand({ Bucket: credentials.bucket, Key: key }),
      { expiresIn: UPLOAD_EXPIRY_SEC },
    ),
    headers: {},
    chunkSize: 0,
    authRequired: false,
  };
}

async function writeStream(
  credentials: S3Credentials,
  upload: NewUpload,
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): Promise<DriveEntry> {
  if (credentials.transfer !== "relay") {
    throw new Error("This drive uploads straight to the bucket");
  }

  const partSize = parseSize(credentials.partSize);
  if (partSize === null) throw new Error("This drive's part size is not a valid size");

  const key = `${resolvePrefix(credentials, upload.parentId)}${checkName(upload.name)}`;
  const contentType = upload.mime || "application/octet-stream";
  let size = 0;
  const counted = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        size += chunk.byteLength;
        controller.enqueue(chunk);
      },
    }),
  );
  const transfer = new Upload({
    client: s3Client(credentials.serverId),
    params: {
      Bucket: credentials.bucket,
      Key: key,
      Body: counted,
      ContentType: contentType,
    },
    partSize,
    queueSize: 1,
    leavePartsOnError: false,
  });

  const abort = () => {
    transfer.abort().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    await s3Send(() => transfer.done());
  } finally {
    signal.removeEventListener("abort", abort);
  }
  return {
    id: key,
    name: nameOf(key),
    kind: "file",
    mimeType: contentType,
    size,
    modifiedAt: new Date().toISOString(),
    parentId: parentOf(key),
    webUrl: null,
    native: false,
  };
}

async function createFolder(
  credentials: S3Credentials,
  parentId: string | null,
  name: string,
): Promise<DriveEntry> {
  const key = `${resolvePrefix(credentials, parentId)}${checkName(name)}/`;
  await s3Send(() =>
    s3Client(credentials.serverId).send(
      new PutObjectCommand({
        Bucket: credentials.bucket,
        Key: key,
        Body: new Uint8Array(0),
        ContentLength: 0,
      }),
    ),
  );
  return folderEntry(key);
}

async function listAllKeys(credentials: S3Credentials, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each page needs the previous page's continuation token
    const page = await list(credentials, prefix, { delimiter: false, cursor });
    for (const object of page.Contents ?? []) {
      if (object.Key) keys.push(object.Key);
    }
    cursor = nextCursor(page) ?? undefined;
  } while (cursor);
  return keys;
}

async function deleteKeys(credentials: S3Credentials, keys: string[]): Promise<void> {
  for (let start = 0; start < keys.length; start += DELETE_BATCH) {
    const batch = keys.slice(start, start + DELETE_BATCH);
    // oxlint-disable-next-line eslint/no-await-in-loop -- batches run in order and the delete stops at the first failed batch
    const result = await s3Send(() =>
      s3Client(credentials.serverId).send(
        new DeleteObjectsCommand({
          Bucket: credentials.bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      ),
    );
    const failed = result.Errors?.[0];
    if (failed) {
      throw new ProviderError(
        "s3",
        502,
        `${failed.Code ?? "DeleteFailed"}: ${failed.Key ?? ""}`,
        "S3",
      );
    }
  }
}

async function copyKey(credentials: S3Credentials, from: string, to: string): Promise<void> {
  await s3Send(() =>
    s3Client(credentials.serverId).send(
      new CopyObjectCommand({
        Bucket: credentials.bucket,
        Key: to,
        CopySource: `${credentials.bucket}/${from.split("/").map(encodeURIComponent).join("/")}`,
      }),
    ),
  );
}

async function relocate(
  credentials: S3Credentials,
  fileId: string,
  destination: string,
): Promise<void> {
  const source = resolveKey(credentials, fileId);
  const target = resolveKey(credentials, destination);
  if (source === target) return;
  if (source.endsWith("/") && target.startsWith(source)) {
    throw new Error("A folder cannot be moved into itself");
  }

  if (!source.endsWith("/")) {
    await copyKey(credentials, source, target);
    await s3Send(() =>
      s3Client(credentials.serverId).send(
        new DeleteObjectCommand({ Bucket: credentials.bucket, Key: source }),
      ),
    );
    return;
  }

  const keys = await listAllKeys(credentials, source);
  for (const key of keys) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one copy at a time bounds the load a large folder puts on the bucket
    await copyKey(credentials, key, `${target}${key.slice(source.length)}`);
  }
  await deleteKeys(credentials, keys);
}

async function rename(credentials: S3Credentials, fileId: string, name: string): Promise<void> {
  const parent = parentOf(fileId) ?? rootPrefix(credentials);
  const destination = fileId.endsWith("/")
    ? `${parent}${checkName(name)}/`
    : `${parent}${checkName(name)}`;
  await relocate(credentials, fileId, destination);
}

async function move(
  credentials: S3Credentials,
  fileId: string,
  newParentId: string | null,
): Promise<void> {
  const prefix = resolvePrefix(credentials, newParentId);
  const name = nameOf(fileId);
  const destination = fileId.endsWith("/") ? `${prefix}${name}/` : `${prefix}${name}`;
  await relocate(credentials, fileId, destination);
}

async function deleteEntry(credentials: S3Credentials, fileId: string): Promise<void> {
  const key = resolveKey(credentials, fileId);
  if (!key.endsWith("/")) {
    await s3Send(() =>
      s3Client(credentials.serverId).send(
        new DeleteObjectCommand({ Bucket: credentials.bucket, Key: key }),
      ),
    );
    return;
  }
  await deleteKeys(credentials, await listAllKeys(credentials, key));
}

async function quota(): Promise<DriveQuota | null> {
  return null;
}

export async function s3Verify(credentials: S3Credentials, origin: string): Promise<void> {
  const prefix = rootPrefix(credentials);
  await s3Send(() =>
    s3Client(credentials.serverId).send(
      new ListObjectsV2Command({
        Bucket: credentials.bucket,
        Prefix: prefix || undefined,
        MaxKeys: 1,
      }),
    ),
  );
  if (credentials.transfer === "relay") return;

  const probe = objectUrl(credentials, credentials.bucket, `${prefix}metis-cors-probe`);
  const cors = await corsPreflight(credentials, probe, origin).catch(() => null);
  const allowed = cors?.headers.get("access-control-allow-origin");
  if (allowed !== "*" && allowed !== origin) {
    throw new Error(
      `That bucket does not allow browser uploads from ${origin}. Add a CORS rule permitting GET and PUT from that origin, or ask the operator to set "transfer": "relay" on this server, then try again.`,
    );
  }
}
