import { createClient, type InArgs, type InStatement } from "@libsql/client";
import type { StoredMessage } from "@metis/gateway-contract/router";
import { type AttachmentMeta, attachmentMetaSchema, isFolder } from "@metis/gateway-contract/wire";
import { z } from "zod";

import { env } from "./env";

export const client = createClient({
  url: env.databaseUrl,
  ...(env.databaseAuthToken ? { authToken: env.databaseAuthToken } : {}),
});

const MAX_BOUND_PARAMS = 100;

export const messageRowSchema = z.object({
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

export async function query<S extends z.ZodType>(
  schema: S,
  sql: string,
  args: InArgs = [],
): Promise<z.infer<S>[]> {
  const result = await client.execute({ sql, args });
  return result.rows.map((row) => schema.parse(row));
}

export async function run(sql: string, args: InArgs = []): Promise<number> {
  const result = await client.execute({ sql, args });
  return result.rowsAffected;
}

export async function runBatch(statements: InStatement[]): Promise<void> {
  if (statements.length === 0) return;
  await client.batch(statements, "write");
}

export function idBatches(ids: string[], reservedParams: number): string[][] {
  const size = MAX_BOUND_PARAMS - reservedParams;
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    batches.push(ids.slice(index, index + size));
  }
  return batches;
}

export function placeholders(batch: string[]): string {
  return batch.map(() => "?").join(", ");
}

const stringArraySchema = z.array(z.unknown());

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function parseStringArray(value: string): string[] {
  const parsed = stringArraySchema.safeParse(parseJson(value)).data ?? [];
  return parsed.filter((item) => typeof item === "string");
}

export function parseAttachments(value: string): AttachmentMeta[] {
  return attachmentMetaSchema.array().safeParse(parseJson(value)).data ?? [];
}

export function toStored(row: z.infer<typeof messageRowSchema>): StoredMessage {
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
