import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { requireMember, withToolErrors } from "@/mastra/toolkit/resolve";
import { inviteTarget, memberTarget, themeFields } from "@/mastra/toolkit/schema";
import * as admin from "@/ops/admin";

import { mcpScopeFromCall } from "../context";
import { inWorkspace, workspaceTarget } from "../schema";

export const listInvites = createTool({
  id: "listInvites",
  description:
    "List the pending invitations to join one workspace. Workspace owners and admins only.",
  inputSchema: z.object(workspaceTarget),
  execute: async ({ workspaceId }, { requestContext }) =>
    withToolErrors(async () =>
      admin.listInvites(await mcpScopeFromCall(requestContext, workspaceId)),
    ),
});

export const removeMember = createTool({
  id: "removeMember",
  description:
    "Remove someone from a workspace. Their mailboxes, calendars, drives and address books are detached from it. Workspace owners and admins only.",
  inputSchema: inWorkspace(memberTarget),
  execute: async ({ workspaceId, memberId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = await requireMember(ctx, memberId);
      if ("error" in r) return r;
      return admin.removeMember(ctx, r.member);
    }),
});

export const revokeInvite = createTool({
  id: "revokeInvite",
  description: "Revoke a pending invitation to a workspace. Workspace owners and admins only.",
  inputSchema: inWorkspace(inviteTarget),
  execute: async ({ workspaceId, inviteId }, { requestContext }) =>
    withToolErrors(async () =>
      admin.revokeInvite(await mcpScopeFromCall(requestContext, workspaceId), inviteId),
    ),
});

export const setWorkspaceTheme = createTool({
  id: "setWorkspaceTheme",
  description:
    "Change a workspace's accent color for everyone in it. Workspace owners and admins only.",
  inputSchema: inWorkspace(themeFields),
  execute: async ({ workspaceId, themeBrand }, { requestContext }) =>
    withToolErrors(async () =>
      admin.setWorkspaceTheme(await mcpScopeFromCall(requestContext, workspaceId), themeBrand),
    ),
});
