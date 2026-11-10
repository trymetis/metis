import "server-only";
import crypto from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";

import { db, type Executor, type Tx } from "@/db";
import { account, legalConsent, user as userTable } from "@/db/schema";
import { getCache } from "@/services/cache";
import type { UserRole } from "@/types/instance-role";
import { createWorkspace, personalWorkspaceName, setDefaultWorkspaceSlug } from "@/workspace";

import { legalConfig } from "./legal-consent";
import { isOwnerEmail, ownerEmail } from "./owner";

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

export async function emailInUse(email: string, executor: Executor = db): Promise<boolean> {
  const [row] = await executor
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, email.toLowerCase()))
    .limit(1);
  return Boolean(row);
}

export async function createAccount(
  tx: Tx,
  opts: { email: string; name: string; password: string; role?: UserRole },
): Promise<{ userId: string; workspaceSlug: string }> {
  const userId = crypto.randomUUID();
  const email = opts.email.toLowerCase();
  const now = new Date();

  await tx.insert(userTable).values({
    id: userId,
    name: opts.name,
    email,
    emailVerified: true,
    ...(opts.role ? { role: opts.role } : {}),
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

export async function ownerHasAccount(): Promise<boolean> {
  return emailInUse(ownerEmail());
}

export async function ownerSignup(opts: {
  name: string;
  email: string;
  password: string;
}): Promise<{ userId: string; workspaceSlug: string } | { error: string }> {
  if (!isOwnerEmail(opts.email)) {
    return { error: "This instance only allows its configured owner email" };
  }
  const created = await db.transaction(async (tx) => {
    if (await emailInUse(opts.email, tx)) {
      return { error: "The owner account already exists" };
    }
    return await createAccount(tx, { ...opts, role: "owner" });
  });
  if (!("error" in created)) await refreshHasAnyUser();
  return created;
}
