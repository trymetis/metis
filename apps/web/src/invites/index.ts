import "server-only";
import crypto from "node:crypto";

import { and, desc, eq, gte, isNull, lt, type SQL, sql } from "drizzle-orm";

import { type AuditActor, recordAuditEvent } from "@/audit";
import { instanceRoleOf } from "@/auth/instance-role";
import { hashToken, newInviteToken } from "@/auth/invite-token";
import { isOwnerEmail } from "@/auth/owner";
import { createAccount, emailInUse, refreshHasAnyUser } from "@/auth/signup";
import { config } from "@/config";
import { getInstanceConfig } from "@/config/runtime";
import { db, type Executor } from "@/db";
import { invite, user as userTable, workspace, workspaceMember } from "@/db/schema";
import type { AccountInvite, DashboardInvitesInput } from "@/server/schema";
import { sendSignupInviteEmail, sendWorkspaceInviteEmail } from "@/services/mailer";
import { enforceRateLimit } from "@/services/rate-limit";
import {
  canGrantInstanceRole,
  canManageAccountInvites,
  type GrantedInstanceRole,
  type InstanceRole,
} from "@/types/instance-role";
import type { WorkspaceInviteRole, WorkspaceRole } from "@/types/workspace";
import { memberJoined } from "@/workflow/hooks";
import {
  appendWorkspaceOrder,
  getWorkspaceMember,
  isAdmin,
  setDefaultWorkspaceSlug,
} from "@/workspace";
import type { AdminRefusal } from "@/workspace/admin";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const INVITE_UNAVAILABLE = "This invite link is no longer valid";
export const INVITE_SIGN_UP_REFUSED =
  "Ask the instance owner or an instance admin to invite this person.";
const OWNER_ADDRESS = "The instance owner's address can't be invited";
const HAS_ACCOUNT = "That email already has an account";
const WRONG_ACCOUNT =
  "This invite was sent to a different email address. Sign out, then open the link again and sign in with the invited account.";

export type InviteRow = {
  id: string;
  email: string;
  workspaceId: string | null;
  workspaceRole: WorkspaceInviteRole | null;
  instanceRole: GrantedInstanceRole | null;
  expiresAt: Date;
  createdAt: Date;
};

type InviteRecord = typeof invite.$inferSelect;

type Refusal = { error: string; forbidden?: true };

const ACCOUNT_INVITES_ONLY: Refusal = {
  error: "Only the instance owner and instance admins can manage account invites",
  forbidden: true,
};

function inviteUrl(token: string): string {
  return `${config.auth.url}/invite/accept?token=${token}`;
}

export function pendingInvite(): SQL | undefined {
  return and(isNull(invite.acceptedAt), isNull(invite.declinedAt));
}

function rowOf(record: InviteRecord): InviteRow {
  return {
    id: record.id,
    email: record.email,
    workspaceId: record.workspaceId,
    workspaceRole: record.workspaceRole,
    instanceRole: record.instanceRole,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
  };
}

async function workspaceName(workspaceId: string, executor: Executor = db): Promise<string> {
  const [row] = await executor
    .select({ name: workspace.name })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);
  return row?.name ?? "Workspace";
}

async function isMember(workspaceId: string, email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: workspaceMember.id })
    .from(workspaceMember)
    .innerJoin(userTable, eq(userTable.id, workspaceMember.userId))
    .where(and(eq(workspaceMember.workspaceId, workspaceId), eq(userTable.email, email)))
    .limit(1);
  return Boolean(row);
}

async function permitted(opts: {
  inviterId: string;
  inviterRole: InstanceRole | null;
  workspace: { id: string } | null;
  instanceRole: GrantedInstanceRole | null;
}): Promise<Refusal | null> {
  if (opts.workspace) {
    if (opts.instanceRole) {
      return { error: "An instance role comes only with an account invite" };
    }
    const member = await getWorkspaceMember(opts.workspace.id, opts.inviterId);
    if (!member || !isAdmin(member.role)) {
      return { error: "Only workspace owners and admins can invite people", forbidden: true };
    }
    return null;
  }
  if (!canManageAccountInvites(opts.inviterRole)) return ACCOUNT_INVITES_ONLY;
  if (
    opts.inviterRole &&
    opts.instanceRole &&
    !canGrantInstanceRole(opts.inviterRole, opts.instanceRole)
  ) {
    return { error: "Only the instance owner can invite an admin", forbidden: true };
  }
  return null;
}

async function deliver(opts: {
  email: string;
  token: string;
  workspaceId: string | null;
  inviterName: string;
}): Promise<boolean> {
  if (getInstanceConfig().mailer.driver === "noop") return false;
  try {
    if (opts.workspaceId) {
      await sendWorkspaceInviteEmail({
        to: opts.email,
        url: inviteUrl(opts.token),
        workspaceName: await workspaceName(opts.workspaceId),
        inviterName: opts.inviterName,
      });
    } else {
      await sendSignupInviteEmail({
        to: opts.email,
        url: inviteUrl(opts.token),
        inviterName: opts.inviterName,
      });
    }
    return true;
  } catch (err) {
    console.error("[invites] failed to send email", err);
    return false;
  }
}

export async function createInvite(opts: {
  email: string;
  workspace: { id: string; role: WorkspaceInviteRole } | null;
  instanceRole: GrantedInstanceRole | null;
  inviter: { userId: string; name: string; email: string };
  by: AuditActor;
  linkOnFailure?: boolean;
}): Promise<{ invite: InviteRow; link: string | null } | Refusal> {
  const email = opts.email.trim().toLowerCase();
  const inviterRole = await instanceRoleOf({ id: opts.inviter.userId, email: opts.inviter.email });

  const refusal = await permitted({
    inviterId: opts.inviter.userId,
    inviterRole,
    workspace: opts.workspace,
    instanceRole: opts.instanceRole,
  });
  if (refusal) return refusal;

  const hasAccount = await emailInUse(email);
  if (isOwnerEmail(email) && (!opts.workspace || !hasAccount)) return { error: OWNER_ADDRESS };
  if (!opts.workspace && hasAccount) return { error: HAS_ACCOUNT };
  if (opts.workspace && hasAccount && (await isMember(opts.workspace.id, email))) {
    return { error: "That person is already a member of this workspace" };
  }
  if (
    opts.workspace &&
    !hasAccount &&
    getInstanceConfig().signup.signupDisabled &&
    inviterRole !== "owner" &&
    inviterRole !== "admin"
  ) {
    return { error: INVITE_SIGN_UP_REFUSED, forbidden: true };
  }

  await enforceRateLimit(`${opts.workspace?.id ?? "account"}:${opts.inviter.userId}`, {
    scope: "invite-send",
    limit: 10,
    windowSec: 60 * 60,
  });

  const now = new Date();
  const workspaceId = opts.workspace?.id ?? null;
  const sameTarget = and(
    eq(invite.email, email),
    workspaceId ? eq(invite.workspaceId, workspaceId) : isNull(invite.workspaceId),
    pendingInvite(),
  );
  await db.delete(invite).where(and(sameTarget, lt(invite.expiresAt, now)));

  const token = newInviteToken();
  const [created] = await db
    .insert(invite)
    .values({
      id: crypto.randomUUID(),
      email,
      tokenHash: hashToken(token),
      workspaceId,
      workspaceRole: opts.workspace?.role ?? null,
      instanceRole: opts.instanceRole,
      invitedBy: opts.inviter.userId,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning();
  if (!created) return { error: "That email already has a pending invite" };

  const sent = await deliver({
    email,
    token,
    workspaceId,
    inviterName: opts.inviter.name,
  });
  if (!sent && !(opts.linkOnFailure && inviterRole === "owner")) {
    await db.delete(invite).where(eq(invite.id, created.id));
    return {
      error:
        "The invite email couldn't be sent, so no invite was created. Ask the instance owner to check the mail settings, then try again.",
    };
  }

  const detail = {
    ...(created.workspaceRole ? { role: created.workspaceRole } : {}),
    ...(created.instanceRole ? { instanceRole: created.instanceRole } : {}),
  };
  await recordAuditEvent(opts.by, {
    action: "invite.created",
    workspaceId,
    targetLabel: email,
    detail,
  });
  if (!sent) {
    await recordAuditEvent(opts.by, {
      action: "invite.link_shown",
      workspaceId,
      targetLabel: email,
      detail,
    });
  }

  return { invite: rowOf(created), link: sent ? null : inviteUrl(token) };
}

async function findUsable(token: string, executor: Executor = db): Promise<InviteRecord | null> {
  const [record] = await executor
    .select()
    .from(invite)
    .where(eq(invite.tokenHash, hashToken(token)))
    .limit(1);
  if (!record || record.acceptedAt || record.declinedAt) return null;
  if (record.expiresAt.getTime() < Date.now()) return null;
  return record;
}

const INVITER_LOST_RIGHTS =
  "This invite is no longer valid. Ask the instance owner or an instance admin to invite you again.";

async function senderRole(record: InviteRecord, executor: Executor = db) {
  if (!record.invitedBy) return null;
  const [inviter] = await executor
    .select({ id: userTable.id, email: userTable.email })
    .from(userTable)
    .where(eq(userTable.id, record.invitedBy))
    .limit(1);
  return instanceRoleOf(inviter, executor);
}

async function signUpRefusal(
  record: InviteRecord,
  executor: Executor = db,
): Promise<string | null> {
  const role = await senderRole(record, executor);
  if (!record.workspaceId) {
    if (!canManageAccountInvites(role)) return INVITER_LOST_RIGHTS;
    if (role && record.instanceRole && !canGrantInstanceRole(role, record.instanceRole)) {
      return INVITER_LOST_RIGHTS;
    }
    return null;
  }
  if (getInstanceConfig().signup.signupDisabled && !canManageAccountInvites(role)) {
    return INVITE_SIGN_UP_REFUSED;
  }
  return null;
}

function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export type InvitePreview = {
  state: "accept" | "signIn" | "signUp";
  email: string | null;
  workspaceName: string | null;
  workspaceRole: WorkspaceInviteRole | null;
  instanceRole: GrantedInstanceRole | null;
  inviterName: string | null;
};

export async function previewInvite(
  token: string,
  signedIn: { email: string } | null,
): Promise<InvitePreview | { error: string }> {
  const record = await findUsable(token);
  if (!record) return { error: INVITE_UNAVAILABLE };
  if (signedIn && !sameEmail(signedIn.email, record.email)) return { error: WRONG_ACCOUNT };

  const hasAccount = await emailInUse(record.email);
  if (!record.workspaceId && hasAccount) return { error: HAS_ACCOUNT };
  if (!hasAccount && isOwnerEmail(record.email)) return { error: OWNER_ADDRESS };
  if (!hasAccount) {
    const refused = await signUpRefusal(record);
    if (refused) return { error: refused };
  }

  const [inviter] = record.invitedBy
    ? await db
        .select({ name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, record.invitedBy))
        .limit(1)
    : [];

  return {
    state: signedIn ? "accept" : hasAccount ? "signIn" : "signUp",
    email: !signedIn && !hasAccount ? record.email : null,
    workspaceName: record.workspaceId ? await workspaceName(record.workspaceId) : null,
    workspaceRole: record.workspaceRole,
    instanceRole: record.instanceRole,
    inviterName: inviter?.name ?? null,
  };
}

async function joinWorkspace(
  executor: Executor,
  record: InviteRecord & { workspaceId: string },
  member: { userId: string; email: string; name: string },
): Promise<void> {
  const [existing] = await executor
    .select({ id: workspaceMember.id })
    .from(workspaceMember)
    .where(
      and(
        eq(workspaceMember.workspaceId, record.workspaceId),
        eq(workspaceMember.userId, member.userId),
      ),
    )
    .limit(1);
  if (existing) return;
  const role: WorkspaceRole = record.workspaceRole ?? "member";
  await executor.insert(workspaceMember).values({
    id: crypto.randomUUID(),
    workspaceId: record.workspaceId,
    userId: member.userId,
    role,
    invitedBy: record.invitedBy,
    joinedAt: new Date(),
  });
  await appendWorkspaceOrder(member.userId, record.workspaceId, executor);
}

function announceJoin(
  record: InviteRecord,
  member: { userId: string; email: string; name: string },
): void {
  if (!record.workspaceId) return;
  memberJoined({
    workspaceId: record.workspaceId,
    userId: member.userId,
    email: member.email,
    name: member.name,
    role: record.workspaceRole ?? "member",
  });
}

function acceptedDetail(record: InviteRecord) {
  return {
    ...(record.workspaceRole ? { role: record.workspaceRole } : {}),
    ...(record.instanceRole ? { instanceRole: record.instanceRole } : {}),
  };
}

export async function acceptInvite(opts: {
  token: string;
  user: { id: string; email: string; name: string };
  by: AuditActor;
}): Promise<{ workspaceSlug: string | null; workspaceName: string | null } | { error: string }> {
  const record = await findUsable(opts.token);
  if (!record) return { error: INVITE_UNAVAILABLE };
  if (!sameEmail(opts.user.email, record.email)) return { error: WRONG_ACCOUNT };
  const workspaceId = record.workspaceId;
  if (!workspaceId) return { error: HAS_ACCOUNT };

  const member = { userId: opts.user.id, email: record.email, name: opts.user.name };
  const accepted = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(invite)
      .set({ acceptedAt: new Date(), acceptedUserId: opts.user.id })
      .where(and(eq(invite.id, record.id), pendingInvite()))
      .returning({ id: invite.id });
    if (!claimed) return false;
    await joinWorkspace(tx, { ...record, workspaceId }, member);
    return true;
  });
  if (!accepted) return { error: INVITE_UNAVAILABLE };

  announceJoin(record, member);
  await recordAuditEvent(opts.by, {
    action: "invite.accepted",
    workspaceId,
    targetLabel: record.email,
    detail: acceptedDetail(record),
  });

  const [w] = await db
    .select({ name: workspace.name, slug: workspace.slug })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);
  return { workspaceSlug: w?.slug ?? null, workspaceName: w?.name ?? null };
}

export async function declineInvite(opts: {
  token: string;
  user: { email: string };
  by: AuditActor;
}): Promise<{ ok: true } | { error: string }> {
  const record = await findUsable(opts.token);
  if (!record) return { error: INVITE_UNAVAILABLE };
  if (!sameEmail(opts.user.email, record.email)) return { error: WRONG_ACCOUNT };

  const [declined] = await db
    .update(invite)
    .set({ declinedAt: new Date() })
    .where(and(eq(invite.id, record.id), pendingInvite()))
    .returning({ id: invite.id });
  if (!declined) return { error: INVITE_UNAVAILABLE };

  await recordAuditEvent(opts.by, {
    action: "invite.declined",
    workspaceId: record.workspaceId,
    targetLabel: record.email,
    detail: acceptedDetail(record),
  });
  return { ok: true };
}

export async function signUpFromInvite(opts: {
  token: string;
  name: string;
  password: string;
  headers: Headers;
}): Promise<{ userId: string; email: string; workspaceSlug: string } | { error: string }> {
  type Created = {
    record: InviteRecord;
    member: { userId: string; email: string; name: string };
    workspaceSlug: string;
  };
  const result = await db.transaction(async (tx): Promise<Created | { error: string }> => {
    const record = await findUsable(opts.token, tx);
    if (!record) return { error: INVITE_UNAVAILABLE };
    if (isOwnerEmail(record.email)) return { error: OWNER_ADDRESS };
    if (await emailInUse(record.email, tx)) return { error: HAS_ACCOUNT };
    const refused = await signUpRefusal(record, tx);
    if (refused) return { error: refused };

    const created = await createAccount(tx, {
      email: record.email,
      name: opts.name,
      password: opts.password,
      ...(record.instanceRole ? { role: record.instanceRole } : {}),
    });
    const member = { userId: created.userId, email: record.email, name: opts.name };

    let workspaceSlug = created.workspaceSlug;
    if (record.workspaceId) {
      await joinWorkspace(tx, { ...record, workspaceId: record.workspaceId }, member);
      const [w] = await tx
        .select({ slug: workspace.slug })
        .from(workspace)
        .where(eq(workspace.id, record.workspaceId))
        .limit(1);
      if (w) {
        workspaceSlug = w.slug;
        await setDefaultWorkspaceSlug(created.userId, w.slug, tx);
      }
    }
    await tx
      .update(invite)
      .set({ acceptedAt: new Date(), acceptedUserId: created.userId })
      .where(eq(invite.id, record.id));

    return { record, member, workspaceSlug };
  });
  if ("error" in result) return result;

  const { record, member, workspaceSlug } = result;
  await refreshHasAnyUser();
  announceJoin(record, member);
  await recordAuditEvent(
    { userId: member.userId, email: member.email, via: "app", headers: opts.headers },
    {
      action: "invite.accepted",
      workspaceId: record.workspaceId,
      targetLabel: record.email,
      detail: acceptedDetail(record),
    },
  );
  if (record.instanceRole && record.invitedBy) {
    await recordAuditEvent(
      { userId: record.invitedBy, via: "app" },
      {
        action: "instance_role.granted",
        targetUserId: member.userId,
        targetLabel: member.email,
        detail: { to: record.instanceRole },
      },
    );
  }

  return { userId: member.userId, email: member.email, workspaceSlug };
}

export async function listWorkspaceInvites(args: {
  workspaceId: string;
  actorRole: WorkspaceRole;
}): Promise<InviteRow[] | AdminRefusal> {
  if (!isAdmin(args.actorRole)) {
    return { error: "Only workspace owners and admins can do that", forbidden: true };
  }
  return listPendingWorkspaceInvites(args.workspaceId);
}

async function listPendingWorkspaceInvites(workspaceId: string): Promise<InviteRow[]> {
  const rows = await db
    .select()
    .from(invite)
    .where(and(eq(invite.workspaceId, workspaceId), pendingInvite()))
    .orderBy(desc(invite.createdAt));
  return rows.map(rowOf);
}

export async function revokeWorkspaceInvite(args: {
  workspaceId: string;
  actorRole: WorkspaceRole;
  inviteId: string;
  by: AuditActor;
}): Promise<{ ok: true } | AdminRefusal> {
  if (!isAdmin(args.actorRole)) {
    return { error: "Only workspace owners and admins can do that", forbidden: true };
  }
  const [deleted] = await db
    .delete(invite)
    .where(
      and(eq(invite.id, args.inviteId), eq(invite.workspaceId, args.workspaceId), pendingInvite()),
    )
    .returning({ email: invite.email });
  if (!deleted) return { error: "Invite not found" };
  await recordAuditEvent(args.by, {
    action: "invite.revoked",
    workspaceId: args.workspaceId,
    targetLabel: deleted.email,
  });
  return { ok: true };
}

function inviteFilter(filter: DashboardInvitesInput, now: Date): SQL | undefined {
  const needle = filter.search?.trim().toLowerCase();
  return and(
    needle ? sql`instr(lower(${invite.email}), ${needle}) > 0` : undefined,
    filter.role === undefined
      ? undefined
      : filter.role === "none"
        ? isNull(invite.instanceRole)
        : eq(invite.instanceRole, filter.role),
    filter.status === "pending"
      ? gte(invite.expiresAt, now)
      : filter.status === "expired"
        ? lt(invite.expiresAt, now)
        : undefined,
  );
}

export async function listAccountInvites(
  viewer: InstanceRole | null,
  filter: DashboardInvitesInput = {},
): Promise<AccountInvite[] | Refusal> {
  if (!viewer) {
    return { error: "Only instance role holders can read account invites", forbidden: true };
  }
  const now = new Date();
  const rows = await db
    .select({ record: invite, inviter: userTable.email })
    .from(invite)
    .leftJoin(userTable, eq(userTable.id, invite.invitedBy))
    .where(and(isNull(invite.workspaceId), pendingInvite(), inviteFilter(filter, now)))
    .orderBy(desc(invite.createdAt));
  return rows.map(({ record, inviter }) => ({
    id: record.id,
    email: record.email,
    instanceRole: record.instanceRole,
    invitedBy: inviter,
    expiresAt: record.expiresAt.toISOString(),
    expired: record.expiresAt.getTime() < now.getTime(),
    createdAt: record.createdAt.toISOString(),
  }));
}

export async function revokeAccountInvite(args: {
  inviteId: string;
  actor: { userId: string; email: string };
  by: AuditActor;
}): Promise<{ ok: true } | Refusal> {
  const role = await instanceRoleOf({ id: args.actor.userId, email: args.actor.email });
  if (!role || !canManageAccountInvites(role)) return ACCOUNT_INVITES_ONLY;
  const [record] = await db
    .select()
    .from(invite)
    .where(and(eq(invite.id, args.inviteId), isNull(invite.workspaceId), pendingInvite()))
    .limit(1);
  if (!record) return { error: "Invite not found" };
  if (record.instanceRole && !canGrantInstanceRole(role, record.instanceRole)) {
    return { error: "Only the instance owner can revoke an admin invite", forbidden: true };
  }
  await db.delete(invite).where(eq(invite.id, record.id));
  await recordAuditEvent(args.by, {
    action: "invite.revoked",
    targetLabel: record.email,
    detail: record.instanceRole ? { instanceRole: record.instanceRole } : {},
  });
  return { ok: true };
}
