import crypto from "node:crypto";

import { and, eq, inArray, isNull, ne } from "drizzle-orm";

import { hashToken, newInviteToken } from "@/auth/invite-token";
import { db, type Executor } from "@/db";
import {
  calendar,
  calendarWorkspace,
  connection,
  drive,
  driveWorkspace,
  mailbox,
  mailboxWorkspace,
  userPrefs,
  user as userTable,
  workspace,
  workspaceInvite,
  workspaceMember,
} from "@/db/schema";
import type { WorkspaceSummary } from "@/server/schema";
import { DEFAULT_THEME_BRAND, isThemeBrand, type ThemeBrandId } from "@/theme/brand";
import type { WorkspaceRole } from "@/types/workspace";
import { memberJoined } from "@/workflow/hooks";

import type { WorkspacePolicy } from "./policy";

export type { WorkspaceSummary };

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

async function uniqueSlug(base: string, executor: Executor = db): Promise<string> {
  const root = slugify(base) || "workspace";
  const candidates = Array.from({ length: 10 }, (_, i) => (i === 0 ? root : `${root}-${i + 1}`));
  const taken = new Set(
    (
      await executor
        .select({ slug: workspace.slug })
        .from(workspace)
        .where(inArray(workspace.slug, candidates))
    ).map((row) => row.slug),
  );
  return (
    candidates.find((candidate) => !taken.has(candidate)) ??
    `${root}-${crypto.randomBytes(3).toString("hex")}`
  );
}

export async function appendWorkspaceOrder(
  userId: string,
  workspaceId: string,
  executor: Executor = db,
): Promise<void> {
  const now = new Date();
  const [row] = await executor
    .select({ order: userPrefs.workspaceOrder })
    .from(userPrefs)
    .where(eq(userPrefs.userId, userId))
    .limit(1);

  const current = row?.order ?? [];
  if (current.includes(workspaceId)) return;

  await executor
    .insert(userPrefs)
    .values({
      userId,
      workspaceOrder: [...current, workspaceId],
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userPrefs.userId,
      set: { workspaceOrder: [...current, workspaceId], updatedAt: now },
    });
}

export async function setDefaultWorkspaceSlug(
  userId: string,
  slug: string | null,
  executor: Executor = db,
): Promise<void> {
  await executor
    .update(userTable)
    .set({ defaultWorkspaceSlug: slug })
    .where(eq(userTable.id, userId));
}

export async function resolveDefaultWorkspaceSlug(
  userId: string,
  knownSlug?: string | null,
): Promise<string | null> {
  let slug = knownSlug ?? null;

  if (knownSlug === undefined) {
    const [row] = await db
      .select({ slug: userTable.defaultWorkspaceSlug })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);
    slug = row?.slug ?? null;
  }

  if (slug) {
    const membership = await getWorkspaceBySlug(userId, slug);
    if (membership) return membership.slug;
  }

  const [fallback] = await db
    .select({ slug: workspace.slug })
    .from(workspaceMember)
    .innerJoin(workspace, eq(workspace.id, workspaceMember.workspaceId))
    .where(eq(workspaceMember.userId, userId))
    .limit(1);

  if (!fallback) return null;
  await setDefaultWorkspaceSlug(userId, fallback.slug);
  return fallback.slug;
}

export async function createWorkspace(
  opts: {
    name: string;
    ownerUserId: string;
  },
  executor: Executor = db,
): Promise<{ workspaceId: string; slug: string }> {
  const workspaceId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const slug = await uniqueSlug(opts.name, executor);
  const now = new Date();

  await executor.insert(workspace).values({
    id: workspaceId,
    name: opts.name,
    slug,
    createdAt: now,
    updatedAt: now,
  });

  await executor.insert(workspaceMember).values({
    id: memberId,
    workspaceId,
    userId: opts.ownerUserId,
    role: "owner",
    joinedAt: now,
  });

  await appendWorkspaceOrder(opts.ownerUserId, workspaceId, executor);

  return { workspaceId, slug };
}

export async function getWorkspaceBySlug(
  userId: string,
  slug: string,
): Promise<WorkspaceSummary | null> {
  const [row] = await db
    .select({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      branding: workspace.branding,
      role: workspaceMember.role,
    })
    .from(workspaceMember)
    .innerJoin(workspace, eq(workspace.id, workspaceMember.workspaceId))
    .where(and(eq(workspaceMember.userId, userId), eq(workspace.slug, slug)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    role: row.role,
    themeBrand: workspaceThemeBrand(row.branding),
    logo: workspaceLogo(row.branding),
  };
}

export async function getWorkspacePolicy(workspaceId: string): Promise<WorkspacePolicy | null> {
  const [row] = await db
    .select({
      aiPolicy: workspace.aiPolicy,
      phishingDetectionPolicy: workspace.phishingDetectionPolicy,
    })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);
  return row ?? null;
}

export async function getWorkspaceSlug(workspaceId: string): Promise<string | null> {
  const [row] = await db
    .select({ slug: workspace.slug })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);
  return row?.slug ?? null;
}

export async function listMyWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const rows = await db
    .select({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      branding: workspace.branding,
      role: workspaceMember.role,
    })
    .from(workspaceMember)
    .innerJoin(workspace, eq(workspace.id, workspaceMember.workspaceId))
    .where(eq(workspaceMember.userId, userId));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    role: r.role,
    themeBrand: workspaceThemeBrand(r.branding),
    logo: workspaceLogo(r.branding),
  }));
}

export function workspaceThemeBrand(branding: Record<string, unknown> | null): ThemeBrandId {
  const brand = branding?.themeBrand;
  return isThemeBrand(brand) ? brand : DEFAULT_THEME_BRAND;
}

export function workspaceLogo(branding: Record<string, unknown> | null): string | null {
  const logo = branding?.logo;
  return typeof logo === "string" && logo.startsWith("data:image/") ? logo : null;
}

export async function getWorkspaceMember(
  workspaceId: string,
  userId: string,
): Promise<{ role: WorkspaceRole } | null> {
  const [row] = await db
    .select({ role: workspaceMember.role })
    .from(workspaceMember)
    .where(and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.userId, userId)))
    .limit(1);
  return row ?? null;
}

export function isAdmin(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}

export function isOwner(role: WorkspaceRole): boolean {
  return role === "owner";
}

export async function personalWorkspaceName(userName: string): Promise<string> {
  const trimmed = userName.trim();
  return trimmed ? `${trimmed}'s workspace` : "Personal workspace";
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function createInvite(opts: {
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  invitedBy: string;
}): Promise<{ id: string; token: string; expiresAt: Date }> {
  const id = crypto.randomUUID();
  const token = newInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const now = new Date();

  await db.insert(workspaceInvite).values({
    id,
    workspaceId: opts.workspaceId,
    email: opts.email.toLowerCase(),
    role: opts.role,
    tokenHash: hashToken(token),
    invitedBy: opts.invitedBy,
    expiresAt,
    createdAt: now,
  });

  return { id, token, expiresAt };
}

export async function planAccountDelete(userId: string): Promise<{
  blocking: { id: string; name: string }[];
  soleOwnedWorkspaceIds: string[];
}> {
  const owned = (await listMyWorkspaces(userId)).filter((row) => row.role === "owner");

  const results = await Promise.all(
    owned.map(async (w) => {
      const others = await db
        .select({ id: workspaceMember.id })
        .from(workspaceMember)
        .where(and(eq(workspaceMember.workspaceId, w.id), ne(workspaceMember.userId, userId)));
      return { w, empty: others.length === 0 };
    }),
  );

  return {
    blocking: results.filter((r) => !r.empty).map((r) => ({ id: r.w.id, name: r.w.name })),
    soleOwnedWorkspaceIds: results.filter((r) => r.empty).map((r) => r.w.id),
  };
}

async function countOwners(workspaceId: string): Promise<number> {
  const rows = await db
    .select({ id: workspaceMember.id })
    .from(workspaceMember)
    .where(and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.role, "owner")));
  return rows.length;
}

export async function changeMemberRole(opts: {
  workspaceId: string;
  memberId: string;
  newRole: WorkspaceRole;
}): Promise<{ ok: true; userId: string; previousRole: WorkspaceRole } | { error: string }> {
  const [target] = await db
    .select()
    .from(workspaceMember)
    .where(
      and(eq(workspaceMember.id, opts.memberId), eq(workspaceMember.workspaceId, opts.workspaceId)),
    )
    .limit(1);
  if (!target) return { error: "Member not found" };
  if (opts.newRole === "owner" || target.role === "owner") {
    return { error: "Transfer ownership instead" };
  }
  if (target.role !== opts.newRole) {
    await db
      .update(workspaceMember)
      .set({ role: opts.newRole })
      .where(eq(workspaceMember.id, opts.memberId));
  }
  return { ok: true, userId: target.userId, previousRole: target.role };
}

export async function transferOwnership(opts: {
  workspaceId: string;
  fromUserId: string;
  toMemberId: string;
}): Promise<{ ok: true; toUserId: string } | { error: string }> {
  const [from] = await db
    .select()
    .from(workspaceMember)
    .where(
      and(
        eq(workspaceMember.workspaceId, opts.workspaceId),
        eq(workspaceMember.userId, opts.fromUserId),
      ),
    )
    .limit(1);
  if (from?.role !== "owner") {
    return { error: "Only the owner can transfer ownership" };
  }

  const [to] = await db
    .select()
    .from(workspaceMember)
    .where(
      and(
        eq(workspaceMember.id, opts.toMemberId),
        eq(workspaceMember.workspaceId, opts.workspaceId),
      ),
    )
    .limit(1);
  if (!to) return { error: "Member not found" };
  if (to.id === from.id) {
    return { error: "Pick someone else" };
  }

  await db.transaction(async (tx) => {
    await tx.update(workspaceMember).set({ role: "admin" }).where(eq(workspaceMember.id, from.id));
    await tx.update(workspaceMember).set({ role: "owner" }).where(eq(workspaceMember.id, to.id));
  });
  return { ok: true, toUserId: to.userId };
}

export async function removeMember(opts: {
  workspaceId: string;
  memberId: string;
}): Promise<{ ok: true; userId: string } | { error: string }> {
  const [target] = await db
    .select()
    .from(workspaceMember)
    .where(
      and(eq(workspaceMember.id, opts.memberId), eq(workspaceMember.workspaceId, opts.workspaceId)),
    )
    .limit(1);
  if (!target) return { error: "Member not found" };
  if (target.role === "owner") {
    const owners = await countOwners(opts.workspaceId);
    if (owners <= 1) return { error: "Cannot remove the last owner" };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(mailboxWorkspace)
      .where(
        and(
          eq(mailboxWorkspace.workspaceId, opts.workspaceId),
          inArray(
            mailboxWorkspace.mailboxId,
            tx
              .select({ id: mailbox.id })
              .from(mailbox)
              .innerJoin(connection, eq(connection.id, mailbox.connectionId))
              .where(eq(connection.userId, target.userId)),
          ),
        ),
      );
    await tx
      .delete(calendarWorkspace)
      .where(
        and(
          eq(calendarWorkspace.workspaceId, opts.workspaceId),
          inArray(
            calendarWorkspace.calendarId,
            tx
              .select({ id: calendar.id })
              .from(calendar)
              .innerJoin(connection, eq(connection.id, calendar.connectionId))
              .where(eq(connection.userId, target.userId)),
          ),
        ),
      );
    await tx
      .delete(driveWorkspace)
      .where(
        and(
          eq(driveWorkspace.workspaceId, opts.workspaceId),
          inArray(
            driveWorkspace.driveId,
            tx
              .select({ id: drive.id })
              .from(drive)
              .innerJoin(connection, eq(connection.id, drive.connectionId))
              .where(eq(connection.userId, target.userId)),
          ),
        ),
      );
    await tx.delete(workspaceMember).where(eq(workspaceMember.id, opts.memberId));
  });

  return { ok: true, userId: target.userId };
}

export async function revokeInvite(opts: {
  workspaceId: string;
  inviteId: string;
}): Promise<{ ok: true; email: string } | { error: string }> {
  const [target] = await db
    .select()
    .from(workspaceInvite)
    .where(
      and(eq(workspaceInvite.id, opts.inviteId), eq(workspaceInvite.workspaceId, opts.workspaceId)),
    )
    .limit(1);
  if (!target) return { error: "Invite not found" };
  await db.delete(workspaceInvite).where(eq(workspaceInvite.id, opts.inviteId));
  return { ok: true, email: target.email };
}

export async function listWorkspaceMembers(workspaceId: string) {
  return db
    .select({
      memberId: workspaceMember.id,
      userId: userTable.id,
      email: userTable.email,
      name: userTable.name,
      image: userTable.image,
      role: workspaceMember.role,
      joinedAt: workspaceMember.joinedAt,
    })
    .from(workspaceMember)
    .innerJoin(userTable, eq(userTable.id, workspaceMember.userId))
    .where(eq(workspaceMember.workspaceId, workspaceId));
}

export async function listPendingInvites(workspaceId: string) {
  return db
    .select({
      id: workspaceInvite.id,
      email: workspaceInvite.email,
      role: workspaceInvite.role,
      expiresAt: workspaceInvite.expiresAt,
      createdAt: workspaceInvite.createdAt,
    })
    .from(workspaceInvite)
    .where(and(eq(workspaceInvite.workspaceId, workspaceId), isNull(workspaceInvite.acceptedAt)));
}

export async function acceptInvite(opts: {
  token: string;
  userId: string;
}): Promise<
  { workspaceId: string; workspaceName: string; workspaceSlug: string } | { error: string }
> {
  const [invite] = await db
    .select()
    .from(workspaceInvite)
    .where(eq(workspaceInvite.tokenHash, hashToken(opts.token)))
    .limit(1);
  if (!invite) return { error: "Invite not found" };
  if (invite.acceptedAt) return { error: "Invite already used" };
  if (invite.expiresAt.getTime() < Date.now()) return { error: "Invite expired" };

  const [existing] = await db
    .select({ id: workspaceMember.id })
    .from(workspaceMember)
    .where(
      and(
        eq(workspaceMember.workspaceId, invite.workspaceId),
        eq(workspaceMember.userId, opts.userId),
      ),
    )
    .limit(1);
  if (!existing) {
    await db.insert(workspaceMember).values({
      id: crypto.randomUUID(),
      workspaceId: invite.workspaceId,
      userId: opts.userId,
      role: invite.role,
      invitedBy: invite.invitedBy,
      joinedAt: new Date(),
    });
    memberJoined({
      workspaceId: invite.workspaceId,
      userId: opts.userId,
      email: invite.email,
      name: "",
      role: invite.role,
    });
  }
  await appendWorkspaceOrder(opts.userId, invite.workspaceId);

  await db
    .update(workspaceInvite)
    .set({ acceptedAt: new Date() })
    .where(eq(workspaceInvite.id, invite.id));

  const [w] = await db
    .select({ id: workspace.id, name: workspace.name, slug: workspace.slug })
    .from(workspace)
    .where(eq(workspace.id, invite.workspaceId))
    .limit(1);

  return {
    workspaceId: invite.workspaceId,
    workspaceName: w?.name ?? "Workspace",
    workspaceSlug: w?.slug ?? "",
  };
}
