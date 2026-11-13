import {
  DeleteObjectsCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createClient, type InArgs, type InStatement } from "@libsql/client/web";
import type { BlobBody, GatewayStore, StoredMessage } from "@metis/gateway-contract/router";
import {
  type AttachmentMeta,
  attachmentMetaSchema,
  type Folder,
  isFolder,
  SEARCH_LIMIT,
} from "@metis/gateway-contract/wire";
import { z } from "zod";

import { env } from "./env";

const TAG = "metis-ses";
const MAX_BOUND_PARAMS = 100;
const S3_MAX_DELETE_KEYS = 1000;

export const db = createClient({
  url: env.databaseUrl,
  ...(env.databaseAuthToken ? { authToken: env.databaseAuthToken } : {}),
});

export const s3 = new S3Client({
  region: env.region,
  forcePathStyle: true,
  followRegionRedirects: true,
});

const messageRowSchema = z.object({
  id: z.string(),
  thread_id: z.string(),
  folder: z.string(),
  prev_folder: z.string().nullable(),
  from_email: z.string(),
  from_name: z.string().nullable(),
  to_json: z.string(),
  cc_json: z.string(),
  bcc_json: z.string(),
  subject: z.string(),
  snippet: z.string(),
  body_html: z.string().nullable(),
  body_text: z.string().nullable(),
  date: z.string(),
  is_read: z.number(),
  is_starred: z.number(),
  message_id_header: z.string().nullable(),
  references_header: z.string().nullable(),
  list_unsubscribe: z.string().nullable(),
  list_unsubscribe_post: z.string().nullable(),
  attachments_json: z.string(),
  raw_key: z.string().nullable(),
});

const addressRowSchema = z.object({ address: z.string() });
const tokenRowSchema = z.object({ address: z.string(), created_at: z.string() });
const idRowSchema = z.object({ id: z.string() });
const totalRowSchema = z.object({ total: z.number() });
const attachmentsRowSchema = z.object({ attachments_json: z.string() });
const purgeRowSchema = z.object({
  id: z.string(),
  folder: z.string(),
  raw_key: z.string().nullable(),
  attachments_json: z.string(),
});

export async function query<S extends z.ZodType>(
  schema: S,
  sql: string,
  args: InArgs = [],
): Promise<z.infer<S>[]> {
  const result = await db.execute({ sql, args });
  return result.rows.map((row) => schema.parse(row));
}

export async function run(sql: string, args: InArgs = []): Promise<number> {
  const result = await db.execute({ sql, args });
  return result.rowsAffected;
}

async function runBatch(statements: InStatement[]): Promise<void> {
  if (statements.length === 0) return;
  await db.batch(statements, "write");
}

function chunked<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

export function idBatches(ids: string[], reservedParams: number): string[][] {
  return chunked(ids, MAX_BOUND_PARAMS - reservedParams);
}

export function placeholders(batch: string[]): string {
  return batch.map(() => "?").join(", ");
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseStringArray(value: string): string[] {
  const parsed = z.array(z.unknown()).safeParse(parseJson(value)).data ?? [];
  return parsed.filter((item) => typeof item === "string");
}

function parseAttachments(value: string): AttachmentMeta[] {
  return attachmentMetaSchema.array().safeParse(parseJson(value)).data ?? [];
}

function toStored(row: z.infer<typeof messageRowSchema>): StoredMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    folder: isFolder(row.folder) ? row.folder : "inbox",
    prevFolder: row.prev_folder,
    fromEmail: row.from_email,
    fromName: row.from_name,
    to: parseStringArray(row.to_json),
    cc: parseStringArray(row.cc_json),
    bcc: parseStringArray(row.bcc_json),
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
    attachments: parseAttachments(row.attachments_json),
    rawKey: row.raw_key,
  };
}

function folderCondition(address: string, folder: Folder): { where: string; args: string[] } {
  if (folder === "starred") {
    return {
      where: "to_address = ? AND is_starred = 1 AND folder NOT IN ('trash', 'spam', 'drafts')",
      args: [address],
    };
  }
  return { where: "to_address = ? AND folder = ?", args: [address, folder] };
}

export async function claimedAddresses(addresses: string[]): Promise<Set<string>> {
  const found = await Promise.all(
    idBatches(addresses, 0).map((batch) =>
      query(
        addressRowSchema,
        `SELECT address FROM tokens WHERE address IN (${placeholders(batch)})`,
        batch,
      ),
    ),
  );
  return new Set(found.flat().map((row) => row.address));
}

export async function rawKeyReferenced(rawKey: string): Promise<boolean> {
  const rows = await query(
    totalRowSchema,
    "SELECT COUNT(*) AS total FROM messages WHERE raw_key = ?",
    [rawKey],
  );
  return (rows[0]?.total ?? 0) > 0;
}

export async function putObject(key: string, bytes: Uint8Array, contentType: string) {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.mailBucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
    }),
  );
}

export async function getObjectBytes(key: string): Promise<Uint8Array | null> {
  try {
    const object = await s3.send(new GetObjectCommand({ Bucket: env.mailBucket, Key: key }));
    return object.Body ? await object.Body.transformToByteArray() : null;
  } catch (err) {
    if (err instanceof NoSuchKey) return null;
    throw err;
  }
}

async function getObjectStream(key: string): Promise<BlobBody | null> {
  try {
    const object = await s3.send(new GetObjectCommand({ Bucket: env.mailBucket, Key: key }));
    return object.Body ? object.Body.transformToWebStream() : null;
  } catch (err) {
    if (err instanceof NoSuchKey) return null;
    throw err;
  }
}

export async function deleteObjects(keys: string[]): Promise<void> {
  await Promise.all(
    chunked(keys, S3_MAX_DELETE_KEYS).map((batch) =>
      s3
        .send(
          new DeleteObjectsCommand({
            Bucket: env.mailBucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        )
        .catch((err: unknown) => {
          console.error(`[${TAG}] failed to delete stored objects`, err);
        }),
    ),
  );
}

export async function deleteUnreferencedRaw(rawKeys: string[]): Promise<void> {
  const unique = [...new Set(rawKeys)];
  const referenced = await Promise.all(unique.map(rawKeyReferenced));
  const orphaned = unique.filter((_, index) => !referenced[index]);
  if (orphaned.length > 0) await deleteObjects(orphaned);
}

function isAttachmentKey(key: string): boolean {
  return key.startsWith("att/");
}

export const store: GatewayStore = {
  async tokenAddress(tokenHash) {
    const rows = await query(addressRowSchema, "SELECT address FROM tokens WHERE token_hash = ?", [
      tokenHash,
    ]);
    return rows[0]?.address ?? null;
  },

  async listTokens() {
    return query(tokenRowSchema, "SELECT address, created_at FROM tokens ORDER BY address");
  },

  async saveToken(address, tokenHash) {
    await run(
      `INSERT INTO tokens (address, token_hash) VALUES (?, ?)
       ON CONFLICT (address) DO UPDATE SET token_hash = excluded.token_hash`,
      [address, tokenHash],
    );
  },

  async revokeToken(address) {
    await run("DELETE FROM tokens WHERE address = ?", [address]);
  },

  async getMessage(address, id) {
    const rows = await query(
      messageRowSchema,
      "SELECT * FROM messages WHERE id = ? AND to_address = ?",
      [id, address],
    );
    const row = rows[0];
    return row ? toStored(row) : null;
  },

  async listMessages(address, { folder, limit, after }) {
    const { where, args } = folderCondition(address, folder);
    const keyset = after ? " AND (date < ? OR (date = ? AND id < ?))" : "";
    const keysetArgs = after ? [after.date, after.date, after.id] : [];
    const [rows, count] = await Promise.all([
      query(
        messageRowSchema,
        `SELECT * FROM messages WHERE ${where}${keyset} ORDER BY date DESC, id DESC LIMIT ?`,
        [...args, ...keysetArgs, limit],
      ),
      query(totalRowSchema, `SELECT COUNT(*) AS total FROM messages WHERE ${where}`, args),
    ]);
    return {
      messages: rows.map(toStored),
      total: count[0]?.total ?? rows.length,
    };
  },

  async searchMessages(address, pattern) {
    const rows = await query(
      messageRowSchema,
      `SELECT * FROM messages
       WHERE to_address = ? AND folder NOT IN ('trash', 'spam', 'drafts')
         AND (
           subject LIKE ? ESCAPE '\\' OR from_email LIKE ? ESCAPE '\\'
           OR from_name LIKE ? ESCAPE '\\' OR snippet LIKE ? ESCAPE '\\'
           OR body_text LIKE ? ESCAPE '\\'
         )
       ORDER BY date DESC LIMIT ${SEARCH_LIMIT}`,
      [address, pattern, pattern, pattern, pattern, pattern],
    );
    return rows.map(toStored);
  },

  async folderIds(address, folder, limit) {
    const { where, args } = folderCondition(address, folder);
    const rows = await query(
      idRowSchema,
      `SELECT id FROM messages WHERE ${where} ORDER BY date DESC LIMIT ?`,
      [...args, limit],
    );
    return rows.map((row) => row.id);
  },

  async thread(address, threadId) {
    const rows = await query(
      messageRowSchema,
      `SELECT * FROM messages
       WHERE to_address = ? AND thread_id = ? AND folder != 'trash'
       ORDER BY date ASC`,
      [address, threadId],
    );
    return rows.map(toStored);
  },

  async outgoingAttachments(address, id) {
    const rows = await query(
      attachmentsRowSchema,
      "SELECT attachments_json FROM messages WHERE id = ? AND to_address = ?",
      [id, address],
    );
    const row = rows[0];
    return row ? parseAttachments(row.attachments_json) : null;
  },

  async upsertOutgoing(record) {
    await run(
      `INSERT INTO messages (
        id, thread_id, to_address, folder, from_email, to_json, cc_json,
        bcc_json, subject, snippet, body_html, body_text, date, is_read,
        is_starred, references_header, in_reply_to, attachments_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        folder = excluded.folder, from_email = excluded.from_email,
        to_json = excluded.to_json, cc_json = excluded.cc_json,
        bcc_json = excluded.bcc_json, subject = excluded.subject,
        snippet = excluded.snippet, body_html = excluded.body_html,
        body_text = excluded.body_text, date = excluded.date,
        references_header = excluded.references_header,
        in_reply_to = excluded.in_reply_to,
        thread_id = excluded.thread_id,
        attachments_json = excluded.attachments_json`,
      [
        record.id,
        record.threadId,
        record.address,
        record.folder,
        record.fromEmail,
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
      ],
    );
  },

  async setRead(address, ids, read) {
    await runBatch(
      idBatches(ids, 2).map((batch) => ({
        sql: `UPDATE messages SET is_read = ? WHERE to_address = ? AND id IN (${placeholders(batch)})`,
        args: [read ? 1 : 0, address, ...batch],
      })),
    );
  },

  async setFlags(id, { isRead, isStarred }) {
    const statements: InStatement[] = [];
    if (isStarred !== undefined) {
      statements.push({
        sql: "UPDATE messages SET is_starred = ? WHERE id = ?",
        args: [isStarred ? 1 : 0, id],
      });
    }
    if (isRead !== undefined) {
      statements.push({
        sql: "UPDATE messages SET is_read = ? WHERE id = ?",
        args: [isRead ? 1 : 0, id],
      });
    }
    await runBatch(statements);
  },

  async purgeTargets(address, ids) {
    const found = await Promise.all(
      idBatches(ids, 1).map((batch) =>
        query(
          purgeRowSchema,
          `SELECT id, folder, raw_key, attachments_json FROM messages
           WHERE to_address = ? AND id IN (${placeholders(batch)})`,
          [address, ...batch],
        ),
      ),
    );
    return found.flat().map((row) => ({
      id: row.id,
      folder: row.folder,
      rawKey: row.raw_key,
      attachments: parseAttachments(row.attachments_json),
    }));
  },

  async moveToTrash(address, ids) {
    await runBatch(
      idBatches(ids, 1).map((batch) => ({
        sql: `UPDATE messages SET prev_folder = folder, folder = 'trash'
              WHERE to_address = ? AND id IN (${placeholders(batch)})`,
        args: [address, ...batch],
      })),
    );
  },

  async archive(id) {
    await run("UPDATE messages SET prev_folder = folder, folder = 'archive' WHERE id = ?", [id]);
  },

  async restore(id, folder) {
    await run("UPDATE messages SET folder = ?, prev_folder = NULL WHERE id = ?", [folder, id]);
  },

  async deleteMessages(ids) {
    await runBatch(
      idBatches(ids, 0).map((batch) => ({
        sql: `DELETE FROM messages WHERE id IN (${placeholders(batch)})`,
        args: batch,
      })),
    );
  },

  async putBlob(key, bytes, contentType) {
    await putObject(key, bytes, contentType);
  },

  async getBlob(key) {
    return getObjectStream(key);
  },

  async deleteBlobs(keys) {
    if (keys.length === 0) return;
    try {
      await deleteObjects(keys.filter(isAttachmentKey));
      await deleteUnreferencedRaw(keys.filter((key) => !isAttachmentKey(key)));
    } catch (err) {
      console.error(`[${TAG}] failed to delete stored objects`, err);
    }
  },
};
