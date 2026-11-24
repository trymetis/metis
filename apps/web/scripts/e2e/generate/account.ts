import { env } from "@metis/e2e/lib/env";

import { TWO_FACTOR_ISSUER } from "../../../src/auth/base";
import { getAuth } from "../../../src/auth/server";
import {
  createAccount as createAccountRows,
  ownerSignup,
  refreshHasAnyUser,
} from "../../../src/auth/signup";
import { enrollTwoFactor, totpUri } from "../../../src/auth/two-factor";
import { db } from "../../../src/db";
import { getWorkspaceBySlug } from "../../../src/workspace";
import { TWO_FACTOR_FIXTURES } from "./two-factor";

export interface Account {
  name: string;
  email: string;
  password: string;
  userId: string;
  workspaceId: string;
  workspaceSlug: string;
  totpURI: string;
  backupCodes: string[];
}

interface Enrolled {
  totpURI: string;
  backupCodes: string[];
}

async function enrollTotp(email: string, password: string, userId: string): Promise<Enrolled> {
  await getAuth().api.signInEmail({ body: { email, password } });
  const fixture = TWO_FACTOR_FIXTURES[email];
  if (!fixture) throw new Error(`no 2FA fixture for ${email}`);
  await enrollTwoFactor(await getAuth().$context, { userId, ...fixture });
  console.log(`[generate] 2FA enabled for ${email}`);
  return {
    totpURI: totpUri(fixture.secret, TWO_FACTOR_ISSUER, email),
    backupCodes: fixture.backupCodes,
  };
}

async function accountFor(
  user: { name: string; email: string; password: string },
  created: { userId: string; workspaceSlug: string },
): Promise<Account> {
  const enrolled = await enrollTotp(user.email, user.password, created.userId);
  const workspace = await getWorkspaceBySlug(created.userId, created.workspaceSlug);
  if (!workspace) throw new Error("workspace not found");

  return {
    ...user,
    userId: created.userId,
    workspaceId: workspace.id,
    workspaceSlug: created.workspaceSlug,
    ...enrolled,
  };
}

export async function createAccount(): Promise<Account> {
  const { name, email, password } = env.user;

  const created = await ownerSignup({ name, email, password });
  if ("error" in created) throw new Error(created.error);
  console.log(`[generate] account ${email} -> /w/${created.workspaceSlug}`);

  return accountFor(env.user, created);
}

export async function createMember(): Promise<Account> {
  const { name, email, password } = env.member;

  const created = await db.transaction((tx) => createAccountRows(tx, { email, name, password }));
  await refreshHasAnyUser();
  console.log(`[generate] member ${email} -> /w/${created.workspaceSlug}`);

  return accountFor(env.member, created);
}
