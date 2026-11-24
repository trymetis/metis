import type { Query, QueryKey } from "@tanstack/react-query";
import { Dexie, type EntityTable } from "dexie";

import { rpc } from "./orpc";
import { getQueryClient, refreshQuery } from "./query-client";

export interface ShellCacheOwner {
  userId: string;
  version: string;
}

interface CachedQuery {
  hash: string;
  queryKey: QueryKey;
  data: unknown;
  updatedAt: number;
}

interface CacheOwnerRow extends ShellCacheOwner {
  id: "owner";
}

const DB_NAME = "metis-shell-cache";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const CACHED_QUERIES = new Set(
  [
    rpc.user.getPreferences.key(),
    rpc.workspaces.list.key(),
    rpc.workspaceMailboxes.list.key(),
    rpc.workspaceCalendars.list.key(),
    rpc.workspaceDrives.list.key(),
    rpc.workspaceAddressBooks.list.key(),
    rpc.mail.customLabels.list.key(),
    rpc.calendarEvents.calendars.key(),
    rpc.drive.pins.key(),
    rpc.drive.quotas.key(),
    rpc.contacts.books.key(),
    rpc.assistant.listThreads.key(),
    rpc.workflows.list.key(),
    rpc.search.saved.list.key(),
  ].map(([path]) => path.join(".")),
);

const ROOT_FOLDER_LIST = rpc.drive.list.key()[0].join(".");

class ShellCacheDb extends Dexie {
  queries!: EntityTable<CachedQuery, "hash">;
  owner!: EntityTable<CacheOwnerRow, "id">;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({ queries: "hash, updatedAt", owner: "id" });
  }
}

let database: ShellCacheDb | null = null;
let generation = 0;

function shellDb(): ShellCacheDb | null {
  if (typeof indexedDB === "undefined") return null;
  database ??= new ShellCacheDb();
  return database;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function operation(queryKey: QueryKey): { path: string; type: unknown; input: unknown } | null {
  const [path, state] = queryKey;
  if (!Array.isArray(path) || !path.every((part) => typeof part === "string")) return null;
  if (!isRecord(state)) return null;
  return { path: path.join("."), type: state.type, input: state.input };
}

function firstPage(data: unknown): unknown {
  if (!isRecord(data) || !Array.isArray(data.pages) || !Array.isArray(data.pageParams)) {
    return undefined;
  }
  return { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) };
}

function cachedData(query: Query): unknown {
  const op = operation(query.queryKey);
  const data = query.state.data;
  if (!op || data === undefined) return undefined;
  if (op.type === "query" && CACHED_QUERIES.has(op.path)) return data;
  if (
    op.type === "infinite" &&
    op.path === ROOT_FOLDER_LIST &&
    isRecord(op.input) &&
    op.input.parentId === null
  ) {
    return firstPage(data);
  }
  return undefined;
}

async function readRows(db: ShellCacheDb, owner: ShellCacheOwner): Promise<CachedQuery[]> {
  return db.transaction("rw", db.queries, db.owner, async () => {
    const stored = await db.owner.get("owner");
    if (stored?.userId !== owner.userId || stored.version !== owner.version) {
      await db.queries.clear();
      await db.owner.put({ id: "owner", userId: owner.userId, version: owner.version });
      return [];
    }
    await db.queries
      .where("updatedAt")
      .below(Date.now() - MAX_AGE_MS)
      .delete();
    return db.queries.toArray();
  });
}

function attach(db: ShellCacheDb, rows: CachedQuery[], run: number): () => void {
  const client = getQueryClient();
  const cache = client.getQueryCache();
  const stored = new Map(rows.map((row) => [row.hash, row]));
  let seeding = false;

  function seed(query: Query): boolean {
    const row = stored.get(query.queryHash);
    if (!row || query.state.data !== undefined) return false;
    seeding = true;
    try {
      client.setQueryData(row.queryKey, row.data, { updatedAt: row.updatedAt });
    } finally {
      seeding = false;
    }
    void client.invalidateQueries({ queryKey: row.queryKey, exact: true, refetchType: "none" });
    return true;
  }

  for (const query of cache.getAll()) {
    if (query.getObserversCount() === 0 || !seed(query)) continue;
    if (query.state.fetchStatus !== "fetching") void refreshQuery(query.queryKey);
  }

  return cache.subscribe((event) => {
    if (run !== generation) return;
    if (event.type === "observerAdded") {
      seed(event.query);
      return;
    }
    if (seeding || event.type !== "updated" || event.action.type !== "success") return;
    const data = cachedData(event.query);
    if (data === undefined) return;
    const row = {
      hash: event.query.queryHash,
      queryKey: event.query.queryKey,
      data,
      updatedAt: event.query.state.dataUpdatedAt,
    };
    stored.set(row.hash, row);
    db.queries.put(row).catch(() => {});
  });
}

export function startShellCache(owner: ShellCacheOwner): () => void {
  const run = generation;
  let stopped = false;
  let unsubscribe: (() => void) | null = null;
  const db = shellDb();
  if (!db) return () => {};
  readRows(db, owner).then(
    (rows) => {
      if (stopped || run !== generation) return;
      unsubscribe = attach(db, rows, run);
    },
    () => {},
  );
  return () => {
    stopped = true;
    unsubscribe?.();
  };
}

export async function clearShellCache(): Promise<void> {
  generation++;
  const db = shellDb();
  if (!db) return;
  try {
    await db.delete({ disableAutoOpen: false });
  } catch {}
}
