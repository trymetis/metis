import {
  attachmentKey,
  type Gateway,
  GatewaySendError,
  type GatewayStore,
  handleRequest,
  type StoredMessage,
} from "@metis/gateway-contract/router";
import {
  bracketMessageId,
  firstMessageId,
  normalizeAddress,
  normalizeThreadKey,
  snippetOf,
  truncate,
} from "@metis/gateway-contract/text";
import {
  type AttachmentMeta,
  attachmentMetaSchema,
  type Folder,
  isFolder,
  SEARCH_LIMIT,
} from "@metis/gateway-contract/wire";
import PostalMime, { type Email as ParsedEmail } from "postal-mime";

interface EmailSendAttachment {
  content: string | ArrayBuffer;
  filename: string;
  type: string;
  disposition: "attachment" | "inline";
  contentId?: string;
}

interface EmailSendParams {
  to: string | string[];
  from: string | { name: string; email: string };
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  headers?: Record<string, string>;
  attachments?: EmailSendAttachment[];
}

interface Env {
  DB: D1Database;
  RAW: R2Bucket;
  EMAIL: { send(message: EmailSendParams): Promise<{ messageId: string }> };
  MAIL_DOMAIN: string;
  API_TOKEN: string;
}

const TAG = "metis-cf-mail";
const D1_MAX_BOUND_PARAMS = 100;
const R2_MAX_DELETE_KEYS = 1000;

interface MessageRow {
  id: string;
  thread_id: string;
  to_address: string;
  folder: string;
  prev_folder: string | null;
  from_email: string;
  from_name: string | null;
  to_json: string;
  cc_json: string;
  bcc_json: string;
  subject: string;
  snippet: string;
  body_html: string | null;
  body_text: string | null;
  date: string;
  is_read: number;
  is_starred: number;
  message_id_header: string | null;
  references_header: string | null;
  list_unsubscribe: string | null;
  list_unsubscribe_post: string | null;
  attachments_json: string;
  raw_key: string | null;
}

function chunked<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function idBatches(ids: string[], reservedParams: number): string[][] {
  return chunked(ids, D1_MAX_BOUND_PARAMS - reservedParams);
}

async function runAll<T>(env: Env, statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
  return statements.length > 0 ? env.DB.batch<T>(statements) : [];
}

function placeholders(batch: string[]): string {
  return batch.map(() => "?").join(", ");
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function parseAttachmentsMeta(value: string): AttachmentMeta[] {
  try {
    return attachmentMetaSchema.array().safeParse(JSON.parse(value)).data ?? [];
  } catch {
    return [];
  }
}

function toStored(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    folder: isFolder(row.folder) ? row.folder : "inbox",
    prevFolder: row.prev_folder,
    fromEmail: row.from_email,
    fromName: row.from_name,
    to: parseJsonArray(row.to_json),
    cc: parseJsonArray(row.cc_json),
    bcc: parseJsonArray(row.bcc_json),
    subject: row.subject,
    snippet: row.snippet,
    bodyHtml: row.body_html,
    bodyText: row.body_text,
    date: row.date,
    isRead: row.is_read === 1,
    isStarred: row.is_starred === 1,
    messageIdHeader: row.message_id_header,
    references: row.references_header,
    listUnsubscribe: row.list_unsubscribe,
    listUnsubscribePost: row.list_unsubscribe_post,
    attachments: parseAttachmentsMeta(row.attachments_json),
    rawKey: row.raw_key,
  };
}

function folderCondition(address: string, folder: Folder): { where: string; params: string[] } {
  if (folder === "starred") {
    return {
      where: "to_address = ? AND is_starred = 1 AND folder NOT IN ('trash', 'spam', 'drafts')",
      params: [address],
    };
  }
  return { where: "to_address = ? AND folder = ?", params: [address, folder] };
}

async function deleteObjects(env: Env, keys: string[]): Promise<void> {
  await Promise.all(
    chunked(keys, R2_MAX_DELETE_KEYS).map((batch) =>
      env.RAW.delete(batch).catch((err: unknown) => {
        console.error(`[${TAG}] failed to delete stored objects`, err);
      }),
    ),
  );
}

function d1Store(env: Env): GatewayStore {
  return {
    async tokenAddress(tokenHash) {
      const row = await env.DB.prepare("SELECT address FROM tokens WHERE token_hash = ?")
        .bind(tokenHash)
        .first<{ address: string }>();
      return row?.address ?? null;
    },

    async listTokens() {
      const rows = await env.DB.prepare(
        `SELECT tokens.address, sender_names.name, tokens.created_at FROM tokens
         LEFT JOIN sender_names ON sender_names.address = tokens.address
         ORDER BY tokens.address`,
      ).all<{ address: string; name: string | null; created_at: string }>();
      return rows.results ?? [];
    },

    async saveToken(address, tokenHash) {
      await env.DB.prepare(
        `INSERT INTO tokens (address, token_hash) VALUES (?, ?)
         ON CONFLICT(address) DO UPDATE SET token_hash = excluded.token_hash`,
      )
        .bind(address, tokenHash)
        .run();
    },

    async revokeToken(address) {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM tokens WHERE address = ?").bind(address),
        env.DB.prepare("DELETE FROM sender_names WHERE address = ?").bind(address),
      ]);
    },

    async senderName(address) {
      const row = await env.DB.prepare("SELECT name FROM sender_names WHERE address = ?")
        .bind(address)
        .first<{ name: string }>();
      return row?.name ?? null;
    },

    async setSenderName(address, name) {
      const token = await env.DB.prepare("SELECT 1 AS found FROM tokens WHERE address = ?")
        .bind(address)
        .first<{ found: number }>();
      if (!token) return false;
      await (
        name === null
          ? env.DB.prepare("DELETE FROM sender_names WHERE address = ?").bind(address)
          : env.DB.prepare(
              `INSERT INTO sender_names (address, name) VALUES (?, ?)
             ON CONFLICT(address) DO UPDATE SET name = excluded.name`,
            ).bind(address, name)
      ).run();
      return true;
    },

    async getMessage(address, id) {
      const row = await env.DB.prepare("SELECT * FROM messages WHERE id = ? AND to_address = ?")
        .bind(id, address)
        .first<MessageRow>();
      return row ? toStored(row) : null;
    },

    async listMessages(address, { folder, limit, after }) {
      const { where, params } = folderCondition(address, folder);
      const keyset = after ? " AND (date < ? OR (date = ? AND id < ?))" : "";
      const keysetParams = after ? [after.date, after.date, after.id] : [];
      const [rows, count] = await Promise.all([
        env.DB.prepare(
          `SELECT * FROM messages WHERE ${where}${keyset} ORDER BY date DESC, id DESC LIMIT ?`,
        )
          .bind(...params, ...keysetParams, limit)
          .all<MessageRow>(),
        env.DB.prepare(`SELECT COUNT(*) AS total FROM messages WHERE ${where}`)
          .bind(...params)
          .first<{ total: number }>(),
      ]);
      const messages = (rows.results ?? []).map(toStored);
      return { messages, total: count?.total ?? messages.length };
    },

    async searchMessages(address, pattern) {
      const rows = await env.DB.prepare(
        `SELECT * FROM messages
         WHERE to_address = ? AND folder NOT IN ('trash', 'spam', 'drafts')
           AND (
             subject LIKE ? ESCAPE '\\' OR from_email LIKE ? ESCAPE '\\'
             OR from_name LIKE ? ESCAPE '\\' OR snippet LIKE ? ESCAPE '\\'
             OR body_text LIKE ? ESCAPE '\\'
           )
         ORDER BY date DESC LIMIT ${SEARCH_LIMIT}`,
      )
        .bind(address, pattern, pattern, pattern, pattern, pattern)
        .all<MessageRow>();
      return (rows.results ?? []).map(toStored);
    },

    async folderIds(address, folder, limit) {
      const { where, params } = folderCondition(address, folder);
      const rows = await env.DB.prepare(
        `SELECT id FROM messages WHERE ${where} ORDER BY date DESC LIMIT ${limit}`,
      )
        .bind(...params)
        .all<{ id: string }>();
      return (rows.results ?? []).map((row) => row.id);
    },

    async thread(address, threadId) {
      const rows = await env.DB.prepare(
        `SELECT * FROM messages
         WHERE to_address = ? AND thread_id = ? AND folder != 'trash'
         ORDER BY date ASC`,
      )
        .bind(address, threadId)
        .all<MessageRow>();
      return (rows.results ?? []).map(toStored);
    },

    async outgoingAttachments(address, id) {
      const row = await env.DB.prepare(
        "SELECT attachments_json FROM messages WHERE id = ? AND to_address = ?",
      )
        .bind(id, address)
        .first<{ attachments_json: string }>();
      return row ? parseAttachmentsMeta(row.attachments_json) : null;
    },

    async upsertOutgoing(record) {
      await env.DB.prepare(
        `INSERT INTO messages (
          id, thread_id, to_address, folder, from_email, from_name, to_json,
          cc_json, bcc_json, subject, snippet, body_html, body_text, date,
          is_read, is_starred, references_header, in_reply_to, attachments_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          folder = excluded.folder, from_email = excluded.from_email,
          from_name = excluded.from_name,
          to_json = excluded.to_json, cc_json = excluded.cc_json,
          bcc_json = excluded.bcc_json, subject = excluded.subject,
          snippet = excluded.snippet, body_html = excluded.body_html,
          body_text = excluded.body_text, date = excluded.date,
          references_header = excluded.references_header,
          in_reply_to = excluded.in_reply_to,
          thread_id = excluded.thread_id,
          attachments_json = excluded.attachments_json`,
      )
        .bind(
          record.id,
          record.threadId,
          record.address,
          record.folder,
          record.fromEmail,
          record.fromName,
          JSON.stringify(record.to),
          JSON.stringify(record.cc),
          JSON.stringify(record.bcc),
          record.subject,
          record.snippet,
          record.bodyHtml,
          record.bodyText,
          record.date,
          record.references,
          record.inReplyTo,
          JSON.stringify(record.attachments),
        )
        .run();
    },

    async setRead(address, ids, read) {
      await runAll(
        env,
        idBatches(ids, 2).map((batch) =>
          env.DB.prepare(
            `UPDATE messages SET is_read = ?
           WHERE to_address = ? AND id IN (${placeholders(batch)})`,
          ).bind(read ? 1 : 0, address, ...batch),
        ),
      );
    },

    async setFlags(id, { isRead, isStarred }) {
      if (isStarred !== undefined) {
        await env.DB.prepare("UPDATE messages SET is_starred = ? WHERE id = ?")
          .bind(isStarred ? 1 : 0, id)
          .run();
      }
      if (isRead !== undefined) {
        await env.DB.prepare("UPDATE messages SET is_read = ? WHERE id = ?")
          .bind(isRead ? 1 : 0, id)
          .run();
      }
    },

    async purgeTargets(address, ids) {
      const results = await runAll<MessageRow>(
        env,
        idBatches(ids, 1).map((batch) =>
          env.DB.prepare(
            `SELECT id, folder, raw_key, attachments_json FROM messages
           WHERE to_address = ? AND id IN (${placeholders(batch)})`,
          ).bind(address, ...batch),
        ),
      );
      const found = results.flatMap((rows) => rows.results ?? []);
      return found.map((row) => ({
        id: row.id,
        folder: row.folder,
        rawKey: row.raw_key,
        attachments: parseAttachmentsMeta(row.attachments_json),
      }));
    },

    async moveToTrash(address, ids) {
      await runAll(
        env,
        idBatches(ids, 1).map((batch) =>
          env.DB.prepare(
            `UPDATE messages SET prev_folder = folder, folder = 'trash'
           WHERE to_address = ? AND id IN (${placeholders(batch)})`,
          ).bind(address, ...batch),
        ),
      );
    },

    async archive(id) {
      await env.DB.prepare(
        "UPDATE messages SET prev_folder = folder, folder = 'archive' WHERE id = ?",
      )
        .bind(id)
        .run();
    },

    async restore(id, folder) {
      await env.DB.prepare("UPDATE messages SET folder = ?, prev_folder = NULL WHERE id = ?")
        .bind(folder, id)
        .run();
    },

    async deleteMessages(ids) {
      await runAll(
        env,
        idBatches(ids, 0).map((batch) =>
          env.DB.prepare(`DELETE FROM messages WHERE id IN (${placeholders(batch)})`).bind(
            ...batch,
          ),
        ),
      );
    },

    async putBlob(key, bytes, contentType) {
      await env.RAW.put(key, bytes, { httpMetadata: { contentType } });
    },

    async getBlob(key) {
      const object = await env.RAW.get(key);
      return object ? object.body : null;
    },

    async deleteBlobs(keys) {
      await deleteObjects(env, keys);
    },
  };
}

function gateway(env: Env): Gateway {
  return {
    tag: TAG,
    domain: env.MAIL_DOMAIN,
    apiToken: env.API_TOKEN,
    store: d1Store(env),
    async send(mail) {
      const params: EmailSendParams = {
        from: mail.fromName ? { name: mail.fromName, email: mail.from } : mail.from,
        to: mail.to,
        subject: mail.subject,
        html: mail.html || undefined,
        text: mail.text || undefined,
      };
      if (mail.cc) params.cc = mail.cc;
      if (mail.bcc) params.bcc = mail.bcc;
      if (mail.headers) params.headers = mail.headers;
      if (mail.attachments) {
        params.attachments = mail.attachments.map((attachment) => ({
          content: attachment.contentBase64,
          filename: attachment.filename,
          type: attachment.mimeType,
          disposition: "attachment" as const,
        }));
      }
      try {
        const sent = await env.EMAIL.send(params);
        return { messageIdHeader: bracketMessageId(sent?.messageId) };
      } catch (err) {
        throw new GatewaySendError(
          err instanceof Error ? err.message : "Email Sending rejected the message",
        );
      }
    },
  };
}

function incomingMessageId(message: ForwardableEmailMessage): string | null {
  const value = message.headers.get("message-id")?.trim();
  return value ? value.slice(0, 998) : null;
}

async function storeIncoming(message: ForwardableEmailMessage, env: Env): Promise<void> {
  const toAddress = normalizeAddress(message.to);
  const messageIdHeader = incomingMessageId(message);

  if (messageIdHeader) {
    const existing = await env.DB.prepare(
      "SELECT id FROM messages WHERE to_address = ? AND message_id_header = ?",
    )
      .bind(toAddress, messageIdHeader)
      .first<{ id: string }>();
    if (existing) return;
  }

  const id = crypto.randomUUID();
  const rawBuffer = await new Response(message.raw).arrayBuffer();
  const rawKey = `raw/${id}`;
  await env.RAW.put(rawKey, rawBuffer);

  try {
    await indexIncoming(message, env, {
      id,
      rawKey,
      rawBuffer,
      toAddress,
      messageIdHeader,
    });
  } catch (err) {
    console.error(`[${TAG}] raw email stored at ${rawKey}, but indexing it failed`, err);
    throw err;
  }
}

async function indexIncoming(
  message: ForwardableEmailMessage,
  env: Env,
  args: {
    id: string;
    rawKey: string;
    rawBuffer: ArrayBuffer;
    toAddress: string;
    messageIdHeader: string | null;
  },
): Promise<void> {
  const { id, rawKey, rawBuffer, toAddress, messageIdHeader } = args;
  const parsed: ParsedEmail = await PostalMime.parse(rawBuffer);

  const attachments: AttachmentMeta[] = await Promise.all(
    (parsed.attachments ?? []).map(async (attachment, index) => {
      const content =
        typeof attachment.content === "string"
          ? new TextEncoder().encode(attachment.content)
          : new Uint8Array(attachment.content);
      const attachmentId = String(index);
      await env.RAW.put(attachmentKey(id, attachmentId), content, {
        httpMetadata: {
          contentType: attachment.mimeType || "application/octet-stream",
        },
      });
      return {
        id: attachmentId,
        filename: attachment.filename || `attachment-${attachmentId}`,
        mimeType: attachment.mimeType || "application/octet-stream",
        size: content.byteLength,
      };
    }),
  );

  const references = parsed.references ?? null;
  const threadSource = firstMessageId(references) ?? messageIdHeader ?? id;
  const headers = parsed.headers ?? [];
  const headerValue = (key: string) =>
    headers.find((h) => h.key.toLowerCase() === key)?.value ?? null;

  const inserted = await env.DB.prepare(
    `INSERT INTO messages (
      id, thread_id, to_address, folder, from_email, from_name, to_json,
      cc_json, bcc_json, subject, snippet, body_html, body_text, date,
      is_read, is_starred, message_id_header, references_header, in_reply_to,
      list_unsubscribe, list_unsubscribe_post, attachments_json, raw_key
    ) VALUES (?, ?, ?, 'inbox', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (to_address, message_id_header) DO NOTHING`,
  )
    .bind(
      id,
      normalizeThreadKey(threadSource),
      toAddress,
      parsed.from?.address ?? message.from,
      parsed.from?.name || null,
      JSON.stringify((parsed.to ?? []).map((r) => r.address).filter(Boolean)),
      JSON.stringify((parsed.cc ?? []).map((r) => r.address).filter(Boolean)),
      "[]",
      parsed.subject ?? "",
      snippetOf(parsed.text, parsed.html),
      truncate(parsed.html),
      truncate(parsed.text),
      parsed.date ?? new Date().toISOString(),
      messageIdHeader,
      references,
      parsed.inReplyTo ?? null,
      headerValue("list-unsubscribe"),
      headerValue("list-unsubscribe-post"),
      JSON.stringify(attachments),
      rawKey,
    )
    .run();

  if (inserted.meta.changes === 0) {
    await deleteObjects(env, [rawKey, ...attachments.map((meta) => attachmentKey(id, meta.id))]);
  }
}

export default {
  async email(message, env): Promise<void> {
    await storeIncoming(message, env);
  },

  async fetch(request, env): Promise<Response> {
    return handleRequest(request, gateway(env));
  },
} satisfies ExportedHandler<Env>;
