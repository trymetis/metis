import { z } from "zod";

import type { ConnectionAuth, DriveProvider } from "@/connections";
import { BadRequestError } from "@/lib/errors/bad-request";
import { NotVisibleError } from "@/lib/errors/not-visible";
import { ProviderError } from "@/lib/errors/provider-error";
import { sanitizeError } from "@/lib/errors/sanitize-error";
import { type TagToken, tagKey, tagText } from "@/search/ast";
import { bindTags } from "@/search/pushdown";
import type { AstSearch } from "@/search/types";
import type {
  DriveDownloadTarget,
  DriveEntry,
  DriveSourceError,
  DriveUploadSession,
  NewUpload,
  TaggedDriveEntry,
  TaggedDriveListing,
} from "@/types/drive";

import { type DriveAdapter, getDriveAdapter } from "./adapter";
import { driveName } from "./name";

const MAX_DEPTH = 32;

export interface ResolvedDrive {
  driveId: string;
  linkId: string;
  driveSlug: string;
  email: string;
  server: string | null;
  userId: string;
  ownerUserId: string;
  provider: DriveProvider;
  visibleRootIds: string[];
  policy: { ai: boolean };
  auth: () => Promise<ConnectionAuth>;
}

export async function adapterForDrive(account: ResolvedDrive): Promise<DriveAdapter> {
  return getDriveAdapter(account.provider, await account.auth(), account.email, {
    userId: account.userId,
    driveId: account.driveId,
  });
}

export class DriveNotVisibleError extends NotVisibleError {
  constructor(message: string) {
    super(message, "We couldn't find that.");
  }
}

export function isDriveTag(
  token: TagToken,
  account: Pick<ResolvedDrive, "driveSlug" | "email">,
): boolean {
  const value = (tagText(token) ?? "").toLowerCase();
  return value === account.driveSlug.toLowerCase() || value === account.email.toLowerCase();
}

export function compositeDriveId(driveId: string, fileId: string): string {
  return `${driveId}:${fileId}`;
}

export function splitCompositeId(id: string): {
  driveId: string;
  fileId: string | null;
} {
  const sep = id.indexOf(":");
  if (sep === -1) throw new Error("That file id is not scoped to a drive");
  const fileId = id.slice(sep + 1);
  return { driveId: id.slice(0, sep), fileId: fileId === "" ? null : fileId };
}

export function isRootVisible(account: ResolvedDrive, rootId: string | null): boolean {
  if (account.visibleRootIds.length === 0) return true;
  if (!rootId) return false;
  return account.visibleRootIds.includes(rootId);
}

export function resolveDriveAccount(accounts: ResolvedDrive[], driveId?: string): ResolvedDrive {
  if (!driveId) {
    const only = accounts.length === 1 ? accounts[0] : null;
    if (!only) throw new BadRequestError("Pick which drive to use");
    return only;
  }
  const found = accounts.find((a) => a.driveId === driveId);
  if (!found) {
    throw new Error(
      `Unknown drive ${driveId} — available: ${accounts.map((a) => a.driveId).join(", ")}`,
    );
  }
  return found;
}

export interface DriveSurface {
  isAggregate: boolean;
  drives: ResolvedDrive[];
  listFolder(parentId: string | null, cursor?: string): Promise<TaggedDriveListing>;
  search(query: string, cursor?: string): Promise<TaggedDriveListing>;
  searchAst(search: AstSearch<TaggedDriveEntry>): Promise<TaggedDriveListing>;
  getEntry(fileId: string): Promise<TaggedDriveEntry>;
  getDownloadTarget(fileId: string): Promise<DriveDownloadTarget>;
  createUploadSession(
    parentId: string | null,
    upload: Omit<NewUpload, "parentId">,
  ): Promise<DriveUploadSession>;
  writeStream(
    parentId: string | null,
    upload: Omit<NewUpload, "parentId">,
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal,
  ): Promise<TaggedDriveEntry>;
  createFolder(parentId: string | null, name: string): Promise<TaggedDriveEntry>;
  rename(fileId: string, name: string): Promise<void>;
  move(fileId: string, newParentId: string | null): Promise<void>;
  delete(fileId: string): Promise<void>;
}

export function sourceError(account: ResolvedDrive, err: unknown): DriveSourceError {
  return {
    driveId: account.driveId,
    driveSlug: account.driveSlug,
    email: account.email,
    message: sanitizeError(err),
  };
}

interface DriveScope {
  account: ResolvedDrive;
  client(): Promise<DriveAdapter>;
  tag(entry: DriveEntry): TaggedDriveEntry;
  assertVisible(fileId: string | null): Promise<void>;
  visibleOnly(entries: DriveEntry[]): Promise<VisibleEntries>;
}

interface VisibleEntries {
  entries: DriveEntry[];
  error: DriveSourceError | null;
}

function createScope(account: ResolvedDrive, composite: boolean, strict = false): DriveScope {
  let adapter: DriveAdapter | null = null;
  const ancestors = new Map<string, string>();

  async function client(): Promise<DriveAdapter> {
    adapter ??= await adapterForDrive(account);
    return adapter;
  }

  async function topAncestor(fileId: string, parentId?: string | null): Promise<string> {
    const drive = await client();
    if (drive.topAncestor) return drive.topAncestor(fileId);
    if (parentId === null) return fileId;
    const chain: string[] = parentId === undefined ? [] : [fileId];
    let current = parentId ?? fileId;

    for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
      const known = ancestors.get(current);
      if (known) {
        for (const id of chain) ancestors.set(id, known);
        return known;
      }

      chain.push(current);
      // oxlint-disable-next-line eslint/no-await-in-loop -- walks up one parent at a time; each step needs the previous entry's parentId
      const entry = await drive.getEntry(current);
      if (!entry.parentId) {
        for (const id of chain) ancestors.set(id, current);
        return current;
      }
      current = entry.parentId;
    }

    throw new Error("That folder is nested too deeply to check");
  }

  return {
    account,
    client,

    tag(entry) {
      return {
        ...entry,
        id: composite ? compositeDriveId(account.driveId, entry.id) : entry.id,
        parentId:
          composite && entry.parentId
            ? compositeDriveId(account.driveId, entry.parentId)
            : entry.parentId,
        driveId: account.driveId,
        driveSlug: account.driveSlug,
      };
    },

    async assertVisible(fileId) {
      if (account.visibleRootIds.length === 0) return;
      if (!fileId) {
        throw new DriveNotVisibleError("That folder is not available in this workspace");
      }
      if (!isRootVisible(account, await topAncestor(fileId))) {
        throw new DriveNotVisibleError("That file is not available in this workspace");
      }
    },

    async visibleOnly(entries) {
      if (account.visibleRootIds.length === 0) return { entries, error: null };

      const failures: unknown[] = [];
      const checked = await Promise.all(
        entries.map(async (entry) => {
          try {
            return isRootVisible(account, await topAncestor(entry.id, entry.parentId))
              ? entry
              : null;
          } catch (err) {
            if (!(err instanceof ProviderError && err.status === 404)) failures.push(err);
            return null;
          }
        }),
      );
      if (strict && failures.length > 0) throw failures[0];
      return {
        entries: checked.filter((entry) => entry !== null),
        error: failures.length > 0 ? sourceError(account, failures[0]) : null,
      };
    },
  };
}

function singleSurface(scope: DriveScope): Omit<DriveSurface, "isAggregate" | "drives"> {
  return {
    async listFolder(parentId, cursor) {
      const adapter = await scope.client();
      if (parentId === null) {
        const listing = await adapter.listFolder(null, cursor);
        return {
          entries: listing.entries
            .filter((entry) => isRootVisible(scope.account, entry.id))
            .map((entry) => scope.tag(entry)),
          cursor: listing.cursor,
        };
      }

      await scope.assertVisible(parentId);
      const listing = await adapter.listFolder(parentId, cursor);
      return {
        entries: listing.entries.map((entry) => scope.tag(entry)),
        cursor: listing.cursor,
      };
    },

    async search(query, cursor) {
      const adapter = await scope.client();
      const listing = await adapter.search(query, cursor);
      const visible = await scope.visibleOnly(listing.entries);
      return {
        entries: visible.entries.map((entry) => scope.tag(entry)),
        cursor: listing.cursor,
        driveErrors: visible.error ? [visible.error] : undefined,
      };
    },

    async searchAst(search) {
      if (search.query === false) return { entries: [], cursor: null };
      const adapter = await scope.client();
      const errors: DriveSourceError[] = [];
      const listing = await adapter.searchAst({
        query: search.query,
        timeZone: search.timeZone,
        cursor: search.cursor,
        accept: async (residual, entries) => {
          const visible = await scope.visibleOnly(entries);
          if (visible.error && errors.length === 0) errors.push(visible.error);
          return search.accept(
            residual,
            visible.entries.map((entry) => scope.tag(entry)),
          );
        },
      });
      return {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a provider returns the entries accept() produced, which this scope tagged; DriveAdapter.searchAst is typed on plain DriveEntry
        entries: listing.entries as TaggedDriveEntry[],
        cursor: listing.cursor,
        driveErrors: errors.length > 0 ? errors : undefined,
      };
    },

    async getEntry(fileId) {
      await scope.assertVisible(fileId);
      const adapter = await scope.client();
      return scope.tag(await adapter.getEntry(fileId));
    },

    async getDownloadTarget(fileId) {
      await scope.assertVisible(fileId);
      const adapter = await scope.client();
      return adapter.getDownloadTarget(fileId);
    },

    async createUploadSession(parentId, upload) {
      await scope.assertVisible(parentId);
      const adapter = await scope.client();
      return adapter.createUploadSession({ ...upload, parentId });
    },

    async writeStream(parentId, upload, body, signal) {
      await scope.assertVisible(parentId);
      const adapter = await scope.client();
      return scope.tag(await adapter.writeStream({ ...upload, parentId }, body, signal));
    },

    async createFolder(parentId, name) {
      await scope.assertVisible(parentId);
      const adapter = await scope.client();
      return scope.tag(await adapter.createFolder(parentId, name));
    },

    async rename(fileId, name) {
      await scope.assertVisible(fileId);
      const adapter = await scope.client();
      await adapter.rename(fileId, name);
    },

    async move(fileId, newParentId) {
      await scope.assertVisible(fileId);
      await scope.assertVisible(newParentId);
      const adapter = await scope.client();
      await adapter.move(fileId, newParentId);
    },

    async delete(fileId) {
      await scope.assertVisible(fileId);
      const adapter = await scope.client();
      await adapter.delete(fileId);
    },
  };
}

export function driveSurfaceFor(
  account: ResolvedDrive,
  options: { strictVisibility?: boolean } = {},
): DriveSurface {
  const scope = createScope(account, false, options.strictVisibility);
  return { isAggregate: false, drives: [account], ...singleSurface(scope) };
}

const cursorTokensSchema = z.record(z.string(), z.string().nullable());

function decodeCursor(cursor?: string): Record<string, string | null> | null {
  if (!cursor) return null;
  try {
    const parsed = cursorTokensSchema.safeParse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function encodeCursor(tokens: Record<string, string | null>): string | null {
  if (Object.values(tokens).every((token) => token === null)) return null;
  return Buffer.from(JSON.stringify(tokens), "utf8").toString("base64url");
}

function requireFile(id: string): { driveId: string; fileId: string } {
  const { driveId, fileId } = splitCompositeId(id);
  if (!fileId) throw new Error("That is a drive, not a file");
  return { driveId, fileId };
}

export function aggregateDriveSurface(drives: ResolvedDrive[]): DriveSurface {
  const scopes = new Map(
    drives.map((account) => [account.driveId, { scope: createScope(account, true), account }]),
  );

  function surfaceFor(driveId: string) {
    const entry = scopes.get(driveId);
    if (!entry) throw new Error(`Unknown drive ${driveId}`);
    return { ...entry, inner: singleSurface(entry.scope) };
  }

  function forId(id: string) {
    const { driveId, fileId } = splitCompositeId(id);
    return { ...surfaceFor(driveId), fileId };
  }

  return {
    isAggregate: true,
    drives,

    async listFolder(parentId, cursor) {
      if (parentId === null) {
        return {
          entries: drives.map((account) => ({
            id: compositeDriveId(account.driveId, ""),
            name: driveName(account, drives),
            kind: "folder" as const,
            mimeType: null,
            size: null,
            modifiedAt: null,
            parentId: null,
            webUrl: null,
            native: false,
            driveId: account.driveId,
            driveSlug: account.driveSlug,
          })),
          cursor: null,
        };
      }

      const { inner, fileId } = forId(parentId);
      return inner.listFolder(fileId, cursor);
    },

    async search(query, cursor) {
      const tokens = decodeCursor(cursor);
      const next: Record<string, string | null> = {};
      const entries: TaggedDriveEntry[] = [];
      const errors: DriveSourceError[] = [];

      await Promise.all(
        drives.map(async (account) => {
          const token = tokens ? tokens[account.driveId] : undefined;
          if (tokens && !token) {
            next[account.driveId] = null;
            return;
          }

          try {
            const { inner } = surfaceFor(account.driveId);
            const page = await inner.search(query, token ?? undefined);
            entries.push(...page.entries);
            if (page.driveErrors) errors.push(...page.driveErrors);
            next[account.driveId] = page.cursor;
          } catch (err) {
            next[account.driveId] = null;
            errors.push(sourceError(account, err));
          }
        }),
      );

      return {
        entries,
        cursor: encodeCursor(next),
        driveErrors: errors.length > 0 ? errors : undefined,
      };
    },

    async searchAst(search) {
      const tokens = decodeCursor(search.cursor);
      const next: Record<string, string | null> = {};
      const entries: TaggedDriveEntry[] = [];
      const errors: DriveSourceError[] = [];

      await Promise.all(
        drives.map(async (account) => {
          const token = tokens ? tokens[account.driveId] : undefined;
          const query = bindTags(search.query, (tag) =>
            tagKey(tag) === "drive" ? isDriveTag(tag, account) : null,
          );
          if ((tokens && !token) || query === false) {
            next[account.driveId] = null;
            return;
          }
          try {
            const { inner } = surfaceFor(account.driveId);
            const page = await inner.searchAst({
              ...search,
              query,
              cursor: token ?? undefined,
            });
            entries.push(...page.entries);
            if (page.driveErrors) errors.push(...page.driveErrors);
            next[account.driveId] = page.cursor;
          } catch (err) {
            next[account.driveId] = null;
            errors.push(sourceError(account, err));
          }
        }),
      );

      return {
        entries,
        cursor: encodeCursor(next),
        driveErrors: errors.length > 0 ? errors : undefined,
      };
    },

    async getEntry(fileId) {
      const { inner, fileId: id } = forId(fileId);
      if (!id) throw new Error("That is a drive, not a file");
      return inner.getEntry(id);
    },

    async getDownloadTarget(fileId) {
      const { driveId, fileId: id } = requireFile(fileId);
      return surfaceFor(driveId).inner.getDownloadTarget(id);
    },

    async createUploadSession(parentId, upload) {
      if (parentId === null) {
        throw new Error("Pick a drive to upload into");
      }
      const { inner, fileId } = forId(parentId);
      return inner.createUploadSession(fileId, upload);
    },

    async writeStream(parentId, upload, body, signal) {
      if (parentId === null) {
        throw new Error("Pick a drive to upload into");
      }
      const { inner, fileId } = forId(parentId);
      return inner.writeStream(fileId, upload, body, signal);
    },

    async createFolder(parentId, name) {
      if (parentId === null) {
        throw new Error("Pick a drive to create the folder in");
      }
      const { inner, fileId } = forId(parentId);
      return inner.createFolder(fileId, name);
    },

    async rename(fileId, name) {
      const { driveId, fileId: id } = requireFile(fileId);
      await surfaceFor(driveId).inner.rename(id, name);
    },

    async move(fileId, newParentId) {
      const { driveId, fileId: id } = requireFile(fileId);
      if (newParentId === null) {
        throw new Error("Pick a folder to move into");
      }
      const target = splitCompositeId(newParentId);
      if (target.driveId !== driveId) {
        throw new Error("Files cannot be moved between drives");
      }
      await surfaceFor(driveId).inner.move(id, target.fileId);
    },

    async delete(fileId) {
      const { driveId, fileId: id } = requireFile(fileId);
      await surfaceFor(driveId).inner.delete(id);
    },
  };
}
