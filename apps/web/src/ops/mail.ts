import "server-only";
import { z } from "zod";

import { sanitizeError } from "@/lib/errors/sanitize-error";
import { looksTextual, TEXT_LIMIT } from "@/lib/file-utils";
import { htmlToText, truncate } from "@/lib/utils";
import { isParsableAttachment, parseAttachment } from "@/mail/attachment-data";
import { readRawMessage } from "@/mail/raw";
import { summaryCardSchema } from "@/mail/summary-catalog";
import { summarizeThread as summarizeConversation } from "@/mail/thread-summary";
import type { DraftPayload, Email, MailFolder } from "@/types/mail";

import type { Output } from "./output";
import { type AgentMailbox, mailScopeFor, type WorkspaceCtx } from "./scope";

export const emailSummaryOutput = z.object({
  id: z.string(),
  threadId: z.string().optional(),
  from: z.string(),
  subject: z.string(),
  date: z.string(),
  isRead: z.boolean(),
  isStarred: z.boolean(),
  snippet: z.string(),
});

const searchHitOutput = emailSummaryOutput.extend({ mailboxId: z.string(), mailbox: z.string() });

export const listMessagesOutput = z.object({
  mailbox: z.string(),
  count: z.number(),
  nextPageToken: z.string().optional(),
  emails: z.array(emailSummaryOutput),
});

export const aggregateInboxOutput = z.object({
  mailboxes: z.number(),
  count: z.number(),
  emails: z.array(
    z.union([
      searchHitOutput,
      z.object({ mailboxId: z.string(), mailbox: z.string(), error: z.string() }),
    ]),
  ),
});

export const searchAcrossOutput = z.object({ count: z.number(), emails: z.array(searchHitOutput) });

export const getBodyOutput = z.union([
  z.object({
    id: z.string(),
    from: z.string().optional(),
    to: z.array(z.string()).optional(),
    subject: z.string().optional(),
    date: z.string().optional(),
    hasContent: z.boolean(),
    body: z.string(),
  }),
  z.object({ id: z.string(), error: z.string() }),
]);

export const getThreadOutput = z.union([
  z.object({
    mailbox: z.string(),
    threadId: z.string(),
    count: z.number(),
    emails: z.array(emailSummaryOutput),
  }),
  z.object({ threadId: z.string(), error: z.string() }),
]);

export const starOutput = z.object({
  success: z.literal(true),
  mailboxId: z.string(),
  id: z.string(),
  starred: z.boolean(),
});

export const markReadOutput = z.object({
  success: z.literal(true),
  mailboxId: z.string(),
  ids: z.array(z.string()),
  read: z.boolean(),
});

export const messageDoneOutput = z.object({
  success: z.literal(true),
  mailboxId: z.string(),
  id: z.string(),
});

export const trashOutput = z.object({
  deleted: z.number(),
  mailboxId: z.string(),
  ids: z.array(z.string()),
});

export const sendOutput = z.object({
  sent: z.literal(true),
  mailboxId: z.string(),
  to: z.array(z.string()),
  subject: z.string(),
});

export const draftOutput = z.object({
  success: z.literal(true),
  mailboxId: z.string(),
  draftId: z.string(),
});

export const deleteDraftOutput = z.object({
  deleted: z.literal(true),
  mailboxId: z.string(),
  draftId: z.string(),
});

export const listAttachmentsOutput = z.object({
  mailboxId: z.string(),
  id: z.string(),
  count: z.number(),
  attachments: z.array(
    z.object({
      attachmentId: z.string(),
      filename: z.string(),
      mimeType: z.string(),
      size: z.number(),
    }),
  ),
});

export const getAttachmentTextOutput = z.union([
  z.object({
    attachmentId: z.string(),
    filename: z.string(),
    kind: z.string(),
    truncated: z.boolean(),
    text: z.string(),
  }),
  z.object({ error: z.string(), filename: z.string().optional(), mimeType: z.string().optional() }),
]);

export const getRawEmailOutput = z.object({
  mailboxId: z.string(),
  id: z.string(),
  truncated: z.boolean(),
  raw: z.string(),
});

export const summarizeThreadOutput = z.object({
  mailboxId: z.string(),
  id: z.string(),
  count: z.number(),
  cards: z.array(summaryCardSchema),
  note: z.string().optional(),
});

export function emailSummary(e: Email): Output<typeof emailSummaryOutput> {
  return {
    id: e.id,
    threadId: e.threadId,
    from: e.fromName || e.from,
    subject: e.subject,
    date: e.date,
    isRead: e.isRead,
    isStarred: e.isStarred,
    snippet: e.snippet.slice(0, 120),
  };
}

function searchHit(e: Email, mailbox: AgentMailbox): Output<typeof searchHitOutput> {
  return {
    mailboxId: mailbox.mailboxId,
    mailbox: mailbox.email,
    ...emailSummary(e),
  };
}

export async function listMessages(
  mailbox: AgentMailbox,
  args: { folder: MailFolder; limit: number; pageToken?: string },
): Promise<Output<typeof listMessagesOutput>> {
  const data = await mailbox.adapter.listMessages(args.folder, args.pageToken, args.limit);
  return {
    mailbox: mailbox.email,
    count: data.emails.length,
    nextPageToken: data.nextPageToken,
    emails: data.emails.map(emailSummary),
  };
}

export async function aggregateInbox(
  mailboxes: AgentMailbox[],
  perMailbox: number,
): Promise<Output<typeof aggregateInboxOutput>> {
  const groups = await Promise.all(
    mailboxes.map(async (m) => {
      try {
        const data = await m.adapter.listMessages("inbox", undefined, perMailbox);
        return data.emails.map((e) => searchHit(e, m));
      } catch (err) {
        console.error("[agent-tool]", err);
        return [
          {
            mailboxId: m.mailboxId,
            mailbox: m.email,
            error: sanitizeError(err),
          },
        ];
      }
    }),
  );
  const emails = groups.flat();
  return { mailboxes: mailboxes.length, count: emails.length, emails };
}

export async function searchAcross(
  mailboxes: AgentMailbox[],
  query: string,
): Promise<Output<typeof searchAcrossOutput>> {
  const groups = await Promise.all(
    mailboxes.map(async (m) => {
      try {
        const data = await m.adapter.search(query);
        return data.emails.map((e) => searchHit(e, m));
      } catch {
        return [];
      }
    }),
  );
  const emails = groups.flat();
  return { count: emails.length, emails };
}

export async function getBody(
  mailbox: AgentMailbox,
  id: string,
  maxChars = 8000,
): Promise<Output<typeof getBodyOutput>> {
  try {
    const data = await mailbox.adapter.getMessage(id);
    const text = data.bodyText ?? (data.bodyHtml ? htmlToText(data.bodyHtml) : "");
    return {
      id,
      from: data.fromName || data.from,
      to: data.to,
      subject: data.subject,
      date: data.date,
      hasContent: text.length > 0,
      body: truncate(text, maxChars),
    };
  } catch (err) {
    console.error("[agent-tool]", err);
    return { id, error: sanitizeError(err) };
  }
}

export async function getThread(
  mailbox: AgentMailbox,
  threadId: string,
): Promise<Output<typeof getThreadOutput>> {
  try {
    const emails = await mailbox.adapter.getThread(threadId);
    return {
      mailbox: mailbox.email,
      threadId,
      count: emails.length,
      emails: emails.map(emailSummary),
    };
  } catch (err) {
    console.error("[agent-tool]", err);
    return { threadId, error: sanitizeError(err) };
  }
}

export async function star(
  mailbox: AgentMailbox,
  id: string,
  starred: boolean,
): Promise<Output<typeof starOutput>> {
  await mailbox.adapter.starMessage(id, starred);
  return { success: true, mailboxId: mailbox.mailboxId, id, starred };
}

export async function markRead(
  mailbox: AgentMailbox,
  ids: string[],
  read: boolean,
): Promise<Output<typeof markReadOutput>> {
  await mailbox.adapter.batchMarkRead(ids, read);
  return { success: true, mailboxId: mailbox.mailboxId, ids, read };
}

export async function archive(
  mailbox: AgentMailbox,
  id: string,
): Promise<Output<typeof messageDoneOutput>> {
  await mailbox.adapter.archiveMessage(id);
  return { success: true, mailboxId: mailbox.mailboxId, id };
}

export async function restore(
  mailbox: AgentMailbox,
  id: string,
): Promise<Output<typeof messageDoneOutput>> {
  await mailbox.adapter.restoreMessage(id);
  return { success: true, mailboxId: mailbox.mailboxId, id };
}

export async function trash(
  mailbox: AgentMailbox,
  ids: string[],
): Promise<Output<typeof trashOutput>> {
  await mailbox.adapter.batchDelete(ids);
  return { deleted: ids.length, mailboxId: mailbox.mailboxId, ids };
}

export async function send(
  mailbox: AgentMailbox,
  payload: DraftPayload,
): Promise<Output<typeof sendOutput>> {
  await mailbox.adapter.sendMessage(payload);
  return {
    sent: true,
    mailboxId: mailbox.mailboxId,
    to: payload.to,
    subject: payload.subject,
  };
}

export async function createDraft(
  mailbox: AgentMailbox,
  payload: DraftPayload,
): Promise<Output<typeof draftOutput>> {
  const { id } = await mailbox.adapter.createDraft(payload);
  return { success: true, mailboxId: mailbox.mailboxId, draftId: id };
}

export async function updateDraft(
  mailbox: AgentMailbox,
  draftId: string,
  payload: DraftPayload,
): Promise<Output<typeof draftOutput>> {
  const updated = await mailbox.adapter.updateDraft(draftId, payload);
  return { success: true, mailboxId: mailbox.mailboxId, draftId: updated.id };
}

export async function deleteDraft(
  mailbox: AgentMailbox,
  draftId: string,
): Promise<Output<typeof deleteDraftOutput>> {
  await mailbox.adapter.deleteDraft(draftId);
  return { deleted: true, mailboxId: mailbox.mailboxId, draftId };
}

export async function listAttachments(
  mailbox: AgentMailbox,
  id: string,
): Promise<Output<typeof listAttachmentsOutput>> {
  const attachments = await mailbox.adapter.listAttachments(id);
  return {
    mailboxId: mailbox.mailboxId,
    id,
    count: attachments.length,
    attachments: attachments.map((a) => ({
      attachmentId: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
    })),
  };
}

export async function getAttachmentText(
  mailbox: AgentMailbox,
  id: string,
  attachmentId: string,
): Promise<Output<typeof getAttachmentTextOutput>> {
  const attachments = await mailbox.adapter.listAttachments(id);
  const meta = attachments.find((a) => a.id === attachmentId);
  if (!meta) {
    return {
      error: `Unknown attachmentId "${attachmentId}" on this email. These are all of them: ${
        attachments.map((a) => `${a.id} (${a.filename})`).join(", ") || "none"
      }`,
    };
  }

  const parsable = isParsableAttachment(meta);
  if (!parsable && !looksTextual(meta.filename, meta.mimeType)) {
    return {
      error:
        "That attachment is not readable as text. PDFs, calendar invites, contact cards, wallet passes, forwarded emails and plain-text files can be read.",
      filename: meta.filename,
      mimeType: meta.mimeType,
    };
  }

  const downloaded = await mailbox.adapter.downloadAttachment(id, attachmentId);
  if (!downloaded) return { error: "That attachment is no longer available" };

  const parsed = parsable ? await parseAttachment(meta, downloaded.buffer) : null;
  const text = parsed
    ? JSON.stringify(parsed.data)
    : downloaded.buffer.subarray(0, TEXT_LIMIT * 4).toString("utf-8");

  return {
    attachmentId,
    filename: meta.filename,
    kind: parsed?.label ?? "text",
    truncated: text.length > TEXT_LIMIT,
    text: truncate(text, TEXT_LIMIT),
  };
}

const RAW_LIMIT = 50_000;

export async function getRawEmail(
  mailbox: AgentMailbox,
  id: string,
): Promise<Output<typeof getRawEmailOutput>> {
  const raw = await readRawMessage(mailbox.adapter, id);
  return {
    mailboxId: mailbox.mailboxId,
    id,
    truncated: raw.length > RAW_LIMIT,
    raw: truncate(raw, RAW_LIMIT),
  };
}

export async function summarizeThread(
  ctx: WorkspaceCtx,
  mailbox: AgentMailbox,
  args: { id: string; threadId?: string },
): Promise<Output<typeof summarizeThreadOutput>> {
  const { cards } = await summarizeConversation(mailScopeFor(ctx, mailbox), args.id, args.threadId);
  return {
    mailboxId: mailbox.mailboxId,
    id: args.id,
    count: cards.length,
    cards,
    note: cards.length === 0 ? "Nothing in this conversation needed a summary card." : undefined,
  };
}
