import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { requireMailbox, withToolErrors } from "@/mastra/toolkit/resolve";
import { draftFields, mailboxTarget, messageTarget, signatureField } from "@/mastra/toolkit/schema";
import * as mail from "@/ops/mail";

import { mcpScopeFromCall } from "../context";
import { inWorkspace } from "../schema";

export const markRead = createTool({
  id: "markRead",
  description: "Mark one or more emails in a specific mailbox as read or unread.",
  inputSchema: inWorkspace({
    ...mailboxTarget,
    ids: z.array(z.string()).min(1),
    read: z.boolean(),
  }),
  execute: async ({ workspaceId, mailboxId, ids, read }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.markRead(r.mailbox, ids, read);
    }),
});

export const starEmail = createTool({
  id: "starEmail",
  description: "Star or unstar an email in a specific mailbox.",
  inputSchema: inWorkspace({ ...messageTarget, starred: z.boolean() }),
  execute: async ({ workspaceId, mailboxId, id, starred }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.star(r.mailbox, id, starred);
    }),
});

export const archiveEmail = createTool({
  id: "archiveEmail",
  description:
    "Archive an email in a specific mailbox (removes it from the inbox without deleting it).",
  inputSchema: inWorkspace(messageTarget),
  execute: async ({ workspaceId, mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.archive(r.mailbox, id);
    }),
});

export const restoreEmail = createTool({
  id: "restoreEmail",
  description: "Restore an archived or trashed email in a specific mailbox back to the inbox.",
  inputSchema: inWorkspace(messageTarget),
  execute: async ({ workspaceId, mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.restore(r.mailbox, id);
    }),
});

export const deleteEmails = createTool({
  id: "deleteEmails",
  description:
    "Move the listed emails to the trash in a specific mailbox. Provide the mailboxId and the exact email ids.",
  inputSchema: inWorkspace({
    ...mailboxTarget,
    ids: z.array(z.string()).min(1),
  }),
  execute: async ({ workspaceId, mailboxId, ids }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.trash(r.mailbox, ids);
    }),
});

export const sendEmail = createTool({
  id: "sendEmail",
  description:
    "Send a new email from a specific mailbox. Provide the mailboxId to send from. Prefer createDraft when the user has not asked for it to go out.",
  inputSchema: inWorkspace({ ...mailboxTarget, ...draftFields, ...signatureField }),
  execute: async (
    { workspaceId, mailboxId, to, cc, bcc, subject, bodyHtml, signature },
    { requestContext },
  ) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.send(
        ctx,
        r.mailbox,
        { to, cc, bcc, subject, bodyHtml },
        { signature: signature ?? true },
      );
    }),
});
