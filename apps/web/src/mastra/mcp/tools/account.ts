import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { CONNECTION_RESOURCES } from "@/connections/types";
import { withToolErrors } from "@/mastra/toolkit/resolve";
import * as account from "@/ops/account";
import {
  createSignupInviteInputSchema,
  createWorkspaceInputSchema,
  revokeSignupInviteInputSchema,
  dashboardInvitesInputSchema,
} from "@/server/schema";

import { mcpAccountFromCall, mcpVisibleWorkspaces, mcpWorkspaceFromCall } from "../context";
import { inWorkspace, workspaceTarget } from "../schema";

export const listWorkspaces = createTool({
  id: "listWorkspaces",
  description:
    "List the Metis Suite workspaces this client can reach, with each one's workspaceId, name and your role in it. Every mailbox, calendar, drive, contact, workflow and member tool takes one of these workspaceIds and runs inside that workspace only. Call this first.",
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => account.listWorkspaces(await mcpVisibleWorkspaces(requestContext))),
});

export const getWorkspace = createTool({
  id: "getWorkspace",
  description:
    "Open one workspace: its name, your role, the mailboxes, calendar accounts, drives and address books that have AI turned on there, and its members — every id the other tools take for that workspace, in one call.",
  inputSchema: z.object(workspaceTarget),
  execute: async ({ workspaceId }, { requestContext }) =>
    withToolErrors(async () => {
      const { workspace, ctx } = await mcpWorkspaceFromCall(requestContext, workspaceId);
      return account.getWorkspace(workspace, ctx);
    }),
});

export const listAccountResources = createTool({
  id: "listAccountResources",
  description:
    "List the mailbox, calendar, drive and address book accounts you connected to Metis Suite, with the workspaces this client can reach that each one is attached to, and whether AI is on for it there. Accounts attached only to workspaces this client cannot reach are left out. Use a resourceId from here with attachResource. This lists accounts only — reading their contents goes through the workspace tools.",
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () =>
      account.listAccountResources(
        mcpAccountFromCall(requestContext),
        await mcpVisibleWorkspaces(requestContext),
      ),
    ),
});

export const listUnavailableAccounts = createTool({
  id: "listUnavailableAccounts",
  description:
    "List your connected accounts that stopped working on this server. Their mailboxes, calendars, drives and address books are unreachable until you fix them in Metis Suite.",
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => account.listUnavailableAccounts(mcpAccountFromCall(requestContext))),
});

export const createWorkspace = createTool({
  id: "createWorkspace",
  description: "Create a new, empty workspace that you own. Returns its workspaceId.",
  inputSchema: createWorkspaceInputSchema,
  execute: async ({ name }, { requestContext }) =>
    withToolErrors(async () => account.createWorkspace(mcpAccountFromCall(requestContext), name)),
});

export const attachResource = createTool({
  id: "attachResource",
  description:
    "Attach one of your own mailboxes, calendars, drives or address books to a workspace. Get the resourceId from listAccountResources. AI stays off for it in that workspace until you turn it on in Metis Suite, so attaching does not make it readable here.",
  inputSchema: inWorkspace({
    kind: z.enum(CONNECTION_RESOURCES),
    resourceId: z
      .string()
      .min(1)
      .describe("A mailbox, calendar, drive or address book resourceId from listAccountResources"),
  }),
  execute: async ({ workspaceId, kind, resourceId }, { requestContext }) =>
    withToolErrors(async () => {
      const { workspace } = await mcpWorkspaceFromCall(requestContext, workspaceId);
      return account.attachResource(mcpAccountFromCall(requestContext), workspace.id, {
        kind,
        resourceId,
      });
    }),
});

export const listSignupInvites = createTool({
  id: "listSignupInvites",
  description:
    "List the pending invitations for people to create a Metis Suite account on this server, with the instance role each gives, who sent it and whether it expired. Filter by an email search, role (admin, observer or none) and status (pending or expired). The instance owner, admins and observers can use it.",
  inputSchema: dashboardInvitesInputSchema,
  execute: async (input, { requestContext }) =>
    withToolErrors(async () =>
      account.listSignupInvites(mcpAccountFromCall(requestContext), input),
    ),
});

export const createSignupInvite = createTool({
  id: "createSignupInvite",
  description:
    "Invite someone to create a Metis Suite account on this server. It emails them a sign-up link that expires in 7 days. Only the instance owner and instance admins can use it.",
  inputSchema: createSignupInviteInputSchema,
  execute: async ({ email }, { requestContext }) =>
    withToolErrors(async () =>
      account.createSignupInvite(mcpAccountFromCall(requestContext), email),
    ),
});

export const revokeSignupInvite = createTool({
  id: "revokeSignupInvite",
  description:
    "Revoke a pending sign-up invitation. Get the inviteId from listSignupInvites. Only the instance owner and instance admins can use it.",
  inputSchema: revokeSignupInviteInputSchema,
  execute: async ({ inviteId }, { requestContext }) =>
    withToolErrors(async () =>
      account.revokeSignupInvite(mcpAccountFromCall(requestContext), inviteId),
    ),
});
