import { posix } from "node:path";
import { PassThrough, Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { type FileInfo, FileType, FTPError } from "basic-ftp";

import type { FtpCredentials } from "@/connections/types";
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

import { acquireFtp, type FtpLease, withFtp } from "./pool";

export function ftpDrive(credentials: FtpCredentials, scope: RelayScope | undefined): DriveAdapter {
  return bind<DriveAdapter, FtpCredentials>(
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
      quota: () => quota(),
    },
    credentials,
  );
}

const SEARCH_MAX_FOLDERS = 200;
const SEARCH_MAX_DEPTH = 12;
const SEARCH_MAX_RESULTS = 200;
const UNSAFE = /[\r\n\0\\]/;

function checkId(id: string): string {
  const trimmed = id.endsWith("/") ? id.slice(0, -1) : id;
  const parts = trimmed.split("/");
  if (
    !trimmed ||
    id.startsWith("/") ||
    UNSAFE.test(id) ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("That path is not available on this server");
  }
  return id;
}

function checkName(name: string): string {
  if (!name || name === "." || name === ".." || /[/\r\n\0\\]/.test(name)) {
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

function nameOf(id: string): string {
  const trimmed = id.endsWith("/") ? id.slice(0, -1) : id;
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

function topAncestor(_credentials: FtpCredentials, fileId: string): string {
  return topOfPath(checkId(fileId));
}

function parentOf(id: string): string | null {
  const trimmed = id.endsWith("/") ? id.slice(0, -1) : id;
  const cut = trimmed.lastIndexOf("/");
  return cut === -1 ? null : trimmed.slice(0, cut + 1);
}

function serverPath(credentials: FtpCredentials, held: FtpLease, id: string): string {
  return posix.join(held.home, credentials.root ?? "", id);
}

function toEntry(id: string, info: FileInfo): DriveEntry {
  const folder = id.endsWith("/");
  return {
    id,
    name: nameOf(id),
    kind: folder ? "folder" : "file",
    mimeType: folder ? null : mimeFromName(info.name),
    size: folder ? null : info.size,
    modifiedAt: info.modifiedAt?.toISOString() ?? null,
    parentId: parentOf(id),
    webUrl: null,
    native: false,
  };
}

function entriesOf(prefix: string, listing: FileInfo[]): DriveEntry[] {
  return listing.flatMap((info) => {
    if (!info.name || info.name === "." || info.name === "..") return [];
    if (info.type === FileType.Directory) {
      return [toEntry(`${prefix}${info.name}/`, info)];
    }
    if (info.type === FileType.File) {
      return [toEntry(`${prefix}${info.name}`, info)];
    }
    return [];
  });
}

async function listFolder(
  credentials: FtpCredentials,
  parentId: string | null,
): Promise<DriveListing> {
  const prefix = folderPrefix(parentId);
  const listing = await withFtp(credentials, (held) =>
    held.client.list(serverPath(credentials, held, prefix)),
  );
  return { entries: entriesOf(prefix, listing), cursor: null };
}

async function search(credentials: FtpCredentials, query: string): Promise<DriveListing> {
  const needle = query.toLowerCase();
  const results: DriveEntry[] = [];
  const queue: { id: string | null; depth: number }[] = [{ id: null, depth: 0 }];
  let visited = 0;

  while (queue.length > 0 && visited < SEARCH_MAX_FOLDERS && results.length < SEARCH_MAX_RESULTS) {
    const next = queue.shift();
    if (!next) break;
    visited += 1;

    // oxlint-disable-next-line eslint/no-await-in-loop -- bounded breadth-first crawl that stops at the folder or result cap; an FTP client runs one command at a time
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

async function findEntry(credentials: FtpCredentials, fileId: string): Promise<DriveEntry | null> {
  const id = checkId(fileId);
  const name = nameOf(id);
  const parent = parentOf(id) ?? "";
  const listing = await listFolder(credentials, parent || null);
  return (
    listing.entries.find(
      (entry) => entry.name === name && (entry.kind === "folder") === id.endsWith("/"),
    ) ??
    listing.entries.find((entry) => entry.name === name) ??
    null
  );
}

async function getEntry(credentials: FtpCredentials, fileId: string): Promise<DriveEntry> {
  const entry = await findEntry(credentials, fileId);
  if (!entry) throw new ProviderError("ftp", 404, "", "FTP");
  return entry;
}

async function getDownloadTarget(
  credentials: FtpCredentials,
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
  credentials: FtpCredentials,
  fileId: string,
  signal: AbortSignal,
): Promise<DriveStream> {
  const entry = await getEntry(credentials, fileId);
  if (entry.kind === "folder") {
    throw new Error("Folders cannot be downloaded");
  }

  const held = await acquireFtp(credentials, signal);
  if (signal.aborted) {
    held.release();
    signal.throwIfAborted();
  }
  const pass = new PassThrough();
  let ended = false;
  let finished = false;
  pass.once("end", () => {
    ended = true;
  });
  const transfer = (async () => {
    try {
      await held.client.downloadTo(pass, serverPath(credentials, held, entry.id));
      finished = true;
    } catch (err) {
      pass.destroy(err instanceof Error ? err : new Error(String(err)));
    }
  })();
  signal.addEventListener("abort", () => held.discard(), { once: true });

  return {
    name: entry.name,
    size: entry.size,
    mimeType: entry.mimeType,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Node's web streams are the global ReadableStream at runtime; @types/node and lib.dom declare them separately
    body: Readable.toWeb(pass) as ReadableStream<Uint8Array>,
    release() {
      if (!ended) {
        held.discard();
        return;
      }
      void transfer.then(() => (finished ? held.release() : held.discard()));
    },
  };
}

async function createUploadSession(
  _credentials: FtpCredentials,
  upload: NewUpload,
  scope: RelayScope | undefined,
): Promise<DriveUploadSession> {
  folderPrefix(upload.parentId);
  checkName(upload.name);
  return relayUploadSession(scope, upload);
}

async function writeStream(
  credentials: FtpCredentials,
  upload: NewUpload,
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): Promise<DriveEntry> {
  const id = `${folderPrefix(upload.parentId)}${checkName(upload.name)}`;
  const existed = (await findEntry(credentials, id)) !== null;

  const held = await acquireFtp(credentials, signal);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the global ReadableStream is Node's web stream at runtime; @types/node and lib.dom declare them separately
  const source = Readable.fromWeb(body as NodeReadableStream<Uint8Array>);
  const abort = () => held.client.close();
  source.once("error", abort);
  signal.addEventListener("abort", abort, { once: true });

  try {
    await held.client.uploadFrom(source, serverPath(credentials, held, id));
    held.release();
  } catch (err) {
    held.discard();
    if (!existed) {
      await withFtp(credentials, (cleanup) =>
        cleanup.client.remove(serverPath(credentials, cleanup, id), true),
      ).catch(() => {});
    }
    throw err;
  } finally {
    signal.removeEventListener("abort", abort);
  }
  return getEntry(credentials, id);
}

async function createFolder(
  credentials: FtpCredentials,
  parentId: string | null,
  name: string,
): Promise<DriveEntry> {
  const id = `${folderPrefix(parentId)}${checkName(name)}/`;
  if (await findEntry(credentials, id)) {
    throw new Error("A file or folder with that name already exists");
  }
  await withFtp(credentials, (held) =>
    held.client.send(`MKD ${serverPath(credentials, held, id)}`),
  );
  return getEntry(credentials, id);
}

async function relocate(
  credentials: FtpCredentials,
  fileId: string,
  destination: string,
): Promise<void> {
  const source = checkId(fileId);
  const target = checkId(destination);
  if (source === target) return;
  if (source.endsWith("/") && target.startsWith(source)) {
    throw new Error("A folder cannot be moved into itself");
  }
  if (await findEntry(credentials, target)) {
    throw new Error("A file or folder with that name already exists there");
  }
  await withFtp(credentials, (held) =>
    held.client.rename(
      serverPath(credentials, held, source),
      serverPath(credentials, held, target),
    ),
  );
}

async function rename(credentials: FtpCredentials, fileId: string, name: string): Promise<void> {
  const parent = parentOf(checkId(fileId)) ?? "";
  const folder = fileId.endsWith("/");
  await relocate(credentials, fileId, `${parent}${checkName(name)}${folder ? "/" : ""}`);
}

async function move(
  credentials: FtpCredentials,
  fileId: string,
  newParentId: string | null,
): Promise<void> {
  const id = checkId(fileId);
  const folder = id.endsWith("/");
  await relocate(credentials, id, `${folderPrefix(newParentId)}${nameOf(id)}${folder ? "/" : ""}`);
}

async function deleteEntry(credentials: FtpCredentials, fileId: string): Promise<void> {
  const id = checkId(fileId);
  await withFtp(credentials, async (held) => {
    const path = serverPath(credentials, held, id);
    if (id.endsWith("/")) await held.client.removeDir(path);
    else await held.client.remove(path);
  });
}

async function quota(): Promise<DriveQuota | null> {
  return null;
}

export async function ftpVerify(credentials: FtpCredentials): Promise<void> {
  try {
    await withFtp(credentials, async (held) => {
      const path = serverPath(credentials, held, "");
      await held.client.cd(path);
      await held.client.list(path);
    });
  } catch (err) {
    if (err instanceof FTPError && err.code === 550) {
      throw new Error(
        credentials.root
          ? `The folder "${credentials.root}" does not exist on that server`
          : "That login has no readable home folder",
        { cause: err },
      );
    }
    throw err;
  }
}
