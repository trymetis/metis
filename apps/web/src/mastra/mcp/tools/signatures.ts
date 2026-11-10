import "server-only";
import { createTool } from "@mastra/core/tools";

import { requireMailbox, withToolErrors } from "@/mastra/toolkit/resolve";
import {
  footerFields,
  signatureFields,
  signatureListFields,
  signatureTarget,
} from "@/mastra/toolkit/schema";
import * as mail from "@/ops/mail";
import type { WorkspaceCtx } from "@/ops/scope";

import { mcpScopeFromCall } from "../context";
import { inWorkspace } from "../schema";

function mailboxOrNone(ctx: WorkspaceCtx, mailboxId: string | undefined) {
  if (!mailboxId) return { mailbox: null };
  return requireMailbox(ctx, mailboxId);
}

export const listSignatures = createTool({
  id: "listSignatures",
  description:
    "List a workspace's email signatures and its mail footer, and, for a mailbox, its signatures and your own.",
  inputSchema: inWorkspace(signatureListFields),
  execute: async ({ workspaceId, mailboxId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = mailboxOrNone(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.listSignatures(ctx, r.mailbox);
    }),
});

export const saveSignature = createTool({
  id: "saveSignature",
  description:
    "Add or edit an email signature: a workspace signature (owners and admins), a mailbox's signature (the person who connected it) or your own for a mailbox.",
  inputSchema: inWorkspace(signatureFields),
  execute: async (
    { workspaceId, scope, mailboxId, signatureId, name, html, defaultNew, defaultReply },
    { requestContext },
  ) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = mailboxOrNone(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.saveSignature(ctx, scope, r.mailbox, {
        signatureId,
        name,
        html,
        defaultNew,
        defaultReply,
      });
    }),
});

export const deleteSignature = createTool({
  id: "deleteSignature",
  description: "Delete an email signature, with the same rights as saving one.",
  inputSchema: inWorkspace(signatureTarget),
  execute: async ({ workspaceId, scope, mailboxId, signatureId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = mailboxOrNone(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.deleteSignature(ctx, scope, r.mailbox, signatureId);
    }),
});

export const setMailFooter = createTool({
  id: "setMailFooter",
  description:
    "Set or turn off the footer added to every message sent from a workspace. Senders cannot remove it. Workspace owners and admins only.",
  inputSchema: inWorkspace(footerFields),
  execute: async ({ workspaceId, html, enabled }, { requestContext }) =>
    withToolErrors(async () =>
      mail.setMailFooter(await mcpScopeFromCall(requestContext, workspaceId), { html, enabled }),
    ),
});
