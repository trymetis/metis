import { posix } from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import type { FileInfo } from "ssh2-sftp-client";

import type { SftpCredentials } from "@/connections/types";
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

import { acquireSftp, type SftpSession, withSftp } from "./client";

export function sftpDrive(
  credentials: SftpCredentials,
  scope: RelayScope | undefined,
): DriveAdapter {
  return bind<DriveAdapter, SftpCredentials>(
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
const OUTSIDE = "That path is not available on this server";

function checkId(id: string): string {
  const trimmed = id.endsWith("/") ? id.slice(0, -1) : id;
  const parts = trimmed.split("/");
  if (
    !trimmed ||
    id.startsWith("/") ||
    /[\0\\]/.test(id) ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(OUTSIDE);
  }
  return id;
}

function checkName(name: string): string {
  if (!name || name === "." || name === ".." || /[/\0\\]/.test(name)) {
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

function topAncestor(_credentials: SftpCredentials, fileId: string): string {
  return topOfPath(checkId(fileId));
}

function parentOf(id: string): string | null {
  const trimmed = id.endsWith("/") ? id.slice(0, -1) : id;
  const cut = trimmed.lastIndexOf("/");
  return cut === -1 ? null : trimmed.slice(0, cut + 1);
}

function fullPath(credentials: SftpCredentials, session: SftpSession, id: string): string {
  const joined = posix.join(session.home, credentials.root ?? "", id);
  return joined.length > 1 ? joined.replace(/\/+$/, "") : joined;
}

const rootReals = new WeakMap<SftpSession, Map<string, string>>();

async function rootReal(credentials: SftpCredentials, session: SftpSession): Promise<string> {
  let cache = rootReals.get(session);
  if (!cache) {
    cache = new Map();
    rootReals.set(session, cache);
  }
  const root = credentials.root ?? "";
  const known = cache.get(root);
  if (known) return known;
  const real = await session.client.realPath(fullPath(credentials, session, ""));
  if (!real) throw new ProviderError("sftp", 404, "", "SFTP");
  cache.set(root, real);
  return real;
}

function within(real: string, root: string): boolean {
  if (root === "/") return real.startsWith("/");
  return real === root || real.startsWith(`${root}/`);
}

async function resolvesInside(
  credentials: SftpCredentials,
  session: SftpSession,
  path: string,
): Promise<boolean> {
  const real = await session.client.realPath(path).catch(() => "");
  return !!real && within(real, await rootReal(credentials, session));
}

async function assertInside(
  credentials: SftpCredentials,
  session: SftpSession,
  id: string,
): Promise<void> {
  if (!(await resolvesInside(credentials, session, fullPath(credentials, session, id)))) {
    throw new Error(OUTSIDE);
  }
}

function toEntry(id: string, info: { size: number; modifyTime: number }): DriveEntry {
  const folder = id.endsWith("/");
  return {
    id,
    name: nameOf(id),
    kind: folder ? "folder" : "file",
    mimeType: folder ? null : mimeFromName(nameOf(id)),
    size: folder ? null : info.size,
    modifiedAt: info.modifyTime ? new Date(info.modifyTime).toISOString() : null,
    parentId: parentOf(id),
    webUrl: null,
    native: false,
  };
}

async function entriesIn(
  credentials: SftpCredentials,
  session: SftpSession,
  prefix: string,
  listing: FileInfo[],
): Promise<DriveEntry[]> {
  const entries: DriveEntry[] = [];
  for (const info of listing) {
    if (!info.name || info.name === "." || info.name === "..") continue;
    if (info.type === "d") {
      entries.push(toEntry(`${prefix}${info.name}/`, info));
      continue;
    }
    if (info.type === "-") {
      entries.push(toEntry(`${prefix}${info.name}`, info));
      continue;
    }
    if (info.type !== "l") continue;

    const path = fullPath(credentials, session, `${prefix}${info.name}`);
    /* oxlint-disable eslint/no-await-in-loop -- ssh2-sftp-client advises against parallel operations on one connection */
    if (!(await resolvesInside(credentials, session, path))) continue;
    const stats = await session.client.stat(path).catch(() => null);
    /* oxlint-enable eslint/no-await-in-loop */
    if (!stats) continue;
    entries.push(toEntry(`${prefix}${info.name}${stats.isDirectory ? "/" : ""}`, stats));
  }
  return entries;
}

async function listFolder(
  credentials: SftpCredentials,
  parentId: string | null,
): Promise<DriveListing> {
  const prefix = folderPrefix(parentId);
  return withSftp(credentials, async (session) => {
    if (prefix) await assertInside(credentials, session, prefix);
    const listing = await session.client.list(fullPath(credentials, session, prefix));
    return {
      entries: await entriesIn(credentials, session, prefix, listing),
      cursor: null,
    };
  });
}

async function search(credentials: SftpCredentials, query: string): Promise<DriveListing> {
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

async function statEntry(
  credentials: SftpCredentials,
  session: SftpSession,
  fileId: string,
): Promise<DriveEntry | null> {
  const id = checkId(fileId);
  const path = fullPath(credentials, session, id);
  if (!(await resolvesInside(credentials, session, path))) return null;
  const stats = await session.client.stat(path).catch(() => null);
  if (!stats) return null;
  const clean = id.replace(/\/+$/, "");
  return toEntry(stats.isDirectory ? `${clean}/` : clean, stats);
}

async function getEntry(credentials: SftpCredentials, fileId: string): Promise<DriveEntry> {
  const entry = await withSftp(credentials, (session) => statEntry(credentials, session, fileId));
  if (!entry) throw new ProviderError("sftp", 404, "", "SFTP");
  return entry;
}

async function getDownloadTarget(
  credentials: SftpCredentials,
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
  credentials: SftpCredentials,
  fileId: string,
  signal: AbortSignal,
): Promise<DriveStream> {
  const entry = await getEntry(credentials, fileId);
  if (entry.kind === "folder") {
    throw new Error("Folders cannot be downloaded");
  }

  const held = await acquireSftp(credentials, signal);
  try {
    signal.throwIfAborted();
    await assertInside(credentials, held.session, entry.id);
  } catch (err) {
    held.release();
    throw err;
  }
  const source = held.session.client.createReadStream(
    fullPath(credentials, held.session, entry.id),
  );
  let ended = false;
  source.once("end", () => {
    ended = true;
  });
  const stop = () => source.destroy();
  signal.addEventListener("abort", stop, { once: true });

  return {
    name: entry.name,
    size: entry.size,
    mimeType: entry.mimeType,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Node's web streams are the global ReadableStream at runtime; @types/node and lib.dom declare them separately
    body: Readable.toWeb(source) as ReadableStream<Uint8Array>,
    release() {
      signal.removeEventListener("abort", stop);
      if (ended) {
        held.release();
        return;
      }
      source.destroy();
      held.discard();
    },
  };
}

async function ownType(session: SftpSession, path: string): Promise<"d" | "-" | "l" | null> {
  const name = posix.basename(path);
  const listing = await session.client
    .list(posix.dirname(path), (info) => info.name === name)
    .catch(() => []);
  const type = listing[0]?.type;
  return type === "d" || type === "-" || type === "l" ? type : null;
}

async function createUploadSession(
  _credentials: SftpCredentials,
  upload: NewUpload,
  scope: RelayScope | undefined,
): Promise<DriveUploadSession> {
  folderPrefix(upload.parentId);
  checkName(upload.name);
  return relayUploadSession(scope, upload);
}

async function writeStream(
  credentials: SftpCredentials,
  upload: NewUpload,
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): Promise<DriveEntry> {
  const prefix = folderPrefix(upload.parentId);
  const id = `${prefix}${checkName(upload.name)}`;

  await withSftp(credentials, async (session) => {
    if (prefix) await assertInside(credentials, session, prefix);
    const path = fullPath(credentials, session, id);
    const existing = await ownType(session, path);
    if (existing === "l" && !(await resolvesInside(credentials, session, path))) {
      throw new Error(OUTSIDE);
    }

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the global ReadableStream is Node's web stream at runtime; @types/node and lib.dom declare them separately
    const source = Readable.fromWeb(body as NodeReadableStream<Uint8Array>);
    const stop = () => source.destroy(new Error("Upload aborted"));
    signal.addEventListener("abort", stop, { once: true });
    try {
      await session.client.put(source, path);
    } catch (err) {
      if (!existing) await session.client.delete(path, true).catch(() => {});
      throw err;
    } finally {
      signal.removeEventListener("abort", stop);
    }
  });
  return getEntry(credentials, id);
}

async function createFolder(
  credentials: SftpCredentials,
  parentId: string | null,
  name: string,
): Promise<DriveEntry> {
  const prefix = folderPrefix(parentId);
  const id = `${prefix}${checkName(name)}/`;
  await withSftp(credentials, async (session) => {
    if (prefix) await assertInside(credentials, session, prefix);
    const path = fullPath(credentials, session, id);
    if (await ownType(session, path)) {
      throw new Error("A file or folder with that name already exists");
    }
    await session.client.mkdir(path);
  });
  return getEntry(credentials, id);
}

async function relocate(
  credentials: SftpCredentials,
  fileId: string,
  destination: string,
): Promise<void> {
  const source = checkId(fileId);
  const target = checkId(destination);
  if (source === target) return;
  if (source.endsWith("/") && target.startsWith(source)) {
    throw new Error("A folder cannot be moved into itself");
  }

  await withSftp(credentials, async (session) => {
    await assertInside(credentials, session, source);
    const targetParent = parentOf(target);
    if (targetParent) await assertInside(credentials, session, targetParent);
    const targetPath = fullPath(credentials, session, target);
    if (await ownType(session, targetPath)) {
      throw new Error("A file or folder with that name already exists there");
    }
    await session.client.rename(fullPath(credentials, session, source), targetPath);
  });
}

async function rename(credentials: SftpCredentials, fileId: string, name: string): Promise<void> {
  const parent = parentOf(checkId(fileId)) ?? "";
  const folder = fileId.endsWith("/");
  await relocate(credentials, fileId, `${parent}${checkName(name)}${folder ? "/" : ""}`);
}

async function move(
  credentials: SftpCredentials,
  fileId: string,
  newParentId: string | null,
): Promise<void> {
  const id = checkId(fileId);
  const folder = id.endsWith("/");
  await relocate(credentials, id, `${folderPrefix(newParentId)}${nameOf(id)}${folder ? "/" : ""}`);
}

async function deleteEntry(credentials: SftpCredentials, fileId: string): Promise<void> {
  const id = checkId(fileId);
  await withSftp(credentials, async (session) => {
    const path = fullPath(credentials, session, id);
    const parent = parentOf(id);
    if (parent) await assertInside(credentials, session, parent);
    const kind = await ownType(session, path);
    if (!kind) throw new ProviderError("sftp", 404, "", "SFTP");
    if (kind === "l") {
      await session.client.delete(path);
      return;
    }
    await assertInside(credentials, session, id);
    if (kind === "d") await session.client.rmdir(path, true);
    else await session.client.delete(path);
  });
}

async function quota(): Promise<DriveQuota | null> {
  return null;
}

export async function sftpVerify(credentials: SftpCredentials): Promise<void> {
  await withSftp(credentials, async (session) => {
    const real = await session.client.realPath(fullPath(credentials, session, "")).catch(() => "");
    const stats = real ? await session.client.stat(real).catch(() => null) : null;
    if (!stats?.isDirectory) {
      throw new Error(
        credentials.root
          ? `The folder "${credentials.root}" does not exist on that server`
          : "That login has no readable home folder",
      );
    }
  });
}
