import { attachmentKey } from "@metis/gateway-contract/router";
import {
  firstMessageId,
  normalizeAddress,
  normalizeThreadKey,
  snippetOf,
  truncate,
} from "@metis/gateway-contract/text";
import type { AttachmentMeta } from "@metis/gateway-contract/wire";
import { z } from "zod";

import { blobs, deleteBlobs } from "./blob";
import { query, run } from "./db";
import { download, getReceived, getReceivedAttachment, type ReceivedEmail } from "./resend";

function headerValue(
  headers: Record<string, string> | null | undefined,
  key: string,
): string | null {
  if (!headers) return null;
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === key) return value;
  }
  return null;
}

function envelopeRecipient(email: ReceivedEmail): string | null {
  const candidate = email.received_for?.[0] ?? email.to?.[0];
  return candidate ? normalizeAddress(candidate) : null;
}

const addressRowSchema = z.object({ address: z.string() });
const idRowSchema = z.object({ id: z.string() });

async function addressIsClaimed(address: string): Promise<boolean> {
  const rows = await query(addressRowSchema, "SELECT address FROM tokens WHERE address = ?", [
    address,
  ]);
  return rows.length > 0;
}

function validDate(value: Date): Date | null {
  return Number.isNaN(value.getTime()) ? null : value;
}

function isoDate(value: string | null | undefined): string {
  if (value) {
    const direct = validDate(new Date(value));
    if (direct) return direct.toISOString();
    const rewritten = value
      .trim()
      .replace(" ", "T")
      .replace(/(\.\d{3})\d+/, "$1")
      .replace(/([+-]\d{2})$/, "$1:00");
    const postgresStyle = validDate(new Date(rewritten));
    if (postgresStyle) return postgresStyle.toISOString();
  }
  return new Date().toISOString();
}

export async function ingestReceived(
  resendEmailId: string,
): Promise<"stored" | "duplicate" | "unclaimed"> {
  const existing = await query(idRowSchema, "SELECT id FROM messages WHERE resend_email_id = ?", [
    resendEmailId,
  ]);
  if (existing.length > 0) return "duplicate";

  const email = await getReceived(resendEmailId);
  const toAddress = envelopeRecipient(email);
  if (!toAddress) return "unclaimed";
  if (!(await addressIsClaimed(toAddress))) return "unclaimed";

  const id = crypto.randomUUID();
  const writtenKeys: string[] = [];

  let rawKey: string | null = null;
  if (email.raw?.download_url) {
    rawKey = `raw/${id}`;
    await blobs.put(rawKey, await download(email.raw.download_url), "message/rfc822");
    writtenKeys.push(rawKey);
  }

  const attachments: AttachmentMeta[] = [];
  for (const attachment of email.attachments ?? []) {
    /* oxlint-disable eslint/no-await-in-loop -- each key is recorded as soon as it is written, so a failure cleans up exactly what landed */
    const meta = await getReceivedAttachment(resendEmailId, attachment.id);
    const bytes = await download(meta.download_url);
    const key = attachmentKey(id, attachment.id);
    await blobs.put(key, bytes, attachment.content_type || "application/octet-stream");
    /* oxlint-enable eslint/no-await-in-loop */
    writtenKeys.push(key);
    attachments.push({
      id: attachment.id,
      filename: attachment.filename || `attachment-${attachment.id}`,
      mimeType: attachment.content_type || "application/octet-stream",
      size: attachment.size ?? bytes.byteLength,
    });
  }

  const references = headerValue(email.headers, "references");
  const messageIdHeader = email.message_id ?? null;
  const threadSource = firstMessageId(references) ?? messageIdHeader ?? id;

  const inserted = await run(
    `INSERT INTO messages (
      id, thread_id, to_address, folder, from_email, from_name, to_json,
      cc_json, bcc_json, subject, snippet, body_html, body_text, date,
      is_read, is_starred, message_id_header, references_header, in_reply_to,
      list_unsubscribe, list_unsubscribe_post, attachments_json, raw_key,
      resend_email_id
    ) VALUES (?, ?, ?, 'inbox', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT DO NOTHING`,
    [
      id,
      normalizeThreadKey(threadSource),
      toAddress,
      email.from,
      null,
      JSON.stringify(email.to ?? []),
      JSON.stringify(email.cc ?? []),
      JSON.stringify(email.bcc ?? []),
      email.subject ?? "",
      snippetOf(email.text, email.html),
      truncate(email.html),
      truncate(email.text),
      isoDate(email.created_at),
      messageIdHeader,
      references,
      headerValue(email.headers, "in-reply-to"),
      headerValue(email.headers, "list-unsubscribe"),
      headerValue(email.headers, "list-unsubscribe-post"),
      JSON.stringify(attachments),
      rawKey,
      resendEmailId,
    ],
  );

  if (inserted === 0) {
    await deleteBlobs(writtenKeys);
    return "duplicate";
  }

  return "stored";
}
