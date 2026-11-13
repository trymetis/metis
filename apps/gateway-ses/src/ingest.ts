import { attachmentKey } from "@metis/gateway-contract/router";
import {
  firstMessageId,
  normalizeAddress,
  normalizeThreadKey,
  snippetOf,
  truncate,
} from "@metis/gateway-contract/text";
import type { AttachmentMeta } from "@metis/gateway-contract/wire";
import PostalMime from "postal-mime";
import { z } from "zod";

import { env } from "./env";
import {
  claimedAddresses,
  deleteObjects,
  deleteUnreferencedRaw,
  getObjectBytes,
  idBatches,
  placeholders,
  putObject,
  query,
  run,
} from "./store";

const verdictSchema = z.object({ status: z.string() }).optional();

const sesRecordSchema = z.object({
  ses: z.object({
    mail: z.object({ messageId: z.string().min(1) }),
    receipt: z.object({
      recipients: z.array(z.string()),
      spamVerdict: verdictSchema,
      virusVerdict: verdictSchema,
    }),
  }),
});

export const receiptEventSchema = z.object({ Records: z.array(sesRecordSchema).min(1) });

export type ReceiptEvent = z.infer<typeof receiptEventSchema>;
type SesRecord = z.infer<typeof sesRecordSchema>;

export type IngestOutcome = "stored" | "duplicate" | "unclaimed" | "missing";

const addressRowSchema = z.object({ to_address: z.string() });

function isoDate(value: string | null | undefined): string {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toISOString()
    : new Date().toISOString();
}

function failed(verdict: { status: string } | undefined): boolean {
  return verdict?.status.toUpperCase() === "FAIL";
}

async function alreadyStored(sesMessageId: string, addresses: string[]): Promise<Set<string>> {
  const found = await Promise.all(
    idBatches(addresses, 1).map((batch) =>
      query(
        addressRowSchema,
        `SELECT to_address FROM messages
         WHERE ses_message_id = ? AND to_address IN (${placeholders(batch)})`,
        [sesMessageId, ...batch],
      ),
    ),
  );
  return new Set(found.flat().map((row) => row.to_address));
}

async function ingestRecord(record: SesRecord): Promise<IngestOutcome> {
  const { mail, receipt } = record.ses;
  const rawKey = mail.messageId;
  const domainSuffix = `@${env.mailDomain}`;

  const candidates = [...new Set(receipt.recipients.map(normalizeAddress))].filter(
    (address) => address.endsWith(domainSuffix) && address.indexOf("@") > 0,
  );
  const claimed = candidates.length > 0 ? await claimedAddresses(candidates) : new Set<string>();
  const recipients = candidates.filter((address) => claimed.has(address));

  if (recipients.length === 0) {
    await deleteUnreferencedRaw([rawKey]);
    return "unclaimed";
  }

  const stored = await alreadyStored(mail.messageId, recipients);
  const pending = recipients.filter((address) => !stored.has(address));
  if (pending.length === 0) return "duplicate";

  const raw = await getObjectBytes(rawKey);
  if (!raw) return "missing";
  const parsed = await PostalMime.parse(raw);

  const folder = failed(receipt.spamVerdict) || failed(receipt.virusVerdict) ? "spam" : "inbox";
  const messageIdHeader = parsed.messageId?.trim().slice(0, 998) || null;
  const references = parsed.references ?? null;
  const headers = parsed.headers ?? [];
  const headerValue = (key: string) =>
    headers.find((header) => header.key.toLowerCase() === key)?.value ?? null;
  const contents = (parsed.attachments ?? []).map((attachment) => ({
    bytes:
      typeof attachment.content === "string"
        ? new TextEncoder().encode(attachment.content)
        : new Uint8Array(attachment.content),
    filename: attachment.filename,
    mimeType: attachment.mimeType || "application/octet-stream",
  }));

  let inserted = 0;
  /* oxlint-disable eslint/no-await-in-loop -- each recipient's attachments are written before its row, and a skipped row deletes exactly what it wrote */
  for (const toAddress of pending) {
    const id = crypto.randomUUID();
    const attachments: AttachmentMeta[] = await Promise.all(
      contents.map(async (content, index) => {
        const attachmentId = String(index);
        await putObject(attachmentKey(id, attachmentId), content.bytes, content.mimeType);
        return {
          id: attachmentId,
          filename: content.filename || `attachment-${attachmentId}`,
          mimeType: content.mimeType,
          size: content.bytes.byteLength,
        };
      }),
    );
    const threadSource = firstMessageId(references) ?? messageIdHeader ?? id;

    const changes = await run(
      `INSERT INTO messages (
        id, thread_id, to_address, folder, from_email, from_name, to_json,
        cc_json, bcc_json, subject, snippet, body_html, body_text, date,
        is_read, is_starred, message_id_header, references_header, in_reply_to,
        list_unsubscribe, list_unsubscribe_post, attachments_json, raw_key,
        ses_message_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING`,
      [
        id,
        normalizeThreadKey(threadSource),
        toAddress,
        folder,
        parsed.from?.address ?? "",
        parsed.from?.name || null,
        JSON.stringify((parsed.to ?? []).map((r) => r.address).filter(Boolean)),
        JSON.stringify((parsed.cc ?? []).map((r) => r.address).filter(Boolean)),
        "[]",
        parsed.subject ?? "",
        snippetOf(parsed.text, parsed.html),
        truncate(parsed.html),
        truncate(parsed.text),
        isoDate(parsed.date),
        messageIdHeader,
        references,
        parsed.inReplyTo ?? null,
        headerValue("list-unsubscribe"),
        headerValue("list-unsubscribe-post"),
        JSON.stringify(attachments),
        rawKey,
        mail.messageId,
      ],
    );
    if (changes === 0) {
      await deleteObjects(attachments.map((meta) => attachmentKey(id, meta.id)));
    } else {
      inserted += 1;
    }
  }
  /* oxlint-enable eslint/no-await-in-loop */

  if (inserted === 0) {
    await deleteUnreferencedRaw([rawKey]);
    return "duplicate";
  }
  return "stored";
}

export async function ingestReceipt(event: ReceiptEvent): Promise<IngestOutcome[]> {
  const outcomes: IngestOutcome[] = [];
  /* oxlint-disable-next-line eslint/no-await-in-loop -- SES delivers one record per event; records are ingested in order */
  for (const record of event.Records) outcomes.push(await ingestRecord(record));
  return outcomes;
}
