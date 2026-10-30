import { env } from "@metis/e2e/lib/env";
import * as OTPAuth from "otpauth";

import { getAuth } from "../../../src/auth/server";
import { firstUserSignup, inviteSignup, sendSignupInvite } from "../../../src/auth/signup";
import { getWorkspaceBySlug } from "../../../src/workspace";

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

async function enrollTotp(email: string, password: string): Promise<Enrolled> {
  const signIn = await getAuth().api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  const cookie = signIn.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
  const headers = new Headers({ cookie });

  const enabled = await getAuth().api.enableTwoFactor({
    body: { password },
    headers,
  });
  if (enabled.method !== "totp") {
    throw new Error("2FA enable did not return TOTP");
  }
  const totp = OTPAuth.URI.parse(enabled.totpURI);
  if (!(totp instanceof OTPAuth.TOTP)) throw new Error("not a TOTP URI");
  await getAuth().api.verifyTOTP({ body: { code: totp.generate() }, headers });
  console.log(`[generate] 2FA enabled for ${email}`);
  return { totpURI: enabled.totpURI, backupCodes: enabled.backupCodes };
}

async function accountFor(
  user: { name: string; email: string; password: string },
  created: { userId: string; workspaceSlug: string },
): Promise<Account> {
  const enrolled = await enrollTotp(user.email, user.password);
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

  const created = await firstUserSignup({ name, email, password });
  if ("error" in created) throw new Error(created.error);
  console.log(`[generate] account ${email} -> /w/${created.workspaceSlug}`);

  return accountFor(env.user, created);
}

export async function createMember(owner: Account): Promise<Account> {
  const { name, email, password } = env.member;

  const sent = await sendSignupInvite({
    email,
    inviter: { userId: owner.userId, name: owner.name },
    by: { userId: owner.userId, email: owner.email, via: "app" },
  });
  if ("error" in sent) throw new Error(sent.error);
  const token = new URL(sent.url).searchParams.get("token");
  if (!token) throw new Error("the signup invite URL carries no token");
  const created = await inviteSignup({ token, name, password });
  if ("error" in created) throw new Error(created.error);
  console.log(`[generate] member ${email} -> /w/${created.workspaceSlug}`);

  return accountFor(env.member, created);
}
