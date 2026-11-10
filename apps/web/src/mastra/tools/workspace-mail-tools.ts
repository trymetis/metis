import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import * as labels from "@/ops/labels";
import * as mail from "@/ops/mail";
import { analyzePhishing } from "@/ops/phishing";

import { actorHeaders, getWorkspaceCtx } from "../runtime-context";
import { requireMailbox, withToolErrors } from "../toolkit/resolve";
import {
  attachmentTarget,
  createLabelFields,
  draftFields,
  draftTarget,
  labelKeyTarget,
  updateLabelFields,
  listEmailsFields,
  mailboxTarget,
  messageTarget,
  setLabelsFields,
  signatureField,
  summarizeThreadFields,
} from "../toolkit/schema";

const listMailboxesTool = createTool({
  id: "listMailboxes",
  description:
    "List every connected mailbox in this workspace, with each mailbox's id, provider, and email address. Call this when you need a mailboxId the conversation has not already given you. Skip it when the user's message carries an inline <@mailbox:…> reference — those ids are already resolved.",
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      return {
        count: ctx.mailboxes.length,
        mailboxes: ctx.mailboxes.map((m) => ({
          mailboxId: m.mailboxId,
          provider: m.provider,
          email: m.email,
        })),
      };
    }),
});

const aggregateInboxTool = createTool({
  id: "aggregateInbox",
  description:
    "Fetch the most recent inbox emails from EVERY connected mailbox and return them merged, each tagged with its source mailbox. Use for workspace-wide overviews like 'what needs my attention across all mailboxes'.",
  inputSchema: z.object({
    perMailbox: z.number().min(1).max(25).default(8),
  }),
  execute: async ({ perMailbox }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      return mail.aggregateInbox(ctx.mailboxes, perMailbox);
    }),
});

const searchMailTool = createTool({
  id: "searchMail",
  description:
    "Search connected mailboxes for emails matching a query. Searches EVERY mailbox by default; pass mailboxId to search just one. Returns matches merged and tagged with the source mailbox.",
  inputSchema: z.object({
    query: z.string(),
    mailboxId: z.string().optional().describe("Restrict the search to this one mailbox"),
  }),
  execute: async ({ query, mailboxId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      if (!mailboxId) return mail.searchAcross(ctx.mailboxes, query);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.searchAcross([r.mailbox], query);
    }),
});

const listEmailsTool = createTool({
  id: "listEmails",
  description:
    "List emails from a folder in ONE specific connected mailbox. Pass the returned nextPageToken back as pageToken to fetch the next page.",
  inputSchema: z.object(listEmailsFields),
  execute: async ({ mailboxId, folder, limit, pageToken }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.listMessages(r.mailbox, { folder, limit, pageToken });
    }),
});

const getEmailTool = createTool({
  id: "getEmail",
  description:
    "Fetch the full plain-text body of an email in a specific mailbox. Provide the mailboxId it belongs to.",
  inputSchema: z.object(messageTarget),
  execute: async ({ mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.getBody(r.mailbox, id);
    }),
});

const getThreadTool = createTool({
  id: "getThread",
  description:
    "Fetch every email in a conversation thread in a specific mailbox, oldest first. Use the threadId returned by listEmails, aggregateInbox, or searchMail.",
  inputSchema: z.object({ ...mailboxTarget, threadId: z.string() }),
  execute: async ({ mailboxId, threadId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.getThread(r.mailbox, threadId);
    }),
});

const markReadTool = createTool({
  id: "markRead",
  description: "Mark one or more emails in a specific mailbox as read or unread.",
  inputSchema: z.object({
    ...mailboxTarget,
    ids: z.array(z.string()).min(1),
    read: z.boolean(),
  }),
  execute: async ({ mailboxId, ids, read }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.markRead(r.mailbox, ids, read);
    }),
});

const starEmailTool = createTool({
  id: "starEmail",
  description: "Star or unstar an email in a specific mailbox.",
  inputSchema: z.object({ ...messageTarget, starred: z.boolean() }),
  execute: async ({ mailboxId, id, starred }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.star(r.mailbox, id, starred);
    }),
});

const archiveEmailTool = createTool({
  id: "archiveEmail",
  description: "Archive an email in a specific mailbox — it leaves the inbox but is not deleted.",
  inputSchema: z.object(messageTarget),
  execute: async ({ mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.archive(r.mailbox, id);
    }),
});

const restoreEmailTool = createTool({
  id: "restoreEmail",
  description: "Restore an archived or trashed email in a specific mailbox back to the inbox.",
  inputSchema: z.object(messageTarget),
  execute: async ({ mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.restore(r.mailbox, id);
    }),
});

const deleteEmailsTool = createTool({
  id: "deleteEmails",
  description:
    "Move the listed emails to the trash in a specific mailbox. Provide the mailboxId and the exact email ids.",
  inputSchema: z.object({
    ...mailboxTarget,
    ids: z.array(z.string()).min(1),
    summary: z
      .string()
      .describe("Short description of what will be deleted and from which mailbox"),
  }),
  requireApproval: true,
  execute: async ({ mailboxId, ids }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.trash(r.mailbox, ids);
    }),
});

const sendEmailTool = createTool({
  id: "sendEmail",
  description: "Send a new email from a specific mailbox. Provide the mailboxId to send from.",
  inputSchema: z.object({
    ...mailboxTarget,
    ...draftFields,
    ...signatureField,
    summary: z.string().describe("Short description of the mail that will go out, and to whom"),
  }),
  execute: async ({ mailboxId, to, cc, bcc, subject, bodyHtml, signature }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.send(
        ctx,
        r.mailbox,
        { to, cc, bcc, subject, bodyHtml },
        { signature: signature ?? true },
      );
    }),
  requireApproval: true,
});

const createDraftTool = createTool({
  id: "createDraft",
  description:
    "Create a draft email in a specific mailbox. The draft is saved to the provider's Drafts folder — nothing is sent. Returns the draft id for later updates.",
  inputSchema: z.object({ ...mailboxTarget, ...draftFields, ...signatureField }),
  execute: async ({ mailboxId, to, cc, bcc, subject, bodyHtml, signature }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.createDraft(
        ctx,
        r.mailbox,
        { to, cc, bcc, subject, bodyHtml },
        { signature: signature ?? true },
      );
    }),
});

const updateDraftTool = createTool({
  id: "updateDraft",
  description: "Replace the contents of an existing draft in a specific mailbox. Nothing is sent.",
  inputSchema: z.object({
    ...mailboxTarget,
    draftId: z.string(),
    ...draftFields,
  }),
  execute: async ({ mailboxId, draftId, to, cc, bcc, subject, bodyHtml }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.updateDraft(r.mailbox, draftId, {
        to,
        cc,
        bcc,
        subject,
        bodyHtml,
      });
    }),
});

const listLabelsTool = createTool({
  id: "listLabels",
  description:
    "List every label key available in this workspace: the built-in labels plus custom labels. Use these exact keys with setLabel.",
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      return labels.listLabels(ctx.mailboxes.map((m) => m.mailboxId));
    }),
});

const setLabelTool = createTool({
  id: "setLabel",
  description:
    "Set or change an email's label in a specific mailbox. The label must be an existing built-in or custom label key — never invent keys.",
  inputSchema: z.object({ ...messageTarget, label: z.string() }),
  execute: async ({ mailboxId, id, label }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return labels.setLabel({
        userId: ctx.userId,
        mailbox: r.mailbox,
        id,
        label,
      });
    }),
});

const clearLabelTool = createTool({
  id: "clearLabel",
  description: "Remove the label from an email in a specific mailbox.",
  inputSchema: z.object(messageTarget),
  execute: async ({ mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return labels.clearLabel(r.mailbox, id);
    }),
});

const analyzePhishingTool = createTool({
  id: "analyzePhishing",
  description:
    "Run the phishing-detection engine on an email in a specific mailbox. Returns classification, risk score, confidence, and reasons.",
  inputSchema: z.object(messageTarget),
  execute: async ({ mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return analyzePhishing({
        mailbox: r.mailbox,
        userId: ctx.userId,
        id,
        headers: actorHeaders(ctx),
      });
    }),
});

const listAttachmentsTool = createTool({
  id: "listAttachments",
  description:
    "List the attachments on an email in a specific mailbox — attachmentId, filename, type and size.",
  inputSchema: z.object(messageTarget),
  execute: async ({ mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.listAttachments(r.mailbox, id);
    }),
});

const getAttachmentTextTool = createTool({
  id: "getAttachmentText",
  description:
    "Read an email attachment as text: PDFs, calendar invites, contact cards, wallet passes and forwarded emails come back as extracted data, plain-text files as their text. Get the attachmentId from listAttachments.",
  inputSchema: z.object(attachmentTarget),
  execute: async ({ mailboxId, id, attachmentId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.getAttachmentText(r.mailbox, id, attachmentId);
    }),
});

const createLabelTool = createTool({
  id: "createLabel",
  description:
    "Create a custom label in a specific mailbox. Returns its key for setLabel and setLabels.",
  inputSchema: z.object(createLabelFields),
  execute: async ({ mailboxId, name, color }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return labels.createLabel({
        userId: ctx.userId,
        mailbox: r.mailbox,
        name,
        color,
      });
    }),
});

const updateLabelTool = createTool({
  id: "updateLabel",
  description:
    "Rename or recolor a custom label in a specific mailbox. Its key stays the same, so labelled emails and workflows keep it.",
  inputSchema: z.object(updateLabelFields),
  execute: async ({ mailboxId, label, name, color }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return labels.updateLabel({ mailbox: r.mailbox, key: label, name, color });
    }),
});

const deleteLabelTool = createTool({
  id: "deleteLabel",
  description: "Delete a custom label from a specific mailbox. Built-in labels cannot be deleted.",
  inputSchema: z.object({
    ...labelKeyTarget,
    summary: z.string().describe("Short description of the label being deleted and where"),
  }),
  requireApproval: true,
  execute: async ({ mailboxId, label }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return labels.deleteLabel(r.mailbox, label);
    }),
});

const setLabelsTool = createTool({
  id: "setLabels",
  description:
    "Set the same label on several emails in a specific mailbox at once. The label must be an existing key from listLabels. Returns each email's previous label.",
  inputSchema: z.object(setLabelsFields),
  execute: async ({ mailboxId, ids, label }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return labels.setLabels({
        userId: ctx.userId,
        mailbox: r.mailbox,
        ids,
        label,
      });
    }),
});

const deleteDraftTool = createTool({
  id: "deleteDraft",
  description: "Delete a draft from a specific mailbox.",
  inputSchema: z.object({
    ...draftTarget,
    summary: z.string().describe("Short description of the draft being deleted and where"),
  }),
  requireApproval: true,
  execute: async ({ mailboxId, draftId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.deleteDraft(r.mailbox, draftId);
    }),
});

const getRawEmailTool = createTool({
  id: "getRawEmail",
  description:
    "Fetch the raw source of an email in a specific mailbox — every header and MIME part. Use for delivery questions (Received, SPF, DKIM, DMARC, reply-to).",
  inputSchema: z.object(messageTarget),
  execute: async ({ mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.getRawEmail(r.mailbox, id);
    }),
});

const summarizeThreadTool = createTool({
  id: "summarizeThread",
  description:
    "Summarize a conversation in a specific mailbox into cards — decisions, action items, dates, amounts and links — the same summary the app shows. Pass the latest email's id and, when you have it, the threadId.",
  inputSchema: z.object(summarizeThreadFields),
  execute: async ({ mailboxId, id, threadId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.summarizeThread(ctx, r.mailbox, { id, threadId });
    }),
});

export const workspaceMailTools = {
  listMailboxes: listMailboxesTool,
  aggregateInbox: aggregateInboxTool,
  searchMail: searchMailTool,
  listEmails: listEmailsTool,
  getEmail: getEmailTool,
  getThread: getThreadTool,
  markRead: markReadTool,
  starEmail: starEmailTool,
  archiveEmail: archiveEmailTool,
  restoreEmail: restoreEmailTool,
  deleteEmails: deleteEmailsTool,
  sendEmail: sendEmailTool,
  createDraft: createDraftTool,
  updateDraft: updateDraftTool,
  analyzePhishing: analyzePhishingTool,
  listLabels: listLabelsTool,
  setLabel: setLabelTool,
  clearLabel: clearLabelTool,
  listAttachments: listAttachmentsTool,
  getAttachmentText: getAttachmentTextTool,
  createLabel: createLabelTool,
  updateLabel: updateLabelTool,
  deleteLabel: deleteLabelTool,
  setLabels: setLabelsTool,
  deleteDraft: deleteDraftTool,
  getRawEmail: getRawEmailTool,
  summarizeThread: summarizeThreadTool,
};
