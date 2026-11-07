import "server-only";
import crypto from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { and, desc, eq, isNull } from "drizzle-orm";

import { type AuditActor, recordAuditEvent } from "@/audit";
import { config } from "@/config";
import { db, type Executor, type Tx } from "@/db";
import { account, legalConsent, signupInvite, user as userTable } from "@/db/schema";
import { getCache } from "@/services/cache";
import { sendSignupInviteEmail } from "@/services/mailer";
import { enforceRateLimit } from "@/services/rate-limit";
import { createWorkspace, personalWorkspaceName, setDefaultWorkspaceSlug } from "@/workspace";

import { hashToken, newInviteToken } from "./invite-token";
import { legalConfig } from "./legal-consent";
import { isOwnerEmail } from "./owner";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SignupInviteRow = {
  id: string;
  email: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
};

const HAS_ANY_USER_KEY = "signup:has-any-user";

export async function hasAnyUser(): Promise<boolean> {
  if ((await getCache().get(HAS_ANY_USER_KEY)) === "1") return true;

  const [row] = await db.select({ id: userTable.id }).from(userTable).limit(1);
  if (!row) return false;

  await getCache().set(HAS_ANY_USER_KEY, "1");
  return true;
}

export async function refreshHasAnyUser(): Promise<void> {
  const [row] = await db.select({ id: userTable.id }).from(userTable).limit(1);
  if (row) await getCache().set(HAS_ANY_USER_KEY, "1");
  else await getCache().del(HAS_ANY_USER_KEY);
}

async function emailInUse(email: string, executor: Executor = db): Promise<boolean> {
  const [row] = await executor
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, email.toLowerCase()))
    .limit(1);
  return Boolean(row);
}

async function createAccount(
  tx: Tx,
  opts: { email: string; name: string; password: string },
): Promise<{ userId: string; workspaceSlug: string }> {
  const userId = crypto.randomUUID();
  const email = opts.email.toLowerCase();
  const now = new Date();

  await tx.insert(userTable).values({
    id: userId,
    name: opts.name,
    email,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });

  await tx.insert(account).values({
    id: crypto.randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(opts.password),
    createdAt: now,
    updatedAt: now,
  });

  const legal = legalConfig();
  if (legal) {
    await tx.insert(legalConsent).values({
      id: crypto.randomUUID(),
      userId,
      email,
      termsUrl: legal.termsUrl,
      privacyUrl: legal.privacyUrl,
      version: legal.version,
      consentedAt: now,
    });
  }

  const workspaceName = await personalWorkspaceName(opts.name);
  const created = await createWorkspace({ name: workspaceName, ownerUserId: userId }, tx);
  await setDefaultWorkspaceSlug(userId, created.slug, tx);

  return { userId, workspaceSlug: created.slug };
}

export async function firstUserSignup(opts: {
  name: string;
  email: string;
  password: string;
}): Promise<{ userId: string; workspaceSlug: string } | { error: string }> {
  return await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: userTable.id }).from(userTable).limit(1);
    if (existing) {
      return { error: "This instance has already been set up" };
    }

    return await createAccount(tx, opts);
  });
}

const OWNER_EMAIL_ERROR = "The instance owner's address can't be invited";

export async function createSignupInvite(opts: {
  email: string;
  invitedBy: string;
}): Promise<{ id: string; token: string; expiresAt: Date; createdAt: Date } | { error: string }> {
  const email = opts.email.toLowerCase();
  if (isOwnerEmail(email)) {
    return { error: OWNER_EMAIL_ERROR };
  }
  if (await emailInUse(email)) {
    return { error: "That email already has an account" };
  }

  const now = new Date();
  const token = newInviteToken();

  const [row] = await db
    .insert(signupInvite)
    .values({
      id: crypto.randomUUID(),
      email,
      tokenHash: hashToken(token),
      invitedBy: opts.invitedBy,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({
      id: signupInvite.id,
      expiresAt: signupInvite.expiresAt,
      createdAt: signupInvite.createdAt,
    });

  if (!row) {
    return { error: "That email already has a pending invite" };
  }

  return { ...row, token };
}

function signupInviteUrl(token: string): string {
  return `${config.auth.url}/invite/signup?token=${token}`;
}

export async function sendSignupInvite(opts: {
  email: string;
  inviter: { userId: string; name: string };
  by: AuditActor;
}): Promise<{ invite: SignupInviteRow } | { error: string }> {
  await enforceRateLimit(opts.inviter.userId, {
    scope: "signup-invite-send",
    limit: 10,
    windowSec: 60 * 60,
  });

  const invite = await createSignupInvite({
    email: opts.email,
    invitedBy: opts.inviter.userId,
  });
  if ("error" in invite) return invite;

  try {
    await sendSignupInviteEmail({
      to: opts.email,
      url: signupInviteUrl(invite.token),
      inviterName: opts.inviter.name,
    });
  } catch (err) {
    console.error("[signup-invites] failed to send email", err);
    await db.delete(signupInvite).where(eq(signupInvite.id, invite.id));
    return {
      error:
        "The invite email couldn't be sent, so no invite was created. Ask the instance owner to check the mail settings, then try again.",
    };
  }

  await recordAuditEvent(opts.by, {
    action: "signup_invite.created",
    targetLabel: opts.email.toLowerCase(),
  });

  return {
    invite: {
      id: invite.id,
      email: opts.email,
      expiresAt: invite.expiresAt,
      acceptedAt: null,
      createdAt: invite.createdAt,
    },
  };
}

export async function listSignupInvites(invitedBy: string): Promise<SignupInviteRow[]> {
  return await db
    .select({
      id: signupInvite.id,
      email: signupInvite.email,
      expiresAt: signupInvite.expiresAt,
      acceptedAt: signupInvite.acceptedAt,
      createdAt: signupInvite.createdAt,
    })
    .from(signupInvite)
    .where(eq(signupInvite.invitedBy, invitedBy))
    .orderBy(desc(signupInvite.createdAt));
}

export async function revokeSignupInvite(opts: {
  inviteId: string;
  invitedBy: string;
  by: AuditActor;
}): Promise<{ ok: true } | { error: string }> {
  const [deleted] = await db
    .delete(signupInvite)
    .where(
      and(
        eq(signupInvite.id, opts.inviteId),
        eq(signupInvite.invitedBy, opts.invitedBy),
        isNull(signupInvite.acceptedAt),
      ),
    )
    .returning({ email: signupInvite.email });

  if (!deleted) return { error: "Invite not found" };
  await recordAuditEvent(opts.by, {
    action: "signup_invite.revoked",
    targetLabel: deleted.email,
  });
  return { ok: true };
}

export async function previewSignupInvite(
  token: string,
): Promise<{ email: string } | { error: string }> {
  const [invite] = await db
    .select({
      email: signupInvite.email,
      expiresAt: signupInvite.expiresAt,
      acceptedAt: signupInvite.acceptedAt,
    })
    .from(signupInvite)
    .where(eq(signupInvite.tokenHash, hashToken(token)))
    .limit(1);

  if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
    return { error: "This invite link is no longer valid" };
  }
  if (isOwnerEmail(invite.email)) {
    return { error: OWNER_EMAIL_ERROR };
  }
  if (await emailInUse(invite.email)) {
    return { error: "That email already has an account" };
  }

  return { email: invite.email };
}

export async function inviteSignup(opts: {
  token: string;
  name: string;
  password: string;
}): Promise<{ userId: string; email: string; workspaceSlug: string } | { error: string }> {
  return await db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(signupInvite)
      .where(eq(signupInvite.tokenHash, hashToken(opts.token)))
      .limit(1);

    if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
      return { error: "This invite link is no longer valid" };
    }
    if (isOwnerEmail(invite.email)) {
      return { error: OWNER_EMAIL_ERROR };
    }
    if (await emailInUse(invite.email, tx)) {
      return { error: "That email already has an account" };
    }

    const created = await createAccount(tx, {
      email: invite.email,
      name: opts.name,
      password: opts.password,
    });

    await tx
      .update(signupInvite)
      .set({ acceptedAt: new Date(), acceptedUserId: created.userId })
      .where(eq(signupInvite.id, invite.id));

    return {
      userId: created.userId,
      email: invite.email,
      workspaceSlug: created.workspaceSlug,
    };
  });
}
