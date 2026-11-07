import { expect, test } from "vitest";

import { harness } from "../../clients/harness";
import { type Rpc, RpcError, rpcWithCookie } from "../../clients/rpc";
import { signIn } from "../../clients/sign-in";
import { uniqueName } from "../support/poll";
import { ana, totpCode } from "../support/session";

const OUTSIDE_DOMAIN = "discard.demo.trymetis.email";

async function member(): Promise<Rpc> {
  const { account } = await ana();
  const cookie = await signIn(account.member.email, account.member.password, () =>
    totpCode(account.member.totpURI),
  );
  return rpcWithCookie(cookie);
}

async function rejection(call: Promise<unknown>): Promise<RpcError> {
  const err = await call.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof RpcError)) throw new Error("expected an RpcError");
  return err;
}

async function inviteToken(rpc: Rpc, workspaceSlug: string, email: string): Promise<string> {
  const { url } = await rpc<{ url: string }>("workspaces.createInvite", { workspaceSlug, email });
  const token = new URL(url).searchParams.get("token");
  if (!token) throw new Error("the workspace invite URL carries no token");
  return token;
}

async function withWorkspace<T>(rpc: Rpc, run: (workspaceSlug: string) => Promise<T>): Promise<T> {
  const created = await rpc<{ slug: string }>("workspaces.create", { name: uniqueName() });
  try {
    return await run(created.slug);
  } finally {
    await rpc("workspaces.delete", { workspaceSlug: created.slug, code: await harness.totp() });
  }
}

test("the instance owner's address can't be invited, and the owner can't delete their own account", async () => {
  const { rpc, account } = await ana();

  const invite = await rejection(rpc("signupInvites.create", { email: account.email }));
  expect(invite.message).toBe("The instance owner's address can't be invited");

  const remove = await rejection(rpc("user.prepareDeleteAccount", { email: account.email }));
  expect(remove.message).toBe(
    "You're this instance's owner. Make another account the owner first, then come back.",
  );
});

test("a sign-up invite never hands back its link", async () => {
  const { rpc } = await ana();
  const email = `${uniqueName()}@${OUTSIDE_DOMAIN}`;
  const created = await rpc<{ invite: { id: string; email: string } }>("signupInvites.create", {
    email,
  });
  try {
    expect(created).not.toHaveProperty("url");
    expect(created.invite.email).toBe(email);
  } finally {
    await rpc("signupInvites.revoke", { inviteId: created.invite.id });
  }
});

test("a workspace invite works only for the account it was sent to", async () => {
  const { rpc, account } = await ana();
  const cy = await member();
  await withWorkspace(rpc, async (workspaceSlug) => {
    const token = await inviteToken(rpc, workspaceSlug, `${uniqueName()}@${OUTSIDE_DOMAIN}`);
    const refused = await rejection(cy("invites.accept", { token }));
    expect(refused.message).toBe(
      "This invite was sent to a different email address. Sign in with that account to accept it.",
    );
    const { members } = await rpc<{ members: { email: string }[] }>("workspaces.listMembers", {
      workspaceSlug,
    });
    expect(members.map((m) => m.email)).not.toContain(account.member.email);
  });
});

test("only an admin or the drive's owner can list a linked drive's top-level folders", async () => {
  const { rpc, account } = await ana();
  const cy = await member();
  await withWorkspace(rpc, async (workspaceSlug) => {
    const { drives } = await rpc<{ drives: { driveId: string; provider: string }[] }>(
      "workspaceDrives.attachable",
      { workspaceSlug },
    );
    const drive = drives.find((d) => d.provider === "s3") ?? drives[0];
    if (!drive) throw new Error("Ana has no drive to link");
    const { linkId } = await rpc<{ linkId: string }>("workspaceDrives.attach", {
      workspaceSlug,
      driveId: drive.driveId,
    });

    await cy("invites.accept", {
      token: await inviteToken(rpc, workspaceSlug, account.member.email),
    });

    const refused = await rejection(cy("workspaceDrives.roots", { workspaceSlug, linkId }));
    expect(refused.status).toBe(403);
    expect(refused.message).toBe("Only an admin can change what someone else's drive shows");

    const { roots } = await rpc<{ roots: { id: string; name: string }[] }>(
      "workspaceDrives.roots",
      { workspaceSlug, linkId },
    );
    expect(roots.length).toBeGreaterThan(0);
  });
});
