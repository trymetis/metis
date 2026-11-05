import "server-only";
import crypto from "node:crypto";

import { ImapFlow } from "imapflow";

import type { ImapCredentials, MailEndpoint } from "@/connections/types";
import { keysOf } from "@/lib/guards";
import type { MailFolder } from "@/types/mail";

const IDLE_MS = 5 * 60_000;
const CONNECT_TIMEOUT_MS = 20_000;

export type FolderMap = Record<MailFolder, string | null>;

export const SEARCH_FOLDERS: MailFolder[] = ["inbox", "archive", "sent"];

interface Entry {
  client: ImapFlow;
  folders: FolderMap | null;
  idle: NodeJS.Timeout | null;
  leases: number;
  serverId: string;
  settings: string;
}

const pool = new Map<string, Entry>();
const connecting = new Map<string, Promise<Entry>>();

function poolKey(credentials: ImapCredentials): string {
  const material = JSON.stringify([
    credentials.imap.host,
    credentials.imap.port,
    credentials.imap.secure,
    credentials.imap.plain,
    credentials.user,
    credentials.pass,
    credentials.allowInsecureTls,
  ]);
  return crypto.createHash("sha256").update(material).digest("hex");
}

export function imapSettingsKey(server: { imap: MailEndpoint; allowInsecureTls: boolean }): string {
  return JSON.stringify([
    server.imap.host,
    server.imap.port,
    server.imap.secure,
    server.imap.plain,
    server.allowInsecureTls,
  ]);
}

export function requiresStartTls(endpoint: MailEndpoint): boolean {
  return !endpoint.secure && !endpoint.plain;
}

function imapClient(credentials: ImapCredentials): ImapFlow {
  return new ImapFlow({
    host: credentials.imap.host,
    port: credentials.imap.port,
    secure: credentials.imap.secure,
    doSTARTTLS: requiresStartTls(credentials.imap) || undefined,
    auth: { user: credentials.user, pass: credentials.pass },
    logger: false,
    tls: { rejectUnauthorized: !credentials.allowInsecureTls },
    connectionTimeout: CONNECT_TIMEOUT_MS,
    greetingTimeout: CONNECT_TIMEOUT_MS,
  });
}

export function retireImapServers(current: Map<string, string>): void {
  for (const [key, entry] of pool) {
    if (current.get(entry.serverId) === entry.settings) continue;
    pool.delete(key);
    if (entry.idle) clearTimeout(entry.idle);
    entry.idle = null;
    if (entry.leases === 0) {
      entry.client.logout().catch(() => entry.client.close());
    }
  }
}

const SPECIAL_USE: Partial<Record<MailFolder, string[]>> = {
  sent: ["\\Sent"],
  drafts: ["\\Drafts"],
  trash: ["\\Trash"],
  spam: ["\\Junk"],
  archive: ["\\Archive", "\\All"],
};

const NAME_FALLBACK: Partial<Record<MailFolder, RegExp>> = {
  sent: /^(sent|sent items|sent mail)$/i,
  drafts: /^drafts?$/i,
  trash: /^(trash|deleted|deleted items|bin)$/i,
  spam: /^(junk|spam|junk e-?mail)$/i,
  archive: /^(archive|all mail|archives)$/i,
};

async function discoverFolders(client: ImapFlow): Promise<FolderMap> {
  const boxes = await client.list();

  const map: FolderMap = {
    inbox: "INBOX",
    sent: null,
    drafts: null,
    trash: null,
    archive: null,
    spam: null,
    starred: null,
  };

  for (const folder of keysOf(SPECIAL_USE)) {
    const flags = SPECIAL_USE[folder] ?? [];
    const bySpecialUse = boxes.find((box) => box.specialUse && flags.includes(box.specialUse));
    if (bySpecialUse) {
      map[folder] = bySpecialUse.path;
      continue;
    }
    const pattern = NAME_FALLBACK[folder];
    const byName = pattern
      ? boxes.find((box) => pattern.test(box.name) || pattern.test(box.path))
      : undefined;
    if (byName) map[folder] = byName.path;
  }

  return map;
}

function scheduleEviction(key: string, entry: Entry) {
  if (entry.idle) clearTimeout(entry.idle);
  entry.idle = setTimeout(() => {
    if (entry.leases > 0) return;
    pool.delete(key);
    entry.client.logout().catch(() => entry.client.close());
  }, IDLE_MS);
  entry.idle.unref?.();
}

function drop(key: string, entry: Entry) {
  if (pool.get(key) === entry) pool.delete(key);
  if (entry.idle) clearTimeout(entry.idle);
  try {
    entry.client.close();
  } catch {}
}

async function openEntry(key: string, credentials: ImapCredentials): Promise<Entry> {
  const client = imapClient(credentials);

  const entry: Entry = {
    client,
    folders: null,
    idle: null,
    leases: 0,
    serverId: credentials.serverId,
    settings: imapSettingsKey(credentials),
  };
  client.on("error", () => drop(key, entry));
  client.on("close", () => drop(key, entry));

  await client.connect();
  pool.set(key, entry);
  return entry;
}

async function acquire(credentials: ImapCredentials): Promise<Entry> {
  const key = poolKey(credentials);
  const existing = pool.get(key);
  if (existing?.client.usable) {
    if (existing.idle) clearTimeout(existing.idle);
    existing.idle = null;
    return existing;
  }
  if (existing) drop(key, existing);

  const inFlight = connecting.get(key);
  if (inFlight) return inFlight;

  const pending = openEntry(key, credentials);
  connecting.set(key, pending);
  try {
    return await pending;
  } finally {
    connecting.delete(key);
  }
}

type MailboxLock = Awaited<ReturnType<ImapFlow["getMailboxLock"]>>;

export interface ImapContext {
  client: ImapFlow;
  folders: FolderMap;
  path(folder: MailFolder): string;
  lock(path: string): Promise<MailboxLock>;
}

async function lockMailbox(client: ImapFlow, path: string): Promise<MailboxLock> {
  const selected = client.mailbox !== false && client.mailbox.path === path;
  const lock = await client.getMailboxLock(path);
  if (selected) {
    try {
      await client.noop();
    } catch (err) {
      lock.release();
      throw err;
    }
  }
  return lock;
}

export async function withImap<T>(
  credentials: ImapCredentials,
  run: (ctx: ImapContext) => Promise<T>,
): Promise<T> {
  const key = poolKey(credentials);
  const entry = await acquire(credentials);
  entry.leases += 1;

  try {
    entry.folders ??= await discoverFolders(entry.client);
    const folders = entry.folders;

    const ctx: ImapContext = {
      client: entry.client,
      folders,
      path(folder) {
        const resolved = folders[folder];
        if (!resolved) {
          entry.folders = null;
          throw new Error(
            `This mail server has no ${folder} folder — the server does not advertise one.`,
          );
        }
        return resolved;
      },
      lock: (path) => lockMailbox(entry.client, path),
    };

    return await run(ctx);
  } catch (err) {
    if (!entry.client.usable) drop(key, entry);
    throw err;
  } finally {
    entry.leases -= 1;
    if (entry.leases === 0) {
      if (pool.get(key) === entry) scheduleEviction(key, entry);
      else if (entry.client.usable) {
        entry.client.logout().catch(() => entry.client.close());
      }
    }
  }
}

export async function withImapMailbox<T>(
  credentials: ImapCredentials,
  folder: MailFolder,
  run: (ctx: ImapContext, path: string) => Promise<T>,
): Promise<T> {
  return withImap(credentials, async (ctx) => {
    const path = ctx.path(folder);
    const lock = await ctx.lock(path);
    try {
      return await run(ctx, path);
    } finally {
      lock.release();
    }
  });
}

export async function withImapPath<T>(
  credentials: ImapCredentials,
  path: string,
  run: (ctx: ImapContext) => Promise<T>,
): Promise<T> {
  return withImap(credentials, async (ctx) => {
    const lock = await ctx.lock(path);
    try {
      return await run(ctx);
    } finally {
      lock.release();
    }
  });
}

export async function verifyImap(credentials: ImapCredentials): Promise<void> {
  const client = imapClient(credentials);
  try {
    await client.connect();
    await client.list();
  } finally {
    await client.logout().catch(() => client.close());
  }
}
