import type { MailProvider } from "@/connections/types";
import { isOneOf } from "@/lib/guards";

export const CUSTOM_LABEL_COLORS = [
  "red",
  "orange",
  "amber",
  "yellow",
  "green",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "purple",
  "pink",
  "navy",
  "gray",
] as const;
export type CustomLabelColor = (typeof CUSTOM_LABEL_COLORS)[number];

export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

export type LabelColor = CustomLabelColor | (string & {});

export function isLabelColor(value: unknown): value is LabelColor {
  return (
    isOneOf(CUSTOM_LABEL_COLORS, value) ||
    (typeof value === "string" && HEX_COLOR_PATTERN.test(value))
  );
}

export const MAIL_LABEL_SOURCES = ["ai", "user", "provider"] as const;
export type MailLabelSource = (typeof MAIL_LABEL_SOURCES)[number];

export const MAIL_REMOTE_CONTENT_MODES = ["block", "load"] as const;
export type MailRemoteContentMode = (typeof MAIL_REMOTE_CONTENT_MODES)[number];

export const MAIL_REMOTE_ALLOW_KINDS = ["address", "domain"] as const;
export type MailRemoteAllowKind = (typeof MAIL_REMOTE_ALLOW_KINDS)[number];

export const MAIL_SIGNATURE_SCOPES = ["personal", "mailbox", "workspace"] as const;
export type MailSignatureScope = (typeof MAIL_SIGNATURE_SCOPES)[number];

export const MAIL_SIGNATURE_KINDS = ["new", "reply"] as const;
export type MailSignatureKind = (typeof MAIL_SIGNATURE_KINDS)[number];

export const UNSUBSCRIBE_METHODS = ["one_click", "mailto", "link"] as const;
export type UnsubscribeMethod = (typeof UNSUBSCRIBE_METHODS)[number];

export const UNSUBSCRIBE_STATUSES = ["done", "manual", "failed"] as const;
export type UnsubscribeStatus = (typeof UNSUBSCRIBE_STATUSES)[number];

export const MAIL_FOLDERS = [
  "inbox",
  "sent",
  "drafts",
  "starred",
  "trash",
  "archive",
  "spam",
] as const;
export type MailFolder = (typeof MAIL_FOLDERS)[number];

export function isMailFolder(value: unknown): value is MailFolder {
  return isOneOf(MAIL_FOLDERS, value);
}

export const UNDO_SEND_STATUSES = [
  "pending",
  "sending",
  "sent",
  "failed",
  "cancelled",
  "scheduled",
] as const;
export type UndoSendStatus = (typeof UNDO_SEND_STATUSES)[number];

export interface Recipient {
  email: string;
  name?: string;
}

export interface Email {
  id: string;
  threadId?: string;
  from: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  toRecipients?: Recipient[];
  ccRecipients?: Recipient[];
  replyTo?: Recipient[];
  messageIdHeader?: string;
  references?: string;
  bcc?: string[];
  subject: string;
  snippet: string;
  bodyHtml?: string;
  bodyText?: string;
  date: string;
  isRead: boolean;
  isStarred: boolean;
  labels?: string[];
  provider: MailProvider;
  folder: MailFolder;
  mailboxId?: string;
  mailboxSlug?: string;
  mailboxEmail?: string;
  attachments?: Attachment[];
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface DraftAttachment {
  filename: string;
  mimeType: string;
  contentBase64: string;
}

export interface DraftPayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  inReplyTo?: string;
  references?: string;
  replyToMessageId?: string;
  attachments?: DraftAttachment[];
}

export interface UnsubscribeInfo {
  listUnsubscribe: string;
  listUnsubscribePost?: string;
}

export interface MailboxError {
  mailboxId: string;
  mailboxEmail: string;
  error: string;
}

export interface MessagesResponse {
  emails: Email[];
  nextPageToken?: string;
  total?: number;
  mailboxErrors?: MailboxError[];
}

export interface ThreadGroup {
  threadId: string;
  latest: Email;
  count: number;
  hasUnread: boolean;
  hasStarred: boolean;
  ids: string[];
}

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolInvocations?: ToolInvocation[];
}

export interface ToolInvocation {
  toolName: string;
  toolCallId: string;
  state: "partial-call" | "call" | "result";
  args?: Record<string, unknown>;
  result?: unknown;
}

export interface DeleteConfirmation {
  type: "single" | "bulk" | "all";
  emailIds?: string[];
  folder?: MailFolder;
  count?: number;
  subjects?: string[];
}
