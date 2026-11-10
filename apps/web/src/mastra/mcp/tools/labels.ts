import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { requireMailbox, withToolErrors } from "@/mastra/toolkit/resolve";
import {
  createLabelFields,
  labelKeyTarget,
  messageTarget,
  setLabelsFields,
  updateLabelFields,
} from "@/mastra/toolkit/schema";
import * as labels from "@/ops/labels";

import { mcpScopeFromCall } from "../context";
import { inWorkspace, workspaceTarget } from "../schema";

export const listLabels = createTool({
  id: "listLabels",
  description:
    "List every label key available in one workspace: the built-in labels plus the user's custom labels. Use these exact keys with setLabel.",
  inputSchema: z.object(workspaceTarget),
  execute: async ({ workspaceId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      return labels.listLabels(ctx.mailboxes.map((m) => m.mailboxId));
    }),
});

export const setLabel = createTool({
  id: "setLabel",
  description:
    "Set or change an email's label in a specific mailbox. The label must be an existing key from listLabels — never invent keys.",
  inputSchema: inWorkspace({ ...messageTarget, label: z.string() }),
  execute: async ({ workspaceId, mailboxId, id, label }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
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

export const setLabels = createTool({
  id: "setLabels",
  description:
    "Set the same label on several emails in a specific mailbox at once. The label must be an existing key from listLabels. Returns each email's previous label.",
  inputSchema: inWorkspace(setLabelsFields),
  execute: async ({ workspaceId, mailboxId, ids, label }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
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

export const createLabel = createTool({
  id: "createLabel",
  description:
    "Create a custom label in a specific mailbox. Returns its key for setLabel and setLabels.",
  inputSchema: inWorkspace(createLabelFields),
  execute: async ({ workspaceId, mailboxId, name, color }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
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

export const updateLabel = createTool({
  id: "updateLabel",
  description:
    "Rename or recolor a custom label in a specific mailbox. Its key stays the same, so labelled emails and workflows keep it.",
  inputSchema: inWorkspace(updateLabelFields),
  execute: async ({ workspaceId, mailboxId, label, name, color }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return labels.updateLabel({ mailbox: r.mailbox, key: label, name, color });
    }),
});

export const deleteLabel = createTool({
  id: "deleteLabel",
  description: "Delete a custom label from a specific mailbox. Built-in labels cannot be deleted.",
  inputSchema: inWorkspace(labelKeyTarget),
  execute: async ({ workspaceId, mailboxId, label }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return labels.deleteLabel(r.mailbox, label);
    }),
});

export const clearLabel = createTool({
  id: "clearLabel",
  description: "Remove the label from an email in a specific mailbox.",
  inputSchema: inWorkspace(messageTarget),
  execute: async ({ workspaceId, mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return labels.clearLabel(r.mailbox, id);
    }),
});
