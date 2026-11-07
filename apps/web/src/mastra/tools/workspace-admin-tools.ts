import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import * as admin from "@/ops/admin";

import { getWorkspaceCtx } from "../runtime-context";
import { requireMember, withToolErrors } from "../toolkit/resolve";
import { inviteTarget, memberTarget, themeFields } from "../toolkit/schema";

const listInvitesTool = createTool({
  id: "listInvites",
  description:
    "List the pending invitations to join this workspace. Workspace owners and admins only.",
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => admin.listInvites(getWorkspaceCtx(requestContext))),
});

const removeMemberTool = createTool({
  id: "removeMember",
  description:
    "Remove someone from this workspace. Their mailboxes, calendars, drives and address books are detached from it. Workspace owners and admins only.",
  inputSchema: z.object({
    ...memberTarget,
    summary: z.string().describe("Short description of who is being removed"),
  }),
  requireApproval: true,
  execute: async ({ memberId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = await requireMember(ctx, memberId);
      if ("error" in r) return r;
      return admin.removeMember(ctx, r.member);
    }),
});

const revokeInviteTool = createTool({
  id: "revokeInvite",
  description: "Revoke a pending invitation to this workspace. Workspace owners and admins only.",
  inputSchema: z.object({
    ...inviteTarget,
    summary: z.string().describe("Short description of whose invitation is revoked"),
  }),
  requireApproval: true,
  execute: async ({ inviteId }, { requestContext }) =>
    withToolErrors(async () => admin.revokeInvite(getWorkspaceCtx(requestContext), inviteId)),
});

const setWorkspaceThemeTool = createTool({
  id: "setWorkspaceTheme",
  description:
    "Change this workspace's accent color for everyone in it. Workspace owners and admins only.",
  inputSchema: z.object({
    ...themeFields,
    summary: z.string().describe("Short description of the new accent color"),
  }),
  requireApproval: true,
  execute: async ({ themeBrand }, { requestContext }) =>
    withToolErrors(async () =>
      admin.setWorkspaceTheme(getWorkspaceCtx(requestContext), themeBrand),
    ),
});

export const workspaceAdminTools = {
  listInvites: listInvitesTool,
  removeMember: removeMemberTool,
  revokeInvite: revokeInviteTool,
  setWorkspaceTheme: setWorkspaceThemeTool,
};
