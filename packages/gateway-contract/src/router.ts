import type { z } from "zod";

import { base64ToBytes, newToken, sameSecret, sha256Hex } from "./crypto";
import { type Cursor, decodeCursor, encodeCursor } from "./cursor";
import {
  firstMessageId,
  likePattern,
  normalizeAddress,
  normalizeThreadKey,
  snippetOf,
  truncate,
} from "./text";
import {
  type AttachmentMeta,
  DEFAULT_LIST_LIMIT,
  type DraftAttachment,
  type DraftBody,
  draftBodySchema,
  type Folder,
  flagsBodySchema,
  idsBodySchema,
  isFolder,
  MAX_IDS,
  MAX_LIST_LIMIT,
  markReadBodySchema,
  SENDER_NAME_MAX_CHARS,
  tokenBodySchema,
  type TokenRow,
  type WireEmail,
} from "./wire";

export interface StoredMessage {
  id: string;
  threadId: string;
  folder: Folder;
  prevFolder: string | null;
  fromEmail: string;
  fromName: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  snippet: string;
  bodyHtml: string | null;
  bodyText: string | null;
  date: string;
  isRead: boolean;
  isStarred: boolean;
  messageIdHeader: string | null;
  references: string | null;
  listUnsubscribe: string | null;
  listUnsubscribePost: string | null;
  attachments: AttachmentMeta[];
  rawKey: string | null;
}

export type PurgeTarget = Pick<StoredMessage, "id" | "rawKey" | "attachments">;

export interface OutgoingRecord {
  id: string;
  threadId: string;
  address: string;
  folder: "sent" | "drafts";
  fromEmail: string;
  fromName: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  snippet: string;
  bodyHtml: string | null;
  bodyText: string | null;
  date: string;
  references: string | null;
  inReplyTo: string | null;
  attachments: AttachmentMeta[];
}

export interface ListQuery {
  folder: Folder;
  limit: number;
  after: Cursor | null;
}

export type BlobBody = ReadableStream | Uint8Array<ArrayBuffer>;

export interface GatewayStore {
  tokenAddress(tokenHash: string): Promise<string | null>;
  listTokens(): Promise<TokenRow[]>;
  saveToken(address: string, tokenHash: string): Promise<void>;
  revokeToken(address: string): Promise<void>;
  senderName(address: string): Promise<string | null>;
  setSenderName(address: string, name: string | null): Promise<boolean>;
  getMessage(address: string, id: string): Promise<StoredMessage | null>;
  listMessages(
    address: string,
    query: ListQuery,
  ): Promise<{ messages: StoredMessage[]; total: number }>;
  searchMessages(address: string, pattern: string): Promise<StoredMessage[]>;
  folderIds(address: string, folder: Folder, limit: number): Promise<string[]>;
  thread(address: string, threadId: string): Promise<StoredMessage[]>;
  outgoingAttachments(address: string, id: string): Promise<AttachmentMeta[] | null>;
  upsertOutgoing(record: OutgoingRecord): Promise<void>;
  setRead(address: string, ids: string[], read: boolean): Promise<void>;
  setFlags(id: string, flags: { isRead?: boolean; isStarred?: boolean }): Promise<void>;
  purgeTargets(address: string, ids: string[]): Promise<(PurgeTarget & { folder: string })[]>;
  moveToTrash(address: string, ids: string[]): Promise<void>;
  archive(id: string): Promise<void>;
  restore(id: string, folder: Folder): Promise<void>;
  deleteMessages(ids: string[]): Promise<void>;
  putBlob(key: string, bytes: Uint8Array<ArrayBuffer>, contentType: string): Promise<void>;
  getBlob(key: string): Promise<BlobBody | null>;
  deleteBlobs(keys: string[]): Promise<void>;
}

export interface OutgoingMail {
  from: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  attachments?: DraftAttachment[];
}

export class GatewaySendError extends Error {}

export interface Gateway {
  tag: string;
  domain: string;
  apiToken: string;
  health?: Record<string, string>;
  store: GatewayStore;
  send(mail: OutgoingMail): Promise<{ messageIdHeader: string | null }>;
}

type Auth = { kind: "admin" } | { kind: "mailbox"; address: string };

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

async function readBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.infer<S> | null> {
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  return parsed.success ? parsed.data : null;
}

const INVALID_BODY = "The request body is not valid";

const INVALID_NAME = `The name must be one line of at most ${SENDER_NAME_MAX_CHARS} characters`;

function parseSenderName(
  value: string | null | undefined,
): { ok: true; name: string | null } | { ok: false } {
  const name = (value ?? "").trim();
  if (name.length === 0) return { ok: true, name: null };
  if (name.length > SENDER_NAME_MAX_CHARS || /\p{Cc}/u.test(name)) {
    return { ok: false };
  }
  return { ok: true, name };
}

export function attachmentKey(messageId: string, attachmentId: string): string {
  return `att/${messageId}/${attachmentId}`;
}

export function toWire(message: StoredMessage, includeBody: boolean): WireEmail {
  return {
    id: message.id,
    threadId: message.threadId,
    from: message.fromEmail,
    fromName: message.fromName ?? undefined,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    subject: message.subject,
    snippet: message.snippet,
    bodyHtml: includeBody ? (message.bodyHtml ?? undefined) : undefined,
    bodyText: includeBody ? (message.bodyText ?? undefined) : undefined,
    date: message.date,
    isRead: message.isRead,
    isStarred: message.isStarred,
    folder: message.folder,
    messageIdHeader: message.messageIdHeader ?? undefined,
    references: message.references ?? undefined,
    attachments: message.attachments.length > 0 ? message.attachments : undefined,
  };
}

async function authorize(request: Request, gateway: Gateway): Promise<Auth | null> {
  const header = request.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const presented = header.slice(7).trim();
  if (presented.length === 0) return null;

  if (gateway.apiToken && (await sameSecret(presented, gateway.apiToken))) {
    return { kind: "admin" };
  }

  const address = await gateway.store.tokenAddress(await sha256Hex(presented));
  return address ? { kind: "mailbox", address } : null;
}

async function purge(gateway: Gateway, targets: PurgeTarget[]): Promise<void> {
  if (targets.length === 0) return;
  const keys: string[] = [];
  for (const target of targets) {
    if (target.rawKey) keys.push(target.rawKey);
    for (const meta of target.attachments) {
      keys.push(attachmentKey(target.id, meta.id));
    }
  }
  await gateway.store.deleteMessages(targets.map((target) => target.id));
  await gateway.store.deleteBlobs(keys);
}

async function storeOutgoing(
  gateway: Gateway,
  address: string,
  body: DraftBody,
  folder: "sent" | "drafts",
  existingId?: string,
  messageIdHeader: string | null = null,
  fromName?: string | null,
): Promise<string> {
  const { store } = gateway;
  const id = existingId ?? crypto.randomUUID();
  const previous = existingId ? await store.outgoingAttachments(address, existingId) : null;
  const name = fromName === undefined ? await store.senderName(address) : fromName;

  const attachments: AttachmentMeta[] = await Promise.all(
    (body.attachments ?? []).map(async (attachment, index) => {
      const bytes = base64ToBytes(attachment.contentBase64);
      const attachmentId = String(index);
      await store.putBlob(attachmentKey(id, attachmentId), bytes, attachment.mimeType);
      return {
        id: attachmentId,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: bytes.byteLength,
      };
    }),
  );

  const threadSource =
    firstMessageId(body.references) ?? firstMessageId(body.inReplyTo) ?? messageIdHeader ?? id;

  await store.upsertOutgoing({
    id,
    threadId: normalizeThreadKey(threadSource),
    address,
    folder,
    fromEmail: body.from ?? address,
    fromName: name,
    to: body.to ?? [],
    cc: body.cc ?? [],
    bcc: body.bcc ?? [],
    subject: body.subject ?? "",
    snippet: snippetOf(body.bodyText, body.bodyHtml),
    bodyHtml: truncate(body.bodyHtml),
    bodyText: truncate(body.bodyText),
    date: new Date().toISOString(),
    references: body.references ?? null,
    inReplyTo: body.inReplyTo ?? null,
    attachments,
  });

  if (previous) {
    const kept = new Set(attachments.map((meta) => meta.id));
    await store.deleteBlobs(
      previous.filter((meta) => !kept.has(meta.id)).map((meta) => attachmentKey(id, meta.id)),
    );
  }

  return id;
}

async function handleSend(gateway: Gateway, address: string, body: DraftBody): Promise<Response> {
  const from = normalizeAddress(body.from ?? "");
  if (from !== address) {
    return error(`This token only sends as ${address}`, 403);
  }
  if (!body.to || body.to.length === 0) {
    return error("At least one recipient is required", 400);
  }

  const headers: Record<string, string> = {};
  if (body.inReplyTo) headers["In-Reply-To"] = body.inReplyTo;
  if (body.references) headers.References = body.references;

  const fromName = await gateway.store.senderName(address);

  let messageIdHeader: string | null = null;
  try {
    const sent = await gateway.send({
      from,
      ...(fromName ? { fromName } : {}),
      to: body.to,
      ...(body.cc && body.cc.length > 0 ? { cc: body.cc } : {}),
      ...(body.bcc && body.bcc.length > 0 ? { bcc: body.bcc } : {}),
      subject: body.subject ?? "",
      ...(body.bodyHtml ? { html: body.bodyHtml } : {}),
      ...(body.bodyText ? { text: body.bodyText } : {}),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(body.attachments && body.attachments.length > 0 ? { attachments: body.attachments } : {}),
    });
    messageIdHeader = sent.messageIdHeader;
  } catch (err) {
    const detail = err instanceof Error ? err.message : "The provider rejected the message";
    return error(detail, err instanceof GatewaySendError ? 502 : 500);
  }

  try {
    const id = await storeOutgoing(
      gateway,
      address,
      body,
      "sent",
      undefined,
      messageIdHeader,
      fromName,
    );
    return json({ id });
  } catch (err) {
    console.error(`[${gateway.tag}] message was sent but the Sent copy could not be stored`, err);
    return json({ id: null });
  }
}

async function handleTokens(request: Request, gateway: Gateway, method: string): Promise<Response> {
  if (method === "GET") {
    return json({ tokens: await gateway.store.listTokens() });
  }

  const body = await readBody(request, tokenBodySchema);
  if (!body) return error(INVALID_BODY, 400);
  const address = normalizeAddress(body.address ?? "");
  const domain = gateway.domain.toLowerCase();
  if (!address.endsWith(`@${domain}`) || address.indexOf("@") < 1) {
    return error(`The address must be on @${domain}`, 400);
  }

  if (method === "DELETE") {
    await gateway.store.revokeToken(address);
    return json({ ok: true });
  }

  const name = parseSenderName(body.name);
  if (!name.ok) return error(INVALID_NAME, 400);

  if (method === "POST") {
    const token = newToken();
    await gateway.store.saveToken(address, await sha256Hex(token));
    if (body.name !== undefined) await gateway.store.setSenderName(address, name.name);
    return json({ address, token });
  }

  if (method === "PATCH") {
    if (body.name === undefined) return error(INVALID_BODY, 400);
    if (!(await gateway.store.setSenderName(address, name.name))) {
      return error(`No token exists for ${address}`, 404);
    }
    return json({ address, name: name.name });
  }

  return error("Method not allowed", 405);
}

async function listMessages(gateway: Gateway, address: string, url: URL): Promise<Response> {
  const folder = url.searchParams.get("folder") ?? "inbox";
  if (!isFolder(folder)) return error("Unknown folder", 400);
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || DEFAULT_LIST_LIMIT, 1),
    MAX_LIST_LIMIT,
  );
  const after = decodeCursor(url.searchParams.get("cursor"));
  const { messages, total } = await gateway.store.listMessages(address, {
    folder,
    limit,
    after,
  });
  const last = messages.at(-1);
  return json({
    emails: messages.map((message) => toWire(message, false)),
    nextCursor: messages.length === limit && last ? encodeCursor(last.date, last.id) : undefined,
    total,
  });
}

async function searchMessages(gateway: Gateway, address: string, url: URL): Promise<Response> {
  const query = (url.searchParams.get("q") ?? "").trim();
  if (query.length === 0) return json({ emails: [] });
  const messages = await gateway.store.searchMessages(address, likePattern(query));
  return json({ emails: messages.map((message) => toWire(message, false)) });
}

const SINGLE_MESSAGE =
  /^\/v1\/messages\/([^/]+)(\/(raw|archive|restore|unsubscribe|attachments)(\/([^/]+))?)?$/;

export async function handleApi(request: Request, gateway: Gateway): Promise<Response> {
  const { store } = gateway;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const method = request.method;

  if (!path.startsWith("/v1/")) return error("Not found", 404);

  const auth = await authorize(request, gateway);
  if (!auth) return error("Unauthorized", 401);

  if (path === "/v1/tokens") {
    if (auth.kind !== "admin") {
      return error("Token management needs the admin API_TOKEN", 403);
    }
    return handleTokens(request, gateway, method);
  }

  if (method === "GET" && path === "/v1/health") {
    return json({
      ok: true,
      ...gateway.health,
      domain: gateway.domain,
      address: auth.kind === "mailbox" ? auth.address : undefined,
    });
  }

  if (auth.kind !== "mailbox") {
    return error(
      "Mailbox routes need an address-scoped token — mint one with POST /v1/tokens",
      403,
    );
  }
  const address = auth.address;

  if (method === "GET" && path === "/v1/messages") {
    return listMessages(gateway, address, url);
  }
  if (method === "GET" && path === "/v1/search") {
    return searchMessages(gateway, address, url);
  }

  const folderIds = path.match(/^\/v1\/folders\/([a-z]+)\/ids$/);
  if (method === "GET" && folderIds) {
    const folder = folderIds[1] ?? "";
    if (!isFolder(folder)) return error("Unknown folder", 400);
    return json({ ids: await store.folderIds(address, folder, MAX_IDS) });
  }

  const thread = path.match(/^\/v1\/threads\/(.+)$/);
  if (method === "GET" && thread) {
    const messages = await store.thread(address, decodeURIComponent(thread[1] ?? ""));
    return json({ emails: messages.map((message) => toWire(message, true)) });
  }

  if (method === "POST" && path === "/v1/send") {
    const body = await readBody(request, draftBodySchema);
    if (!body) return error(INVALID_BODY, 400);
    return handleSend(gateway, address, body);
  }

  if (method === "POST" && path === "/v1/drafts") {
    const body = await readBody(request, draftBodySchema);
    if (!body) return error(INVALID_BODY, 400);
    const id = await storeOutgoing(gateway, address, body, "drafts");
    return json({ id });
  }

  const draft = path.match(/^\/v1\/drafts\/([^/]+)$/);
  if (draft) {
    const id = decodeURIComponent(draft[1] ?? "");
    const message = await store.getMessage(address, id);
    if (message?.folder !== "drafts") return error("Draft not found", 404);
    if (method === "PUT") {
      const body = await readBody(request, draftBodySchema);
      if (!body) return error(INVALID_BODY, 400);
      await storeOutgoing(gateway, address, body, "drafts", id);
      return json({ ok: true });
    }
    if (method === "DELETE") {
      await purge(gateway, [message]);
      return json({ ok: true });
    }
    return error("Method not allowed", 405);
  }

  if (method === "POST" && path === "/v1/messages/mark-read") {
    const body = await readBody(request, markReadBodySchema);
    if (!body) return error(INVALID_BODY, 400);
    const ids = (body.ids ?? []).slice(0, MAX_IDS);
    if (ids.length === 0) return json({ ok: true });
    await store.setRead(address, ids, body.read !== false);
    return json({ ok: true });
  }

  if (method === "POST" && path === "/v1/messages/delete") {
    const body = await readBody(request, idsBodySchema);
    if (!body) return error(INVALID_BODY, 400);
    const ids = (body.ids ?? []).slice(0, MAX_IDS);
    if (ids.length === 0) return json({ ok: true });
    const found = await store.purgeTargets(address, ids);
    const hard = found.filter((target) => target.folder === "trash");
    const soft = found.filter((target) => target.folder !== "trash");
    await purge(gateway, hard);
    if (soft.length > 0) {
      await store.moveToTrash(
        address,
        soft.map((target) => target.id),
      );
    }
    return json({ ok: true });
  }

  const single = path.match(SINGLE_MESSAGE);
  if (!single) return error("Not found", 404);

  const id = decodeURIComponent(single[1] ?? "");
  const action = single[3];
  const message = await store.getMessage(address, id);
  if (!message) return error("Message not found", 404);

  if (!action) {
    if (method === "GET") return json(toWire(message, true));
    if (method === "PATCH") {
      const body = await readBody(request, flagsBodySchema);
      if (!body) return error(INVALID_BODY, 400);
      await store.setFlags(id, {
        ...(typeof body.starred === "boolean" ? { isStarred: body.starred } : {}),
        ...(typeof body.read === "boolean" ? { isRead: body.read } : {}),
      });
      return json({ ok: true });
    }
    if (method === "DELETE") {
      if (message.folder === "trash") await purge(gateway, [message]);
      else await store.moveToTrash(address, [id]);
      return json({ ok: true });
    }
    return error("Method not allowed", 405);
  }

  if (action === "raw" && method === "GET") {
    if (!message.rawKey) {
      return error("No raw copy stored for this message", 404);
    }
    const body = await store.getBlob(message.rawKey);
    if (!body) return error("Raw copy is gone from storage", 404);
    return new Response(body, {
      headers: { "Content-Type": "message/rfc822" },
    });
  }

  if (action === "archive" && method === "POST") {
    await store.archive(id);
    return json({ ok: true });
  }

  if (action === "restore" && method === "POST") {
    const previous = message.prevFolder;
    const target =
      previous && isFolder(previous) && previous !== "trash" && previous !== "archive"
        ? previous
        : "inbox";
    await store.restore(id, target);
    return json({ ok: true });
  }

  if (action === "unsubscribe" && method === "GET") {
    return json({
      unsubscribe: message.listUnsubscribe
        ? {
            listUnsubscribe: message.listUnsubscribe,
            listUnsubscribePost: message.listUnsubscribePost ?? undefined,
          }
        : null,
    });
  }

  if (action === "attachments" && method === "GET") {
    const attachmentId = single[5];
    if (attachmentId === undefined) {
      return json({ attachments: message.attachments });
    }
    const target = message.attachments.find((meta) => meta.id === decodeURIComponent(attachmentId));
    if (!target) return error("Attachment not found", 404);
    const body = await store.getBlob(attachmentKey(id, target.id));
    if (!body) return new Response(null, { status: 204 });
    return new Response(body, {
      headers: {
        "Content-Type": target.mimeType,
        "Content-Disposition": `attachment; filename="${target.filename.replace(/"/g, "")}"`,
      },
    });
  }

  return error("Not found", 404);
}

export async function handleRequest(request: Request, gateway: Gateway): Promise<Response> {
  try {
    return await handleApi(request, gateway);
  } catch (err) {
    console.error(`[${gateway.tag}]`, err);
    const detail = err instanceof Error ? err.message : "Internal error";
    return error(detail, 500);
  }
}
