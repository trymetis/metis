import "server-only";
import { z } from "zod";

import type { AuditActor } from "@/audit";
import {
  attachOwnedAddressBook,
  attachOwnedCalendar,
  attachOwnedDrive,
  attachOwnedMailbox,
  type ConnectionResource,
  listAccountAddressBooks,
  listAccountCalendars,
  listAccountDrives,
  listAccountMailboxes,
  listUnavailableConnections,
} from "@/connections";
import { createInvite, listAccountInvites, revokeAccountInvite } from "@/invites";
import type { McpWorkspace } from "@/mcp/workspaces";
import {
  addressBookProviderSchema,
  calendarProviderSchema,
  connectionResourceSchema,
  grantedInstanceRoleSchema,
  mailProviderSchema,
  workspaceRoleSchema,
  type DashboardInvitesInput,
} from "@/server/schema";
import type { InstanceRole } from "@/types/instance-role";
import { createWorkspace as createOwnedWorkspace } from "@/workspace";

import { listDrives, listDrivesOutput } from "./drive";
import { listMembers, listMembersOutput } from "./member";
import { orFailure, type Output } from "./output";
import type { WorkspaceCtx } from "./scope";

export const listWorkspacesOutput = z.object({
  count: z.number(),
  workspaces: z.array(
    z.object({
      workspaceId: z.string(),
      slug: z.string(),
      name: z.string(),
      role: workspaceRoleSchema,
    }),
  ),
});

export const getWorkspaceOutput = z.object({
  workspaceId: z.string(),
  slug: z.string(),
  name: z.string(),
  role: workspaceRoleSchema,
  mailboxes: z.array(
    z.object({ mailboxId: z.string(), provider: mailProviderSchema, email: z.string() }),
  ),
  calendarAccounts: z.array(
    z.object({
      calendarAccountId: z.string(),
      email: z.string(),
      provider: calendarProviderSchema,
    }),
  ),
  drives: listDrivesOutput.shape.drives,
  addressBooks: z.array(
    z.object({
      addressBookId: z.string(),
      email: z.string(),
      provider: addressBookProviderSchema,
    }),
  ),
  members: listMembersOutput.shape.members,
});

const accountResourceOutput = z.object({
  resourceId: z.string(),
  provider: z.string(),
  email: z.string(),
  workspaces: z.array(
    z.object({ workspace: z.string(), workspaceSlug: z.string(), aiEnabled: z.boolean() }),
  ),
});

export const listAccountResourcesOutput = z.object({
  mailboxes: z.array(accountResourceOutput),
  calendars: z.array(accountResourceOutput),
  drives: z.array(accountResourceOutput),
  addressBooks: z.array(accountResourceOutput),
});

export const listUnavailableAccountsOutput = z.object({
  count: z.number(),
  accounts: z.array(
    z.object({ provider: z.string(), email: z.string(), unavailableSince: z.string() }),
  ),
  note: z.string().optional(),
});

export const createWorkspaceOutput = z.object({
  created: z.literal(true),
  workspaceId: z.string(),
  slug: z.string(),
  name: z.string(),
  note: z.string(),
});

export const attachResourceOutput = orFailure(
  z.object({
    attached: z.literal(true),
    kind: connectionResourceSchema,
    resourceId: z.string(),
    workspaceId: z.string(),
    aiEnabled: z.literal(false),
    note: z.string(),
  }),
);

export const listSignupInvitesOutput = orFailure(
  z.object({
    count: z.number(),
    invites: z.array(
      z.object({
        inviteId: z.string(),
        email: z.string(),
        instanceRole: grantedInstanceRoleSchema.nullable(),
        invitedBy: z.string().nullable(),
        expiresAt: z.string(),
        expired: z.boolean(),
        createdAt: z.string(),
      }),
    ),
  }),
);

export const createSignupInviteOutput = orFailure(
  z.object({
    invited: z.literal(true),
    inviteId: z.string(),
    email: z.string(),
    expiresAt: z.string(),
  }),
);

export const revokeSignupInviteOutput = orFailure(
  z.object({ revoked: z.literal(true), inviteId: z.string() }),
);

export interface AccountCtx {
  userId: string;
  userName: string;
  userEmail: string;
  instanceRole: InstanceRole | null;
  clientId: string;
  hiddenWorkspaceIds: string[];
}

function mcpActor(account: AccountCtx): AuditActor {
  return { userId: account.userId, via: "mcp", mcpClientId: account.clientId };
}

export function listWorkspaces(visible: McpWorkspace[]): Output<typeof listWorkspacesOutput> {
  return {
    count: visible.length,
    workspaces: visible.map((w) => ({
      workspaceId: w.id,
      slug: w.slug,
      name: w.name,
      role: w.role,
    })),
  };
}

export async function getWorkspace(
  workspace: McpWorkspace,
  ctx: WorkspaceCtx,
): Promise<Output<typeof getWorkspaceOutput>> {
  const members = await listMembers(ctx);
  return {
    workspaceId: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
    role: workspace.role,
    mailboxes: ctx.mailboxes.map((m) => ({
      mailboxId: m.mailboxId,
      provider: m.provider,
      email: m.email,
    })),
    calendarAccounts: ctx.calendars.map((c) => ({
      calendarAccountId: c.accountId,
      email: c.accountEmail,
      provider: c.provider,
    })),
    drives: listDrives(ctx.drives).drives,
    addressBooks: ctx.addressBooks.map((b) => ({
      addressBookId: b.accountId,
      email: b.accountEmail,
      provider: b.provider,
    })),
    members: members.members,
  };
}

type AccountResource = {
  provider: string;
  email: string;
  workspaces: { name: string; workspaceSlug: string; aiEnabled: boolean }[];
};

function reachableResources<T extends AccountResource>(
  resources: T[],
  visible: McpWorkspace[],
  idOf: (resource: T) => string,
): Output<typeof accountResourceOutput>[] {
  const slugs = new Set(visible.map((w) => w.slug));
  return resources.flatMap((resource) => {
    const links = resource.workspaces.filter((w) => slugs.has(w.workspaceSlug));
    if (resource.workspaces.length > 0 && links.length === 0) return [];
    return [
      {
        resourceId: idOf(resource),
        provider: resource.provider,
        email: resource.email,
        workspaces: links.map((w) => ({
          workspace: w.name,
          workspaceSlug: w.workspaceSlug,
          aiEnabled: w.aiEnabled,
        })),
      },
    ];
  });
}

export async function listAccountResources(
  account: AccountCtx,
  visible: McpWorkspace[],
): Promise<Output<typeof listAccountResourcesOutput>> {
  const [mailboxes, calendars, drives, addressBooks] = await Promise.all([
    listAccountMailboxes(account.userId),
    listAccountCalendars(account.userId),
    listAccountDrives(account.userId),
    listAccountAddressBooks(account.userId),
  ]);
  return {
    mailboxes: reachableResources(mailboxes, visible, (m) => m.mailboxId),
    calendars: reachableResources(calendars, visible, (c) => c.calendarId),
    drives: reachableResources(drives, visible, (d) => d.driveId),
    addressBooks: reachableResources(addressBooks, visible, (b) => b.addressBookId),
  };
}

export async function listUnavailableAccounts(
  account: AccountCtx,
): Promise<Output<typeof listUnavailableAccountsOutput>> {
  const rows = (await listUnavailableConnections(account.userId)).filter((r) => r.mine);
  return {
    count: rows.length,
    accounts: rows.map((r) => ({
      provider: r.provider,
      email: r.email,
      unavailableSince: r.quarantinedAt.toISOString(),
    })),
    note:
      rows.length > 0
        ? "These accounts stopped working on this server and need attention in Metis Suite under Settings → Connections; their mailboxes, calendars, drives and address books are unreachable until then."
        : undefined,
  };
}

export async function createWorkspace(
  account: AccountCtx,
  name: string,
): Promise<Output<typeof createWorkspaceOutput>> {
  const created = await createOwnedWorkspace({
    name,
    ownerUserId: account.userId,
  });
  return {
    created: true,
    workspaceId: created.workspaceId,
    slug: created.slug,
    name,
    note: "It starts empty. Mailboxes, calendars, drives and address books attached to it have AI off until you turn it on in Metis Suite.",
  };
}

function attachOwned(
  kind: ConnectionResource,
  { resourceId, ...base }: { userId: string; workspaceId: string; resourceId: string },
) {
  switch (kind) {
    case "mailbox":
      return attachOwnedMailbox({ ...base, mailboxId: resourceId });
    case "calendar":
      return attachOwnedCalendar({ ...base, calendarId: resourceId });
    case "drive":
      return attachOwnedDrive({ ...base, driveId: resourceId });
    case "addressbook":
      return attachOwnedAddressBook({ ...base, addressBookId: resourceId });
  }
}

export async function attachResource(
  account: AccountCtx,
  workspaceId: string,
  args: { kind: ConnectionResource; resourceId: string },
): Promise<Output<typeof attachResourceOutput>> {
  const linked = await attachOwned(args.kind, {
    userId: account.userId,
    workspaceId,
    resourceId: args.resourceId,
  });
  if ("error" in linked) return { error: linked.error };
  return {
    attached: true,
    kind: args.kind,
    resourceId: args.resourceId,
    workspaceId,
    aiEnabled: false,
    note: "AI is off for it in this workspace until you turn it on in Metis Suite, so no tool can read it yet.",
  };
}

export async function listSignupInvites(
  account: AccountCtx,
  filter: DashboardInvitesInput,
): Promise<Output<typeof listSignupInvitesOutput>> {
  const rows = await listAccountInvites(account.instanceRole, filter);
  if ("error" in rows) return { error: rows.error };
  return {
    count: rows.length,
    invites: rows.map(({ id, ...row }) => ({ inviteId: id, ...row })),
  };
}

export async function createSignupInvite(
  account: AccountCtx,
  email: string,
): Promise<Output<typeof createSignupInviteOutput>> {
  const sent = await createInvite({
    email,
    workspace: null,
    instanceRole: null,
    inviter: { userId: account.userId, name: account.userName, email: account.userEmail },
    by: mcpActor(account),
  });
  if ("error" in sent) return { error: sent.error };
  return {
    invited: true,
    inviteId: sent.invite.id,
    email: sent.invite.email,
    expiresAt: sent.invite.expiresAt.toISOString(),
  };
}

export async function revokeSignupInvite(
  account: AccountCtx,
  inviteId: string,
): Promise<Output<typeof revokeSignupInviteOutput>> {
  const result = await revokeAccountInvite({
    inviteId,
    actor: { userId: account.userId, email: account.userEmail },
    by: mcpActor(account),
  });
  if ("error" in result) return { error: result.error };
  return { revoked: true, inviteId };
}
