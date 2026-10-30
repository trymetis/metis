import "server-only";
import type { FetchMessageObject, FetchQueryObject, MessageStructureObject } from "imapflow";
import { createTransport } from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import PostalMime from "postal-mime";

import type { ImapCredentials } from "@/connections/types";
import { smtpLogin } from "@/connections/types";
import { bind } from "@/lib/bind";
import { keysOf } from "@/lib/guards";
import { isPlainTerm, type TagToken, tagKey, tagText } from "@/search/ast";
import { parseSearchDate } from "@/search/dates";
import {
  compileWith,
  type Dialect,
  planPushdown,
  topLevelValues,
  withoutTopLevel,
} from "@/search/pushdown";
import { type AstSearch, SEARCH_PAGE_SIZE } from "@/search/types";
import {
  type Attachment,
  type DraftPayload,
  type Email,
  isMailFolder,
  type MailFolder,
  type MessagesResponse,
  type UnsubscribeInfo,
} from "@/types/mail";

import type { MailAdapter, MailChanges } from "../adapter";
import type { MessageHeaders } from "../headers";
import { decodeMimeHeader } from "../recipients";
import {
  type FolderMap,
  type ImapContext,
  SEARCH_FOLDERS,
  withImap,
  withImapMailbox,
  withImapPath,
} from "./imap-pool";

export function imapMail(credentials: ImapCredentials, from: string): MailAdapter {
  return bind<MailAdapter, ImapCredentials>(
    {
      listMessages,
      getMessage,
      sendMessage: (c, payload) => sendMessage(c, payload, from),
      deleteMessage,
      starMessage,
      markRead,
      batchMarkRead,
      search,
      searchAst,
      getRaw,
      getThread,
      listAllInFolder,
      batchDelete,
      archiveMessage,
      restoreMessage,
      createDraft: (c, payload) => createDraft(c, payload, from),
      updateDraft: (c, id, payload) => updateDraft(c, id, payload, from),
      deleteDraft,
      getUnsubscribeInfo,
      getHeaders,
      listAttachments,
      downloadAttachment,
      changes,
    },
    credentials,
  );
}

function uidValidityOf(ctx: ImapContext): string {
  const open = ctx.client.mailbox;
  if (!open) throw new Error("No IMAP mailbox is open");
  return String(open.uidValidity);
}

interface MessageRef {
  path: string;
  uidValidity: string;
  uid: number;
}

function assertUidValidity(ctx: ImapContext, refs: MessageRef | MessageRef[]) {
  const current = uidValidityOf(ctx);
  const stale = (Array.isArray(refs) ? refs : [refs]).some((ref) => ref.uidValidity !== current);
  if (stale) {
    throw new Error(
      "That message can no longer be found — the mailbox was recreated on the server, so saved references to it are stale.",
    );
  }
}

function encodeMessageId(ref: MessageRef): string {
  return Buffer.from(JSON.stringify([ref.path, ref.uidValidity, ref.uid]), "utf8").toString(
    "base64url",
  );
}

function decodeMessageId(id: string): MessageRef {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(id, "base64url").toString("utf8"));
  } catch {
    throw new Error("Malformed IMAP message id");
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) {
    throw new Error("Malformed IMAP message id");
  }
  const [path, uidValidity, uid]: unknown[] = parsed;
  if (
    typeof path !== "string" ||
    typeof uidValidity !== "string" ||
    typeof uid !== "number" ||
    !Number.isFinite(uid)
  ) {
    throw new Error("Malformed IMAP message id");
  }
  return { path, uidValidity, uid };
}

function folderForPath(folders: FolderMap, path: string): MailFolder {
  return keysOf(folders).find((folder) => folders[folder] === path) ?? "inbox";
}

function headerValue(headers: Buffer | undefined, name: string): string {
  if (!headers) return "";
  const unfolded = headers.toString("utf8").replace(/\r?\n[ \t]+/g, " ");
  const wanted = `${name.toLowerCase()}:`;
  for (const line of unfolded.split(/\r?\n/)) {
    if (line.toLowerCase().startsWith(wanted)) {
      return line.slice(wanted.length).trim();
    }
  }
  return "";
}

function rawHeaders(raw: Buffer): Buffer {
  const text = raw.toString("utf8");
  const end = text.search(/\r?\n\r?\n/);
  return Buffer.from(end === -1 ? text : text.slice(0, end), "utf8");
}

function messageIds(value: string): string[] {
  return [...value.matchAll(/<[^<>]+>/g)].map((m) => m[0]);
}

function threadKeyFor(envelopeMessageId: string, references: string): string {
  return messageIds(references)[0] ?? envelopeMessageId;
}

type EnvelopeAddress = { name?: string; address?: string };

function addressList(list: EnvelopeAddress[] | undefined): string[] {
  return (list ?? []).map((entry) => entry.address ?? "").filter((address) => address.length > 0);
}

function messageDate(message: FetchMessageObject): string {
  for (const candidate of [message.envelope?.date, message.internalDate]) {
    if (candidate === undefined || candidate === null) continue;
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) return parsed.toString();
  }
  return new Date().toString();
}

function toEmail(
  message: FetchMessageObject,
  path: string,
  uidValidity: string,
  folder: MailFolder,
): Email {
  const envelope = message.envelope;
  const flags = message.flags ?? new Set<string>();
  const from = envelope?.from?.[0];
  const references = headerValue(message.headers, "references");
  const messageIdHeader = envelope?.messageId ?? "";

  return {
    id: encodeMessageId({ path, uidValidity, uid: message.uid }),
    threadId: threadKeyFor(messageIdHeader, references) || undefined,
    from: from?.address ?? "",
    fromName: from?.name ? decodeMimeHeader(from.name) : undefined,
    to: addressList(envelope?.to),
    cc: addressList(envelope?.cc),
    bcc: addressList(envelope?.bcc),
    replyTo: (envelope?.replyTo ?? [])
      .filter((entry) => entry.address)
      .map((entry) => ({
        email: entry.address ?? "",
        name: entry.name ? decodeMimeHeader(entry.name) : undefined,
      })),
    messageIdHeader: messageIdHeader || undefined,
    references: references || undefined,
    subject: envelope?.subject ? decodeMimeHeader(envelope.subject) : "",
    snippet: "",
    date: messageDate(message),
    isRead: flags.has("\\Seen"),
    isStarred: flags.has("\\Flagged"),
    provider: "imap",
    folder,
  };
}

const LIST_QUERY: FetchQueryObject = {
  uid: true,
  flags: true,
  envelope: true,
  internalDate: true,
  headers: ["references"],
};

async function fetchByUids(
  ctx: ImapContext,
  path: string,
  uids: number[],
  folder: MailFolder,
): Promise<Email[]> {
  if (uids.length === 0) return [];
  const uidValidity = uidValidityOf(ctx);
  const emails: Email[] = [];
  for await (const message of ctx.client.fetch(uids, LIST_QUERY, {
    uid: true,
  })) {
    emails.push(toEmail(message, path, uidValidity, folder));
  }
  return emails.toSorted((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

async function searchUids(ctx: ImapContext, query: Record<string, unknown>): Promise<number[]> {
  const found = await ctx.client.search(query, { uid: true });
  return Array.isArray(found) ? found : [];
}

async function changes(
  credentials: ImapCredentials,
  folder: MailFolder,
  cursor: string | null,
): Promise<MailChanges | null> {
  if (folder === "starred") return null;
  return withImapMailbox(credentials, folder, async (ctx, path) => {
    const open = ctx.client.mailbox;
    if (!open) throw new Error("No IMAP mailbox is open");
    const validity = String(open.uidValidity);
    if (!cursor) {
      const highest = Math.max(0, ...(await searchUids(ctx, { uid: "*" })));
      return { cursor: `${validity}:${Math.max(open.uidNext, highest + 1)}`, ids: [] };
    }
    const [was, from] = cursor.split(":");
    const start = Number(from);
    if (was !== validity || !Number.isInteger(start)) {
      return { cursor: "", ids: [], expired: true };
    }
    const uids = (await searchUids(ctx, { uid: `${start}:*` })).filter((uid) => uid >= start);
    const next = uids.length > 0 ? Math.max(start, ...uids.map((uid) => uid + 1)) : start;
    return {
      cursor: `${validity}:${next}`,
      ids: uids.map((uid) => encodeMessageId({ path, uidValidity: validity, uid })),
    };
  });
}

async function listMessages(
  credentials: ImapCredentials,
  folder: MailFolder,
  pageToken?: string,
  maxResults = 50,
): Promise<MessagesResponse> {
  if (folder === "starred") return imapListFlagged(credentials, maxResults);

  return withImapMailbox(credentials, folder, async (ctx, path) => {
    const all = await searchUids(ctx, { all: true });
    const cursor = pageToken ? Number(pageToken) : Number.POSITIVE_INFINITY;
    const eligible = all.filter((uid) => uid < cursor);
    const page = eligible.slice(-maxResults);
    const emails = await fetchByUids(ctx, path, page, folder);
    const first = page[0];
    return {
      emails,
      nextPageToken:
        eligible.length > page.length && first !== undefined ? String(first) : undefined,
      total: all.length,
    };
  });
}

async function searchAcrossFolders(
  ctx: ImapContext,
  query: Record<string, unknown>,
  perFolderLimit?: number,
  folders: readonly MailFolder[] = SEARCH_FOLDERS,
): Promise<Email[]> {
  const emails: Email[] = [];
  /* oxlint-disable eslint/no-await-in-loop -- one IMAP connection selects one folder at a time */
  for (const folder of folders) {
    const path = ctx.folders[folder];
    if (!path) continue;
    const lock = await ctx.lock(path);
    try {
      const uids = await searchUids(ctx, query);
      const wanted = perFolderLimit ? uids.slice(-perFolderLimit) : uids;
      emails.push(...(await fetchByUids(ctx, path, wanted, folder)));
    } finally {
      lock.release();
    }
  }
  /* oxlint-enable eslint/no-await-in-loop */
  return emails;
}

function newestFirst(emails: Email[]): Email[] {
  return emails.toSorted((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

async function imapListFlagged(
  credentials: ImapCredentials,
  maxResults: number,
): Promise<MessagesResponse> {
  return withImap(credentials, async (ctx) => {
    const emails = await searchAcrossFolders(ctx, { flagged: true }, maxResults);
    return { emails: newestFirst(emails).slice(0, maxResults) };
  });
}

async function search(credentials: ImapCredentials, query: string): Promise<MessagesResponse> {
  return withImap(credentials, async (ctx) => {
    const emails = await searchAcrossFolders(ctx, { text: query }, 50);
    return { emails: newestFirst(emails) };
  });
}

type ImapQuery = Record<string, unknown>;

const IMAP_TEXT_KEYS = new Set(["from", "to", "cc", "subject"]);

const IMAP_STATES: Record<string, ImapQuery> = {
  unread: { seen: false },
  read: { seen: true },
  starred: { flagged: true },
};

function mergeAnd(parts: ImapQuery[]): ImapQuery {
  const merged: ImapQuery = {};
  const colliding: ImapQuery[] = [];
  for (const part of parts) {
    if (Object.keys(part).some((key) => key in merged)) colliding.push(part);
    else Object.assign(merged, part);
  }
  if (colliding.length === 0) return merged;
  return {
    not: { or: [{ not: merged }, ...colliding.map((part) => ({ not: part }))] },
  };
}

function imapDialect(timeZone: string): Dialect<ImapQuery> {
  return {
    leaf(tag: TagToken) {
      const key = tagKey(tag);
      const text = tagText(tag) ?? "";
      if (key === "after" || key === "before" || key === "on") {
        const span = parseSearchDate(text, timeZone);
        if (!span) return null;
        if (key === "after") {
          return { native: { since: new Date(span.start) }, exact: false };
        }
        if (key === "before") {
          return { native: { before: new Date(span.start) }, exact: false };
        }
        return {
          native: {
            since: new Date(span.start),
            before: new Date(Math.max(span.end, span.start + 86_400_000)),
          },
          exact: false,
        };
      }
      if (!isPlainTerm(tag)) return null;
      if (key === null) return { native: { text }, exact: true };
      if (IMAP_TEXT_KEYS.has(key)) return { native: { [key]: text }, exact: true };
      const value = text.toLowerCase();
      if (key === "has" && value === "attachment") {
        return {
          native: { header: { "content-type": "multipart/mixed" } },
          exact: true,
        };
      }
      const state = key === "is" ? IMAP_STATES[value] : undefined;
      return state ? { native: state, exact: true } : null;
    },
    and: mergeAnd,
    or: (parts) => ({ or: parts }),
    not: (part) => ({ not: part }),
  };
}

function searchFolders(query: AstSearch<Email>["query"]): {
  folders: readonly MailFolder[];
  rest: AstSearch<Email>["query"];
} {
  const [value] = topLevelValues(query, "mail-folder");
  const folder = value?.toLowerCase() ?? "";
  if (isMailFolder(folder) && folder !== "starred" && folder in IMAP_FOLDER_SET) {
    return {
      folders: [folder],
      rest: withoutTopLevel(query, "mail-folder"),
    };
  }
  return { folders: SEARCH_FOLDERS, rest: query };
}

const IMAP_FOLDER_SET: Record<string, true> = {
  inbox: true,
  sent: true,
  drafts: true,
  trash: true,
  archive: true,
  spam: true,
};

async function searchAst(
  credentials: ImapCredentials,
  astSearch: AstSearch<Email>,
): Promise<MessagesResponse> {
  const { folders, rest } = searchFolders(astSearch.query);
  const plan = planPushdown(rest, compileWith(imapDialect(astSearch.timeZone)));
  const query = plan.native.length > 0 ? mergeAnd(plan.native) : { all: true };
  const [only] = folders;
  if (folders.length === 1 && only) {
    const page = await withImapMailbox(credentials, only, async (ctx, path) => {
      const uids = await searchUids(ctx, query);
      const cursor =
        astSearch.cursor && /^\d+$/.test(astSearch.cursor)
          ? Number(astSearch.cursor)
          : Number.POSITIVE_INFINITY;
      const eligible = uids.filter((uid) => uid < cursor);
      const wanted = eligible.slice(-SEARCH_PAGE_SIZE * 2);
      const first = wanted[0];
      return {
        emails: await fetchByUids(ctx, path, wanted, only),
        nextPageToken:
          eligible.length > wanted.length && first !== undefined ? String(first) : undefined,
      };
    });
    return {
      emails: await astSearch.accept(plan.residual, newestFirst(page.emails)),
      nextPageToken: page.nextPageToken,
    };
  }
  const emails = await withImap(credentials, (ctx) =>
    searchAcrossFolders(ctx, query, SEARCH_PAGE_SIZE * 2, folders),
  );
  return {
    emails: await astSearch.accept(
      plan.residual,
      newestFirst(emails).slice(0, SEARCH_PAGE_SIZE * 2),
    ),
  };
}

interface PartIndex {
  html?: string;
  text?: string;
  attachments: Attachment[];
}

function collectParts(node: MessageStructureObject | undefined, found: PartIndex) {
  if (!node) return;
  const type = node.type?.toLowerCase() ?? "";
  const disposition = node.disposition?.toLowerCase() ?? "";
  const filename = node.dispositionParameters?.filename ?? node.parameters?.name ?? "";

  if (node.childNodes?.length) {
    for (const child of node.childNodes) collectParts(child, found);
    return;
  }

  if (disposition === "attachment" || (filename && !type.startsWith("text/"))) {
    found.attachments.push({
      id: node.part ?? "1",
      filename: decodeMimeHeader(filename) || "attachment",
      mimeType: type || "application/octet-stream",
      size: node.size ?? 0,
    });
    return;
  }

  if (type === "text/html" && !found.html) found.html = node.part ?? "1";
  else if (type === "text/plain" && !found.text) found.text = node.part ?? "1";
}

function snippetOf(text: string, html: string): string {
  const visible = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return (text || visible).replace(/\s+/g, " ").trim().slice(0, 200);
}

async function getMessage(credentials: ImapCredentials, id: string): Promise<Partial<Email>> {
  const ref = decodeMessageId(id);
  return withImapPath(credentials, ref.path, async (ctx) => {
    assertUidValidity(ctx, ref);
    const folder = folderForPath(ctx.folders, ref.path);
    const message = await ctx.client.fetchOne(
      String(ref.uid),
      { ...LIST_QUERY, bodyStructure: true },
      { uid: true },
    );
    if (!message) {
      const raw = await ctx.client.fetchOne(
        String(ref.uid),
        { ...LIST_QUERY, source: true },
        { uid: true },
      );
      if (!raw) throw new Error("Message not found");
      const source = raw.source;
      if (!source) throw new Error("Message not found");
      const parsed = await PostalMime.parse(source);
      const html = typeof parsed.html === "string" ? parsed.html : "";
      const text = typeof parsed.text === "string" ? parsed.text : "";
      return {
        ...toEmail(raw, ref.path, uidValidityOf(ctx), folder),
        bodyHtml: html || undefined,
        bodyText: text || undefined,
        snippet: snippetOf(text, html),
        attachments: [],
      };
    }

    const base = toEmail(message, ref.path, uidValidityOf(ctx), folder);

    const found: PartIndex = { attachments: [] };
    collectParts(message.bodyStructure, found);

    const wanted = [found.html, found.text].filter((part): part is string => !!part);
    const parts = wanted.length
      ? await ctx.client.downloadMany(String(ref.uid), wanted, { uid: true })
      : {};

    const html = found.html ? (parts[found.html]?.content?.toString("utf8") ?? "") : "";
    const text = found.text ? (parts[found.text]?.content?.toString("utf8") ?? "") : "";

    return {
      ...base,
      bodyHtml: html || undefined,
      bodyText: text || undefined,
      snippet: snippetOf(text, html),
      attachments: found.attachments,
    };
  });
}

async function getRaw(credentials: ImapCredentials, id: string): Promise<string> {
  const ref = decodeMessageId(id);
  return withImapPath(credentials, ref.path, async (ctx) => {
    assertUidValidity(ctx, ref);
    const message = await ctx.client.fetchOne(String(ref.uid), { source: true }, { uid: true });
    if (!message) throw new Error("Message not found");
    const source = message.source;
    if (!source) throw new Error("Message not found");
    return source.toString("utf8");
  });
}

async function getThread(credentials: ImapCredentials, threadId: string): Promise<Email[]> {
  return withImap(credentials, async (ctx) => {
    const emails = await searchAcrossFolders(ctx, {
      or: [{ header: { "message-id": threadId } }, { header: { references: threadId } }],
    });
    return emails.toSorted((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  });
}

async function listAllInFolder(
  credentials: ImapCredentials,
  folder: MailFolder,
): Promise<string[]> {
  return withImapMailbox(credentials, folder, async (ctx, path) => {
    const uids = await searchUids(ctx, { all: true });
    const uidValidity = uidValidityOf(ctx);
    return uids.map((uid) => encodeMessageId({ path, uidValidity, uid }));
  });
}

async function withMessage<T>(
  credentials: ImapCredentials,
  id: string,
  run: (ctx: ImapContext, ref: MessageRef) => Promise<T>,
): Promise<T> {
  const ref = decodeMessageId(id);
  return withImapPath(credentials, ref.path, (ctx) => {
    assertUidValidity(ctx, ref);
    return run(ctx, ref);
  });
}

function groupByPath(ids: string[]): Map<string, MessageRef[]> {
  const grouped = new Map<string, MessageRef[]>();
  for (const id of ids) {
    const ref = decodeMessageId(id);
    const existing = grouped.get(ref.path);
    if (existing) existing.push(ref);
    else grouped.set(ref.path, [ref]);
  }
  return grouped;
}

function uidsOf(refs: MessageRef[]): number[] {
  return refs.map((ref) => ref.uid);
}

async function starMessage(
  credentials: ImapCredentials,
  id: string,
  starred: boolean,
): Promise<void> {
  await withMessage(credentials, id, async (ctx, ref) => {
    const range = [ref.uid];
    if (starred) {
      await ctx.client.messageFlagsAdd(range, ["\\Flagged"], { uid: true });
    } else {
      await ctx.client.messageFlagsRemove(range, ["\\Flagged"], { uid: true });
    }
  });
}

async function markRead(credentials: ImapCredentials, id: string, read: boolean): Promise<void> {
  await withMessage(credentials, id, async (ctx, ref) => {
    const range = [ref.uid];
    if (read) {
      await ctx.client.messageFlagsAdd(range, ["\\Seen"], { uid: true });
    } else {
      await ctx.client.messageFlagsRemove(range, ["\\Seen"], { uid: true });
    }
  });
}

async function batchMarkRead(
  credentials: ImapCredentials,
  ids: string[],
  read: boolean,
): Promise<void> {
  const grouped = groupByPath(ids);
  await withImap(credentials, async (ctx) => {
    /* oxlint-disable eslint/no-await-in-loop -- one IMAP connection selects one folder at a time */
    for (const [path, refs] of grouped) {
      const lock = await ctx.lock(path);
      try {
        assertUidValidity(ctx, refs);
        const uids = uidsOf(refs);
        if (read) {
          await ctx.client.messageFlagsAdd(uids, ["\\Seen"], { uid: true });
        } else {
          await ctx.client.messageFlagsRemove(uids, ["\\Seen"], { uid: true });
        }
      } finally {
        lock.release();
      }
    }
    /* oxlint-enable eslint/no-await-in-loop */
  });
}

async function deleteMessage(credentials: ImapCredentials, id: string): Promise<string | null> {
  const ref = decodeMessageId(id);
  const purged = await withImap(credentials, async (ctx) => {
    if (ref.path !== ctx.path("trash")) return false;
    const lock = await ctx.lock(ref.path);
    try {
      assertUidValidity(ctx, ref);
      await ctx.client.messageDelete([ref.uid], { uid: true });
    } finally {
      lock.release();
    }
    return true;
  });
  return purged ? null : moveMessage(credentials, id, "trash");
}

async function batchDelete(
  credentials: ImapCredentials,
  ids: string[],
): Promise<Map<string, string>> {
  const grouped = groupByPath(ids);
  const movedIds = new Map<string, string>();
  await withImap(credentials, async (ctx) => {
    const trash = ctx.path("trash");
    /* oxlint-disable eslint/no-await-in-loop -- one IMAP connection selects one folder at a time */
    for (const [path, refs] of grouped) {
      const lock = await ctx.lock(path);
      try {
        assertUidValidity(ctx, refs);
        const uids = uidsOf(refs);
        if (path === trash) {
          await ctx.client.messageDelete(uids, { uid: true });
        } else {
          const moved = await ctx.client.messageMove(uids, trash, { uid: true });
          if (moved && moved.uidValidity !== undefined) {
            for (const ref of refs) {
              const uid = moved.uidMap?.get(ref.uid);
              if (uid === undefined) continue;
              movedIds.set(
                encodeMessageId(ref),
                encodeMessageId({ path: trash, uidValidity: String(moved.uidValidity), uid }),
              );
            }
          }
        }
      } finally {
        lock.release();
      }
    }
    /* oxlint-enable eslint/no-await-in-loop */
  });
  return movedIds;
}

async function moveMessage(
  credentials: ImapCredentials,
  id: string,
  destination: MailFolder,
): Promise<string> {
  const ref = decodeMessageId(id);
  return withImap(credentials, async (ctx) => {
    const target = ctx.path(destination);
    if (ref.path === target) return id;
    const lock = await ctx.lock(ref.path);
    try {
      assertUidValidity(ctx, [ref]);
      const moved = await ctx.client.messageMove([ref.uid], target, {
        uid: true,
      });
      if (!moved) {
        throw new Error(`Could not move the message to ${target}`);
      }
      const uid = moved.uidMap?.get(ref.uid);
      if (uid === undefined || moved.uidValidity === undefined) return id;
      return encodeMessageId({
        path: target,
        uidValidity: String(moved.uidValidity),
        uid,
      });
    } finally {
      lock.release();
    }
  });
}

async function archiveMessage(credentials: ImapCredentials, id: string): Promise<string> {
  return moveMessage(credentials, id, "archive");
}

async function restoreMessage(credentials: ImapCredentials, id: string): Promise<string> {
  return moveMessage(credentials, id, "inbox");
}

async function buildMime(payload: DraftPayload, from: string): Promise<Buffer> {
  const composer = new MailComposer({
    from,
    to: payload.to,
    cc: payload.cc,
    bcc: payload.bcc,
    subject: payload.subject,
    html: payload.bodyHtml,
    text: payload.bodyText,
    inReplyTo: payload.inReplyTo,
    references: payload.references,
    attachments: payload.attachments?.map((attachment) => ({
      filename: attachment.filename,
      contentType: attachment.mimeType,
      content: Buffer.from(attachment.contentBase64, "base64"),
    })),
  });
  return composer.compile().build();
}

async function appendAndResolve(
  ctx: ImapContext,
  path: string,
  raw: Buffer,
  flags: string[],
): Promise<string | null> {
  const result = await ctx.client.append(path, raw, flags, new Date());
  if (!result) return null;

  if (result.uid !== undefined && result.uidValidity !== undefined) {
    return encodeMessageId({
      path,
      uidValidity: String(result.uidValidity),
      uid: result.uid,
    });
  }

  const messageId = headerValue(rawHeaders(raw), "message-id");
  if (!messageId) return null;

  const lock = await ctx.lock(path);
  try {
    const uids = await searchUids(ctx, {
      header: { "message-id": messageId },
    });
    const uid = uids.at(-1);
    if (uid === undefined) return null;
    return encodeMessageId({ path, uidValidity: uidValidityOf(ctx), uid });
  } finally {
    lock.release();
  }
}

async function sendMessage(
  credentials: ImapCredentials,
  payload: DraftPayload,
  from: string,
): Promise<{ id: string | null }> {
  const login = smtpLogin(credentials);
  const raw = await buildMime(payload, from);

  const transporter = createTransport({
    host: credentials.smtp.host,
    port: credentials.smtp.port,
    secure: credentials.smtp.secure,
    auth: { user: login.user, pass: login.pass },
    tls: { rejectUnauthorized: !credentials.allowInsecureTls },
  });

  try {
    await transporter.sendMail({
      envelope: {
        from,
        to: [...payload.to, ...(payload.cc ?? []), ...(payload.bcc ?? [])],
      },
      raw,
    });
  } finally {
    transporter.close();
  }

  try {
    const appended = await withImap(credentials, async (ctx) => {
      const sent = ctx.folders.sent;
      if (!sent) return null;
      return appendAndResolve(ctx, sent, raw, ["\\Seen"]);
    });
    return { id: appended };
  } catch (err) {
    console.error("[imap] message sent but could not be filed in Sent:", err);
    return { id: null };
  }
}

async function createDraft(
  credentials: ImapCredentials,
  payload: DraftPayload,
  from: string,
): Promise<{ id: string }> {
  const raw = await buildMime(payload, from);
  return withImap(credentials, async (ctx) => {
    const drafts = ctx.path("drafts");
    const id = await appendAndResolve(ctx, drafts, raw, ["\\Draft"]);
    if (!id) {
      throw new Error(
        "The mail server accepted the draft but would not say where it was stored, so it cannot be updated.",
      );
    }
    return { id };
  });
}

async function updateDraft(
  credentials: ImapCredentials,
  draftId: string,
  payload: DraftPayload,
  from: string,
): Promise<{ id: string }> {
  const created = await createDraft(credentials, payload, from);
  try {
    await deleteDraft(credentials, draftId);
  } catch (err) {
    console.error("[imap] could not remove the superseded draft:", err);
  }
  return created;
}

async function deleteDraft(credentials: ImapCredentials, draftId: string): Promise<void> {
  await withMessage(credentials, draftId, async (ctx, ref) => {
    await ctx.client.messageDelete([ref.uid], { uid: true });
  });
}

async function getHeaders(
  credentials: ImapCredentials,
  id: string,
  names: string[],
): Promise<MessageHeaders> {
  const ref = decodeMessageId(id);
  return withImapPath(credentials, ref.path, async (ctx) => {
    assertUidValidity(ctx, ref);
    const message = await ctx.client.fetchOne(
      String(ref.uid),
      { uid: true, headers: names.map((n) => n.toLowerCase()) },
      { uid: true },
    );
    if (!message) throw new Error("Message not found");
    const out: MessageHeaders = {};
    for (const name of names) {
      const value = headerValue(message.headers, name);
      if (value) out[name.toLowerCase()] = value;
    }
    return out;
  });
}

async function getUnsubscribeInfo(
  credentials: ImapCredentials,
  id: string,
): Promise<UnsubscribeInfo | null> {
  const ref = decodeMessageId(id);
  return withImapPath(credentials, ref.path, async (ctx) => {
    assertUidValidity(ctx, ref);
    const message = await ctx.client.fetchOne(
      String(ref.uid),
      { uid: true, headers: ["list-unsubscribe", "list-unsubscribe-post"] },
      { uid: true },
    );
    if (!message) return null;
    const listUnsubscribe = headerValue(message.headers, "list-unsubscribe");
    if (!listUnsubscribe) return null;
    const post = headerValue(message.headers, "list-unsubscribe-post");
    return { listUnsubscribe, listUnsubscribePost: post || undefined };
  });
}

async function listAttachments(credentials: ImapCredentials, id: string): Promise<Attachment[]> {
  const ref = decodeMessageId(id);
  return withImapPath(credentials, ref.path, async (ctx) => {
    assertUidValidity(ctx, ref);
    const message = await ctx.client.fetchOne(
      String(ref.uid),
      { uid: true, bodyStructure: true },
      { uid: true },
    );
    const found: PartIndex = { attachments: [] };
    if (message) collectParts(message.bodyStructure, found);
    return found.attachments;
  });
}

async function downloadAttachment(
  credentials: ImapCredentials,
  id: string,
  attachmentId: string,
): Promise<{ buffer: Buffer; mimeType?: string } | null> {
  const ref = decodeMessageId(id);
  return withImapPath(credentials, ref.path, async (ctx) => {
    assertUidValidity(ctx, ref);
    const parts = await ctx.client.downloadMany(String(ref.uid), [attachmentId], { uid: true });
    const part = parts[attachmentId];
    if (!part?.content) return null;
    return { buffer: part.content, mimeType: part.meta.contentType };
  });
}

export async function imapVerifySmtp(credentials: ImapCredentials): Promise<void> {
  const login = smtpLogin(credentials);
  const transporter = createTransport({
    host: credentials.smtp.host,
    port: credentials.smtp.port,
    secure: credentials.smtp.secure,
    auth: { user: login.user, pass: login.pass },
    tls: { rejectUnauthorized: !credentials.allowInsecureTls },
  });
  try {
    await transporter.verify();
  } finally {
    transporter.close();
  }
}
