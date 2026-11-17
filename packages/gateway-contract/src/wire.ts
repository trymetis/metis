import { z } from "zod";

export const FOLDERS = ["inbox", "sent", "drafts", "starred", "trash", "archive", "spam"] as const;
export type Folder = (typeof FOLDERS)[number];

export function isFolder(value: string): value is Folder {
  return (FOLDERS as readonly string[]).includes(value);
}

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 100;
export const MAX_IDS = 1000;
export const SEARCH_LIMIT = 50;

export const attachmentMetaSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
});
export type AttachmentMeta = z.infer<typeof attachmentMetaSchema>;

export const draftAttachmentSchema = z.object({
  filename: z.string(),
  mimeType: z.string(),
  contentBase64: z.string(),
});
export type DraftAttachment = z.infer<typeof draftAttachmentSchema>;

export const draftBodySchema = z.object({
  from: z.string().optional(),
  to: z.array(z.string()).optional(),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  subject: z.string().optional(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  inReplyTo: z.string().optional(),
  references: z.string().optional(),
  attachments: z.array(draftAttachmentSchema).optional(),
});
export type DraftBody = z.infer<typeof draftBodySchema>;

export const wireEmailSchema = z.object({
  id: z.string(),
  threadId: z.string().optional(),
  from: z.string(),
  fromName: z.string().optional(),
  to: z.array(z.string()).optional(),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  subject: z.string().optional(),
  snippet: z.string().optional(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  date: z.string(),
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  folder: z.enum(FOLDERS),
  messageIdHeader: z.string().optional(),
  references: z.string().optional(),
  attachments: z.array(attachmentMetaSchema).optional(),
});
export type WireEmail = z.infer<typeof wireEmailSchema>;

export const wireUnsubscribeSchema = z.object({
  listUnsubscribe: z.string(),
  listUnsubscribePost: z.string().optional(),
});
export type WireUnsubscribe = z.infer<typeof wireUnsubscribeSchema>;

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  backend: z.string().optional(),
  domain: z.string().optional(),
  address: z.string().optional(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const listResponseSchema = z.object({
  emails: z.array(wireEmailSchema),
  nextCursor: z.string().optional(),
  total: z.number().optional(),
});
export type ListResponse = z.infer<typeof listResponseSchema>;

export const emailsResponseSchema = z.object({ emails: z.array(wireEmailSchema) });
export type EmailsResponse = z.infer<typeof emailsResponseSchema>;

export const idsResponseSchema = z.object({ ids: z.array(z.string()) });
export type IdsResponse = z.infer<typeof idsResponseSchema>;

export const idResponseSchema = z.object({ id: z.string().nullable() });
export type IdResponse = z.infer<typeof idResponseSchema>;

export const unsubscribeResponseSchema = z.object({
  unsubscribe: wireUnsubscribeSchema.nullable(),
});
export type UnsubscribeResponse = z.infer<typeof unsubscribeResponseSchema>;

export const attachmentsResponseSchema = z.object({
  attachments: z.array(attachmentMetaSchema),
});
export type AttachmentsResponse = z.infer<typeof attachmentsResponseSchema>;

export const errorResponseSchema = z.object({ error: z.string() });
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const SENDER_NAME_MAX_CHARS = 100;

export const tokenBodySchema = z.object({
  address: z.string().optional(),
  name: z.string().nullable().optional(),
});

export const markReadBodySchema = z.object({
  ids: z.array(z.string()).optional(),
  read: z.boolean().optional(),
});

export const idsBodySchema = z.object({ ids: z.array(z.string()).optional() });

export const flagsBodySchema = z.object({
  starred: z.boolean().optional(),
  read: z.boolean().optional(),
});

export interface TokenRow {
  address: string;
  name: string | null;
  created_at: string;
}
