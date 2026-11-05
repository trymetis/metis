import { DAVNamespaceShort, propfind } from "tsdav";
import { Agent } from "undici";

import type { WebdavCredentials } from "@/connections/types";
import type { DriveAdapter } from "@/drive/adapter";
import { mimeFromName } from "@/drive/mime";
import { topOfPath } from "@/drive/path-ids";
import { type RelayScope, relayDownloadTarget, relayUploadSession } from "@/drive/relay";
import { afterSearchChange, cachedFolderListing } from "@/drive/search-cache";
import { textDriveSearch } from "@/drive/text-search";
import { bind } from "@/lib/bind";
import { ProviderError } from "@/lib/errors/provider-error";
import type {
  DriveDownloadTarget,
  DriveEntry,
  DriveListing,
  DriveQuota,
  DriveStream,
  DriveUploadSession,
  NewUpload,
} from "@/types/drive";

export function webdavDrive(
  credentials: WebdavCredentials,
  scope: RelayScope | undefined,
): DriveAdapter {
  return bind<DriveAdapter, WebdavCredentials>(
    {
      topAncestor,
      listFolder,
      search,
      searchAst: (c, query) =>
        textDriveSearch(query, (text) => search(c, text), {
          nameIsExact: true,
        }),
      getEntry,
      getDownloadTarget: (c, fileId) => getDownloadTarget(c, fileId, scope),
      createUploadSession: (c, upload) =>
        afterSearchChange(c.serverId, createUploadSession(c, upload, scope)),
      readStream,
      writeStream: (c, upload, body, signal) =>
        afterSearchChange(c.serverId, writeStream(c, upload, body, signal)),
      createFolder: (c, parentId, name) =>
        afterSearchChange(c.serverId, createFolder(c, parentId, name)),
      rename: (c, fileId, name) => afterSearchChange(c.serverId, rename(c, fileId, name)),
      move: (c, fileId, parentId) => afterSearchChange(c.serverId, move(c, fileId, parentId)),
      delete: (c, fileId) => afterSearchChange(c.serverId, deleteEntry(c, fileId)),
      quota,
    },
    credentials,
  );
}

const SEARCH_MAX_FOLDERS = 200;
const SEARCH_MAX_DEPTH = 12;
const SEARCH_MAX_RESULTS = 200;

const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

const PROPS = {
  [`${DAVNamespaceShort.DAV}:resourcetype`]: {},
  [`${DAVNamespaceShort.DAV}:getcontentlength`]: {},
  [`${DAVNamespaceShort.DAV}:getlastmodified`]: {},
  [`${DAVNamespaceShort.DAV}:getcontenttype`]: {},
};

const QUOTA_PROPS = {
  [`${DAVNamespaceShort.DAV}:quota-used-bytes`]: {},
  [`${DAVNamespaceShort.DAV}:quota-available-bytes`]: {},
};

type Props = Record<string, unknown>;

function dispatcherOptions(credentials: WebdavCredentials): RequestInit {
  return credentials.allowInsecureTls ? { dispatcher: insecureAgent } : {};
}

function authHeader(credentials: WebdavCredentials): string {
  const token = Buffer.from(`${credentials.user}:${credentials.pass}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

function rootPrefix(credentials: WebdavCredentials): string {
  return credentials.root ? `${credentials.root}/` : "";
}

function checkId(id: string): string {
  const trimmed = id.endsWith("/") ? id.slice(0, -1) : id;
  const parts = trimmed.split("/");
  if (
    !trimmed ||
    id.startsWith("/") ||
    id.includes("\\") ||
    id.includes("\0") ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("That path is not available on this server");
  }
  return id;
}

function checkName(name: string): string {
  if (!name || name === "." || name === ".." || /[/\\\0]/.test(name)) {
    throw new Error("That name is not allowed here");
  }
  return name;
}

function folderPrefix(parentId: string | null): string {
  if (!parentId) return "";
  const id = checkId(parentId);
  if (!id.endsWith("/")) throw new Error("That is a file, not a folder");
  return id;
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function urlFor(credentials: WebdavCredentials, id: string | null): URL {
  return new URL(encodePath(`${rootPrefix(credentials)}${id ?? ""}`), credentials.url);
}

function decodePath(pathname: string): string {
  return pathname
    .split("/")
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .join("/");
}

function nameOf(id: string): string {
  const trimmed = id.endsWith("/") ? id.slice(0, -1) : id;
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

function topAncestor(_credentials: WebdavCredentials, fileId: string): string {
  return topOfPath(checkId(fileId));
}

function parentOf(id: string): string | null {
  const trimmed = id.endsWith("/") ? id.slice(0, -1) : id;
  const cut = trimmed.lastIndexOf("/");
  return cut === -1 ? null : trimmed.slice(0, cut + 1);
}

function isCollection(props: Props | undefined): boolean {
  const type = props?.resourcetype;
  return typeof type === "object" && type !== null && "collection" in type;
}

function toIso(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toEntry(id: string, props: Props | undefined): DriveEntry {
  const folder = id.endsWith("/");
  const contentType =
    typeof props?.getcontenttype === "string"
      ? (props.getcontenttype.split(";")[0]?.trim() ?? null)
      : null;
  return {
    id,
    name: nameOf(id),
    kind: folder ? "folder" : "file",
    mimeType: folder ? null : contentType || mimeFromName(nameOf(id)),
    size: folder ? null : toNumber(props?.getcontentlength),
    modifiedAt: toIso(props?.getlastmodified),
    parentId: parentOf(id),
    webUrl: null,
    native: false,
  };
}

async function dav(
  credentials: WebdavCredentials,
  method: string,
  target: URL,
  init: {
    headers?: Record<string, string>;
    body?: BodyInit | null;
    signal?: AbortSignal;
  } = {},
): Promise<Response> {
  const res = await fetch(target, {
    method,
    headers: { authorization: authHeader(credentials), ...init.headers },
    body: init.body ?? null,
    signal: init.signal,
    redirect: "manual",
    ...(init.body instanceof ReadableStream ? { duplex: "half" } : {}),
    ...dispatcherOptions(credentials),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ProviderError("webdav", res.status, body, `WebDAV ${method}`);
  }
  return res;
}

async function find(
  credentials: WebdavCredentials,
  id: string | null,
  depth: "0" | "1",
  props: Props = PROPS,
): Promise<{ id: string; props: Props | undefined }[]> {
  const base = urlFor(credentials, id);
  const responses = await propfind({
    url: base.href,
    depth,
    props,
    headers: { authorization: authHeader(credentials) },
    fetchOptions: dispatcherOptions(credentials),
  });

  const failed = responses.find((response) => !response.ok && response.status >= 400);
  if (failed) {
    throw new ProviderError("webdav", failed.status, failed.statusText, "WebDAV PROPFIND");
  }

  const rootPath = decodePath(urlFor(credentials, null).pathname);
  const entries: { id: string; props: Props | undefined }[] = [];
  for (const response of responses) {
    if (!response.href) continue;
    const path = decodePath(new URL(response.href, base).pathname);
    if (!path.startsWith(rootPath)) continue;

    const relative = path.slice(rootPath.length);
    const found = response.props;
    if (!relative || relative === "/") {
      entries.push({ id: "", props: found });
      continue;
    }
    const folder = isCollection(found);
    const clean = relative.replace(/\/+$/, "");
    entries.push({ id: folder ? `${clean}/` : clean, props: found });
  }
  return entries;
}

async function listFolder(
  credentials: WebdavCredentials,
  parentId: string | null,
): Promise<DriveListing> {
  const prefix = folderPrefix(parentId);
  const found = await find(credentials, prefix || null, "1");
  const entries = found
    .filter((item) => item.id && item.id !== prefix)
    .map((item) => toEntry(item.id, item.props));
  return { entries, cursor: null };
}

async function search(credentials: WebdavCredentials, query: string): Promise<DriveListing> {
  const needle = query.toLowerCase();
  const results: DriveEntry[] = [];
  const queue: { id: string | null; depth: number }[] = [{ id: null, depth: 0 }];
  let visited = 0;

  while (queue.length > 0 && visited < SEARCH_MAX_FOLDERS && results.length < SEARCH_MAX_RESULTS) {
    const next = queue.shift();
    if (!next) break;
    visited += 1;

    // oxlint-disable-next-line eslint/no-await-in-loop -- bounded breadth-first crawl that stops at the folder or result cap
    const listing = await cachedFolderListing(credentials, next.id, () =>
      listFolder(credentials, next.id),
    );
    for (const entry of listing.entries) {
      if (entry.name.toLowerCase().includes(needle)) results.push(entry);
      if (entry.kind === "folder" && next.depth + 1 < SEARCH_MAX_DEPTH) {
        queue.push({ id: entry.id, depth: next.depth + 1 });
      }
    }
  }

  return { entries: results.slice(0, SEARCH_MAX_RESULTS), cursor: null };
}

async function getEntry(credentials: WebdavCredentials, fileId: string): Promise<DriveEntry> {
  const id = checkId(fileId);
  const [found] = await find(credentials, id, "0");
  if (!found) throw new ProviderError("webdav", 404, "", "WebDAV PROPFIND");

  const folder = isCollection(found.props);
  const clean = id.replace(/\/+$/, "");
  return toEntry(folder ? `${clean}/` : clean, found.props);
}

async function getDownloadTarget(
  credentials: WebdavCredentials,
  fileId: string,
  scope: RelayScope | undefined,
): Promise<DriveDownloadTarget> {
  const entry = await getEntry(credentials, fileId);
  if (entry.kind === "folder") {
    return {
      kind: "unavailable",
      reason: "Folders cannot be downloaded",
      webUrl: null,
    };
  }
  return relayDownloadTarget(scope, entry);
}

async function readStream(
  credentials: WebdavCredentials,
  fileId: string,
  signal: AbortSignal,
): Promise<DriveStream> {
  const entry = await getEntry(credentials, fileId);
  if (entry.kind === "folder") {
    throw new Error("Folders cannot be downloaded");
  }
  const res = await dav(credentials, "GET", urlFor(credentials, entry.id), {
    signal,
  });
  if (!res.body) {
    throw new ProviderError("webdav", 502, "empty body", "WebDAV GET");
  }
  return {
    name: entry.name,
    size: entry.size,
    mimeType: entry.mimeType,
    body: res.body,
    release: () => {},
  };
}

async function createUploadSession(
  _credentials: WebdavCredentials,
  upload: NewUpload,
  scope: RelayScope | undefined,
): Promise<DriveUploadSession> {
  folderPrefix(upload.parentId);
  checkName(upload.name);
  return relayUploadSession(scope, upload);
}

async function writeStream(
  credentials: WebdavCredentials,
  upload: NewUpload,
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): Promise<DriveEntry> {
  const id = `${folderPrefix(upload.parentId)}${checkName(upload.name)}`;
  const existed = await getEntry(credentials, id).then(
    () => true,
    () => false,
  );
  try {
    await dav(credentials, "PUT", urlFor(credentials, id), {
      headers: { "content-type": upload.mime || "application/octet-stream" },
      body,
      signal,
    });
  } catch (err) {
    if (!existed) {
      await dav(credentials, "DELETE", urlFor(credentials, id)).catch(() => {});
    }
    throw err;
  }
  return getEntry(credentials, id);
}

async function createFolder(
  credentials: WebdavCredentials,
  parentId: string | null,
  name: string,
): Promise<DriveEntry> {
  const id = `${folderPrefix(parentId)}${checkName(name)}/`;
  try {
    await dav(credentials, "MKCOL", urlFor(credentials, id));
  } catch (err) {
    if (err instanceof ProviderError && err.status === 405) {
      throw new Error("A file or folder with that name already exists", {
        cause: err,
      });
    }
    throw err;
  }
  return getEntry(credentials, id);
}

async function relocate(
  credentials: WebdavCredentials,
  fileId: string,
  destination: string,
): Promise<void> {
  const source = checkId(fileId);
  const target = checkId(destination);
  if (source === target) return;
  if (source.endsWith("/") && target.startsWith(source)) {
    throw new Error("A folder cannot be moved into itself");
  }

  try {
    await dav(credentials, "MOVE", urlFor(credentials, source), {
      headers: {
        destination: urlFor(credentials, target).href,
        overwrite: "F",
      },
    });
  } catch (err) {
    if (err instanceof ProviderError && err.status === 412) {
      throw new Error("A file or folder with that name already exists there", {
        cause: err,
      });
    }
    throw err;
  }
}

async function rename(credentials: WebdavCredentials, fileId: string, name: string): Promise<void> {
  const parent = parentOf(checkId(fileId)) ?? "";
  const folder = fileId.endsWith("/");
  await relocate(credentials, fileId, `${parent}${checkName(name)}${folder ? "/" : ""}`);
}

async function move(
  credentials: WebdavCredentials,
  fileId: string,
  newParentId: string | null,
): Promise<void> {
  const id = checkId(fileId);
  const folder = id.endsWith("/");
  await relocate(credentials, id, `${folderPrefix(newParentId)}${nameOf(id)}${folder ? "/" : ""}`);
}

async function deleteEntry(credentials: WebdavCredentials, fileId: string): Promise<void> {
  await dav(credentials, "DELETE", urlFor(credentials, checkId(fileId)));
}

async function quota(credentials: WebdavCredentials): Promise<DriveQuota | null> {
  const [root] = await find(credentials, null, "0", QUOTA_PROPS).catch(() => []);
  const props = root?.props;
  const used = toNumber(props?.quotaUsedBytes ?? props?.["quota-used-bytes"]);
  const available = toNumber(props?.quotaAvailableBytes ?? props?.["quota-available-bytes"]);
  if (used === null && available === null) return null;
  return {
    usedBytes: used,
    totalBytes: used !== null && available !== null && available >= 0 ? used + available : null,
  };
}

export async function webdavVerify(credentials: WebdavCredentials): Promise<void> {
  let root: { props: Props | undefined } | undefined;
  try {
    [root] = await find(credentials, null, "0");
  } catch (err) {
    if (err instanceof ProviderError && err.status === 404) {
      throw new Error(
        credentials.root
          ? `The folder "${credentials.root}" does not exist on that server`
          : "That server has no WebDAV folder at its configured URL",
        { cause: err },
      );
    }
    throw err;
  }
  if (!isCollection(root?.props)) {
    throw new Error(
      credentials.root
        ? `"${credentials.root}" is a file, not a folder`
        : "The server's WebDAV URL is not a folder",
    );
  }
}
