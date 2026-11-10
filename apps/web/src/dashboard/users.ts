import "server-only";
import { and, asc, count, eq, inArray, ne, not, or, type SQL, sql } from "drizzle-orm";

import { deleteAccount, sharedWorkspacesBlockMessage } from "@/account/delete";
import { type AuditActor, recordAuditEvent } from "@/audit";
import { activeBan, isBanned } from "@/auth/ban";
import { resolveInstanceRole } from "@/auth/instance-role";
import { ownerEmail } from "@/auth/owner";
import { getAuth } from "@/auth/server";
import { db } from "@/db";
import { lastSignIn, user, workspaceMember } from "@/db/schema";
import type { DashboardUser, DashboardUsersInput } from "@/server/schema";
import { banExpiresAt, type BanDuration } from "@/types/ban";
import {
  type AssignableUserRole,
  canGrantInstanceRole,
  canManageUser,
  GRANTED_INSTANCE_ROLES,
  grantedRoleOf,
  type InstanceRole,
  userRoleOf,
} from "@/types/instance-role";
import { planAccountDelete } from "@/workspace";

type Refusal = { error: string; forbidden?: true };

type Actor = { userId: string; role: InstanceRole };

function roleFilter(role: DashboardUsersInput["role"]): SQL | undefined {
  const owner = ownerEmail();
  switch (role) {
    case undefined:
      return undefined;
    case "owner":
      return eq(user.email, owner);
    case "user":
      return and(ne(user.email, owner), not(inArray(user.role, [...GRANTED_INSTANCE_ROLES])));
    default:
      return and(ne(user.email, owner), eq(user.role, role));
  }
}

function searchFilter(search: string | undefined): SQL | undefined {
  const needle = search?.trim().toLowerCase();
  if (!needle) return undefined;
  return or(
    sql`instr(lower(${user.name}), ${needle}) > 0`,
    sql`instr(lower(${user.email}), ${needle}) > 0`,
  );
}

export async function listInstanceUsers(
  filter: DashboardUsersInput = {},
): Promise<DashboardUser[]> {
  const now = new Date();
  const where = and(
    searchFilter(filter.search),
    roleFilter(filter.role),
    filter.status === "banned"
      ? activeBan(now)
      : filter.status === "active"
        ? not(activeBan(now))
        : undefined,
    filter.twoFactor === undefined
      ? undefined
      : eq(user.twoFactorEnabled, filter.twoFactor === "on"),
  );
  const [users, lastSessions, owned] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        banned: user.banned,
        banReason: user.banReason,
        banExpires: user.banExpires,
        createdAt: user.createdAt,
        twoFactorEnabled: user.twoFactorEnabled,
      })
      .from(user)
      .where(where)
      .orderBy(asc(user.createdAt)),
    db.select({ userId: lastSignIn.userId, last: lastSignIn.signedInAt }).from(lastSignIn),
    db
      .select({ userId: workspaceMember.userId, n: count() })
      .from(workspaceMember)
      .where(eq(workspaceMember.role, "owner"))
      .groupBy(workspaceMember.userId),
  ]);

  const lastOf = new Map(lastSessions.map((row) => [row.userId, row.last]));
  const ownedOf = new Map(owned.map((row) => [row.userId, row.n]));

  return users.map((row): DashboardUser => {
    const banned = isBanned(row, now);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: userRoleOf(resolveInstanceRole(row.email, row.role)),
      banned,
      banReason: banned ? (row.banReason ?? null) : null,
      banExpiresAt: banned ? (row.banExpires?.toISOString() ?? null) : null,
      createdAt: row.createdAt.toISOString(),
      lastSignInAt: lastOf.get(row.id)?.toISOString() ?? null,
      twoFactorEnabled: row.twoFactorEnabled ?? false,
      workspacesOwned: ownedOf.get(row.id) ?? 0,
    };
  });
}

async function loadTarget(userId: string) {
  const [row] = await db
    .select({ id: user.id, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row) return null;
  return { id: row.id, email: row.email, role: resolveInstanceRole(row.email, row.role) };
}

export async function setUserRole(opts: {
  actor: Actor;
  userId: string;
  role: AssignableUserRole;
  by: AuditActor;
}): Promise<{ ok: true } | Refusal> {
  const target = await loadTarget(opts.userId);
  if (!target) return { error: "User not found" };
  if (target.role === "owner") {
    return { error: "The owner's role comes from METIS_OWNER_EMAIL", forbidden: true };
  }
  const granted = grantedRoleOf(opts.role);
  if (
    !canManageUser(opts.actor.role, target.role) ||
    !canGrantInstanceRole(opts.actor.role, granted)
  ) {
    return { error: "Only the instance owner can grant or change an admin role", forbidden: true };
  }
  if (target.role === granted) return { ok: true };

  await db.update(user).set({ role: opts.role }).where(eq(user.id, target.id));
  if (granted === null) {
    await recordAuditEvent(opts.by, {
      action: "instance_role.revoked",
      targetUserId: target.id,
      targetLabel: target.email,
      detail: target.role ? { from: target.role } : {},
    });
    return { ok: true };
  }
  await recordAuditEvent(opts.by, {
    action: "instance_role.granted",
    targetUserId: target.id,
    targetLabel: target.email,
    detail: { to: granted, ...(target.role ? { from: target.role } : {}) },
  });
  return { ok: true };
}

const BAN_REFUSALS = {
  ban: {
    owner: "The instance owner can't be banned",
    self: "You can't ban yourself",
    admin: "Only the instance owner can ban an admin",
  },
  unban: {
    owner: "The instance owner can't be banned",
    self: "You can't unban yourself",
    admin: "Only the instance owner can unban an admin",
  },
};

function banRefusal(
  actor: Actor,
  target: { id: string; role: InstanceRole | null },
  action: keyof typeof BAN_REFUSALS,
): Refusal | null {
  const messages = BAN_REFUSALS[action];
  if (target.role === "owner") return { error: messages.owner };
  if (target.id === actor.userId) return { error: messages.self };
  if (!canManageUser(actor.role, target.role)) return { error: messages.admin, forbidden: true };
  return null;
}

export async function banUser(opts: {
  actor: Actor;
  userId: string;
  reason: string | null;
  duration: BanDuration;
  by: AuditActor;
}): Promise<{ ok: true } | Refusal> {
  const target = await loadTarget(opts.userId);
  if (!target) return { error: "User not found" };
  const refusal = banRefusal(opts.actor, target, "ban");
  if (refusal) return refusal;

  const expires = banExpiresAt(opts.duration, new Date());
  await db
    .update(user)
    .set({ banned: true, banReason: opts.reason, banExpires: expires })
    .where(eq(user.id, target.id));
  const ctx = await getAuth().$context;
  await ctx.internalAdapter.deleteUserSessions(target.id);
  await recordAuditEvent(opts.by, {
    action: "user.banned",
    targetUserId: target.id,
    targetLabel: target.email,
    detail: {
      ...(opts.reason ? { reason: opts.reason } : {}),
      ...(expires ? { expiresAt: expires.toISOString() } : {}),
    },
  });
  return { ok: true };
}

export async function unbanUser(opts: {
  actor: Actor;
  userId: string;
  by: AuditActor;
}): Promise<{ ok: true } | Refusal> {
  const target = await loadTarget(opts.userId);
  if (!target) return { error: "User not found" };
  const refusal = banRefusal(opts.actor, target, "unban");
  if (refusal) return refusal;

  const [row] = await db
    .update(user)
    .set({ banned: false, banReason: null, banExpires: null })
    .where(and(eq(user.id, target.id), activeBan()))
    .returning({ id: user.id });
  if (!row) return { error: "This user isn't banned" };
  await recordAuditEvent(opts.by, {
    action: "user.unbanned",
    targetUserId: target.id,
    targetLabel: target.email,
  });
  return { ok: true };
}

export async function removeUser(opts: {
  actor: Actor;
  userId: string;
  by: AuditActor;
}): Promise<{ ok: true } | Refusal> {
  const target = await loadTarget(opts.userId);
  if (!target) return { error: "User not found" };
  if (target.role === "owner") return { error: "The instance owner can't be removed" };
  if (target.id === opts.actor.userId) {
    return { error: "Delete your own account from Settings → Security instead" };
  }
  if (!canManageUser(opts.actor.role, target.role)) {
    return { error: "Only the instance owner can remove an admin", forbidden: true };
  }

  const plan = await planAccountDelete(target.id);
  if (plan.blocking.length > 0) {
    return { error: sharedWorkspacesBlockMessage(plan.blocking.length, "they") };
  }

  const deleted = await deleteAccount(target.id, plan);
  await recordAuditEvent(opts.by, {
    action: "user.removed",
    targetUserId: null,
    targetLabel: target.email,
    detail: deleted,
  });
  return { ok: true };
}
