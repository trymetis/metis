import type { InStatement } from "@libsql/client";
import {
  error,
  type Gateway,
  GatewaySendError,
  type GatewayStore,
  handleRequest as handleGatewayRequest,
  json,
} from "@metis/gateway-contract/router";
import { type Folder, SEARCH_LIMIT } from "@metis/gateway-contract/wire";
import { z } from "zod";

import { blobs, deleteBlobs } from "./blob";
import {
  idBatches,
  messageRowSchema,
  parseAttachments,
  placeholders,
  query,
  run,
  runBatch,
  toStored,
} from "./db";
import { env } from "./env";
import { ingestReceived } from "./ingest";
import { ResendError, sendEmail } from "./resend";
import { verifyWebhook } from "./webhook";

const TAG = "metis-resend";

const webhookEventSchema = z.object({
  type: z.string().optional(),
  data: z.object({ email_id: z.string().optional() }).optional(),
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

function folderCondition(address: string, folder: Folder): { where: string; args: string[] } {
  if (folder === "starred") {
    return {
      where: "to_address = ? AND is_starred = 1 AND folder NOT IN ('trash', 'spam', 'drafts')",
      args: [address],
    };
  }
  return { where: "to_address = ? AND folder = ?", args: [address, folder] };
}

const store: GatewayStore = {
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
    await blobs.put(key, bytes, contentType);
  },

  async getBlob(key) {
    return blobs.get(key);
  },

  async deleteBlobs(keys) {
    await deleteBlobs(keys);
  },
};

const gateway: Gateway = {
  tag: TAG,
  domain: env.mailDomain,
  apiToken: env.apiToken,
  health: { backend: "resend" },
  store,
  async send(mail) {
    try {
      await sendEmail({
        from: mail.from,
        to: mail.to,
        ...(mail.cc ? { cc: mail.cc } : {}),
        ...(mail.bcc ? { bcc: mail.bcc } : {}),
        subject: mail.subject,
        ...(mail.html ? { html: mail.html } : {}),
        ...(mail.text ? { text: mail.text } : {}),
        ...(mail.headers ? { headers: mail.headers } : {}),
        ...(mail.attachments
          ? {
              attachments: mail.attachments.map((attachment) => ({
                filename: attachment.filename,
                content: attachment.contentBase64,
                content_type: attachment.mimeType,
              })),
            }
          : {}),
      });
    } catch (err) {
      if (err instanceof ResendError) throw new GatewaySendError(err.message);
      throw err;
    }
    return { messageIdHeader: null };
  },
};

async function handleWebhook(request: Request): Promise<Response> {
  if (!env.webhookSecret) {
    return error("Inbound webhooks are not configured on this gateway", 503);
  }
  const body = await request.text();
  if (
    !verifyWebhook({
      secret: env.webhookSecret,
      body,
      headers: request.headers,
    })
  ) {
    return error("Invalid webhook signature", 401);
  }

  const event = webhookEventSchema.safeParse(JSON.parse(body)).data;
  if (event?.type !== "email.received") return json({ ok: true });

  const emailId = event.data?.email_id;
  if (!emailId) return error("Missing email_id", 400);

  const outcome = await ingestReceived(emailId);
  return json({ ok: true, outcome });
}

export async function handleRequest(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  if (request.method === "POST" && path === "/webhooks/resend") {
    try {
      return await handleWebhook(request);
    } catch (err) {
      console.error(`[${TAG}]`, err);
      const detail = err instanceof Error ? err.message : "Internal error";
      return error(detail, 500);
    }
  }
  return handleGatewayRequest(request, gateway);
}
