import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import * as mail from "@/ops/mail";
import type { WorkspaceCtx } from "@/ops/scope";

import { getWorkspaceCtx } from "../runtime-context";
import { requireMailbox, withToolErrors } from "../toolkit/resolve";
import {
  footerFields,
  signatureFields,
  signatureListFields,
  signatureTarget,
} from "../toolkit/schema";

function mailboxOrNone(ctx: WorkspaceCtx, mailboxId: string | undefined) {
  if (!mailboxId) return { mailbox: null };
  return requireMailbox(ctx, mailboxId);
}

const listSignaturesTool = createTool({
  id: "listSignatures",
  description:
    "List this workspace's email signatures and its mail footer, and, for a mailbox, its signatures and your own.",
  inputSchema: z.object(signatureListFields),
  execute: async ({ mailboxId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = mailboxOrNone(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.listSignatures(ctx, r.mailbox);
    }),
});

const saveSignatureTool = createTool({
  id: "saveSignature",
  description:
    "Add or edit an email signature: a workspace signature (owners and admins), a mailbox's signature (the person who connected it) or your own for a mailbox.",
  inputSchema: z.object({
    ...signatureFields,
    summary: z.string().describe("Short description of the signature being saved and where"),
  }),
  requireApproval: true,
  execute: async (
    { scope, mailboxId, signatureId, name, html, defaultNew, defaultReply },
    { requestContext },
  ) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
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

const deleteSignatureTool = createTool({
  id: "deleteSignature",
  description: "Delete an email signature, with the same rights as saving one.",
  inputSchema: z.object({
    ...signatureTarget,
    summary: z.string().describe("Short description of the signature being deleted"),
  }),
  requireApproval: true,
  execute: async ({ scope, mailboxId, signatureId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = mailboxOrNone(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.deleteSignature(ctx, scope, r.mailbox, signatureId);
    }),
});

const setMailFooterTool = createTool({
  id: "setMailFooter",
  description:
    "Set or turn off the footer added to every message sent from this workspace. Senders cannot remove it. Workspace owners and admins only.",
  inputSchema: z.object({
    ...footerFields,
    summary: z.string().describe("Short description of the footer change"),
  }),
  requireApproval: true,
  execute: async ({ html, enabled }, { requestContext }) =>
    withToolErrors(async () =>
      mail.setMailFooter(getWorkspaceCtx(requestContext), { html, enabled }),
    ),
});

export const workspaceSignatureTools = {
  listSignatures: listSignaturesTool,
  saveSignature: saveSignatureTool,
  deleteSignature: deleteSignatureTool,
  setMailFooter: setMailFooterTool,
};
