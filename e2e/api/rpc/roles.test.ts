import { expect, test } from "vitest";

import { APP, harness } from "../../clients/harness";
import { type Rpc, RpcError, rpcWithCookie } from "../../clients/rpc";
import { signIn } from "../../clients/sign-in";
import { setSection, withTotp } from "../support/config";
import { emailedInvite, inviteToWorkspace } from "../support/invites";
import { uniqueName } from "../support/poll";
import { ana, totpCode } from "../support/session";

const OUTSIDE_DOMAIN = "discard.demo.trymetis.email";

interface Users {
  users: { id: string; email: string; role: string; banned: boolean }[];
}

interface AuditPage {
  events: { action: string; targetLabel: string | null; detail: Record<string, unknown> }[];
}

const anonymous = rpcWithCookie("");

async function member(): Promise<{ rpc: Rpc; code: () => string; userId: string }> {
  const { rpc, account } = await ana();
  const code = () => totpCode(account.member.totpURI);
  const cookie = await signIn(account.member.email, account.member.password, code);
  const { users } = await rpc<Users>("dashboard.users.list", {});
  const userId = users.find((u) => u.email === account.member.email)?.id;
  if (!userId) throw new Error("the member is not listed");
  return { rpc: rpcWithCookie(cookie), code, userId };
}

async function rejection(call: Promise<unknown>): Promise<RpcError> {
  const err = await call.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof RpcError)) throw new Error("expected an RpcError");
  return err;
}

async function setRole(rpc: Rpc, userId: string, role: "admin" | "observer" | "user") {
  await withTotp((code) => rpc("dashboard.users.setRole", { userId, role, code }));
}

async function withWorkspace<T>(rpc: Rpc, run: (workspaceSlug: string) => Promise<T>): Promise<T> {
  const created = await rpc<{ slug: string }>("workspaces.create", { name: uniqueName() });
  try {
    return await run(created.slug);
  } finally {
    await rpc("workspaces.delete", { workspaceSlug: created.slug, code: await harness.totp() });
  }
}

test("the dashboard is a 404 without an instance role, read-only for an observer, and an admin can't touch the owner or grant admin", async () => {
  const { rpc, account } = await ana();
  const cy = await member();
  const { users } = await rpc<Users>("dashboard.users.list", {});
  const anaId = users.find((u) => u.email === account.email)?.id;
  expect(users.find((u) => u.email === account.email)?.role).toBe("owner");

  expect((await rejection(cy.rpc("dashboard.me"))).status).toBe(404);

  try {
    await setRole(rpc, cy.userId, "observer");
    expect(await cy.rpc("dashboard.me")).toEqual({ role: "observer" });
    expect((await cy.rpc<Users>("dashboard.users.list", {})).users.length).toBeGreaterThan(1);
    await cy.rpc("dashboard.audit");
    for (const call of [
      () => cy.rpc("dashboard.system.acknowledgePreflight", { id: 0 }),
      () =>
        cy.rpc("dashboard.invites.create", {
          email: `${uniqueName()}@${OUTSIDE_DOMAIN}`,
          instanceRole: null,
          code: cy.code(),
        }),
      () => cy.rpc("dashboard.invites.revoke", { inviteId: "none" }),
    ]) {
      const refused = await rejection(call());
      expect(refused.status).toBe(403);
      expect(refused.message).toBe("Observers can only read the dashboard");
    }

    await setRole(rpc, cy.userId, "admin");
    expect(await cy.rpc("dashboard.me")).toEqual({ role: "admin" });
    const owner = await rejection(
      cy.rpc("dashboard.users.setRole", { userId: anaId, role: "observer", code: cy.code() }),
    );
    expect(owner.message).toBe("The owner's role comes from METIS_OWNER_EMAIL");
    const grantAdmin = await rejection(
      cy.rpc("dashboard.invites.create", {
        email: `${uniqueName()}@${OUTSIDE_DOMAIN}`,
        instanceRole: "admin",
        code: cy.code(),
      }),
    );
    expect(grantAdmin.message).toBe("Only the instance owner can invite an admin");
    const removeOwner = await rejection(
      cy.rpc("dashboard.users.remove", { userId: anaId, code: cy.code() }),
    );
    expect(removeOwner.message).toBe("The instance owner can't be removed");
  } finally {
    await setRole(rpc, cy.userId, "user");
  }

  expect((await rejection(cy.rpc("dashboard.me"))).status).toBe(404);
  const { events } = await rpc<AuditPage>("dashboard.audit");
  expect(events).toContainEqual(
    expect.objectContaining({
      action: "instance_role.granted",
      targetLabel: account.member.email,
      detail: { to: "admin", from: "observer" },
    }),
  );
  expect(events).toContainEqual(
    expect.objectContaining({
      action: "instance_role.revoked",
      targetLabel: account.member.email,
      detail: { from: "admin" },
    }),
  );
});

test("a declined or used workspace invite stops working", async () => {
  const { rpc, account } = await ana();
  const cy = await member();
  await withWorkspace(rpc, async (workspaceSlug) => {
    const declined = await inviteToWorkspace(rpc, workspaceSlug, account.member.email);
    const preview = await cy.rpc<{ state: string; workspaceRole: string }>("signup.invitePreview", {
      token: declined.token,
    });
    expect(preview).toMatchObject({ workspaceRole: "member" });
    await cy.rpc("invites.decline", { token: declined.token });
    for (const call of [
      () => cy.rpc("invites.accept", { token: declined.token }),
      () => anonymous("signup.invitePreview", { token: declined.token }),
    ]) {
      expect((await rejection(call())).message).toBe("This invite link is no longer valid");
    }

    const accepted = await inviteToWorkspace(rpc, workspaceSlug, account.member.email);
    expect(await cy.rpc("invites.accept", { token: accepted.token })).toMatchObject({
      workspaceSlug,
    });
    expect((await rejection(cy.rpc("invites.accept", { token: accepted.token }))).message).toBe(
      "This invite link is no longer valid",
    );

    const { events } = await rpc<AuditPage>("audit.workspace", { workspaceSlug });
    for (const action of ["invite.declined", "invite.accepted"]) {
      expect(events).toContainEqual(
        expect.objectContaining({ action, targetLabel: account.member.email }),
      );
    }
  });
});

test("with invite-only sign-up, only the instance owner or an admin can invite an address with no account into a workspace", async () => {
  const { rpc, account } = await ana();
  const cy = await member();
  const { signupDisabled } = await rpc<{ signupDisabled: boolean }>("dashboard.system.instance");
  expect(signupDisabled).toBe(true);
  await withWorkspace(rpc, async (workspaceSlug) => {
    const { token } = await inviteToWorkspace(rpc, workspaceSlug, account.member.email);
    await cy.rpc("invites.accept", { token });
    const { members } = await rpc<{ members: { memberId: string; email: string }[] }>(
      "workspaces.listMembers",
      { workspaceSlug },
    );
    await rpc("workspaces.updateMemberRole", {
      workspaceSlug,
      memberId: members.find((m) => m.email === account.member.email)?.memberId,
      role: "admin",
      code: await harness.totp(),
    });

    const refused = await rejection(
      cy.rpc("workspaces.createInvite", {
        workspaceSlug,
        email: `${uniqueName()}@${OUTSIDE_DOMAIN}`,
      }),
    );
    expect(refused.status).toBe(403);
    expect(refused.message).toBe(
      "Ask the instance owner or an instance admin to invite this person.",
    );
  });
});

test("an account invite is emailed without handing back its link, creates the account with its instance role, and the owner removes it", async () => {
  const { rpc } = await ana();
  const email = `${uniqueName()}@${OUTSIDE_DOMAIN}`;
  const uncoded = await rejection(
    withTotp(() => rpc("dashboard.invites.create", { email, instanceRole: "observer" })),
  );
  expect(uncoded.message).toBe(
    "Enter your authenticator code to invite someone with an instance role",
  );
  let sent: { invite: { id: string; email: string }; link: string | null } | undefined;
  const { token } = await emailedInvite(rpc, email, async () => {
    sent = await withTotp((code) =>
      rpc<{ invite: { id: string; email: string }; link: string | null }>(
        "dashboard.invites.create",
        { email, instanceRole: "observer", code },
      ),
    );
    return sent.invite;
  });
  expect(sent?.link, "an account invite whose email was sent never hands back its link").toBeNull();
  expect(sent?.invite.email).toBe(email);

  expect(await anonymous("signup.invitePreview", { token })).toMatchObject({
    state: "signUp",
    email,
    workspaceName: null,
    instanceRole: "observer",
  });
  expect(
    await anonymous("signup.invite", {
      token,
      name: "Invited Observer",
      password: "invited-observer-password",
    }),
  ).toMatchObject({ email });
  expect((await rejection(anonymous("signup.invitePreview", { token }))).message).toBe(
    "This invite link is no longer valid",
  );

  const created = (await rpc<Users>("dashboard.users.list", {})).users.find(
    (u) => u.email === email,
  );
  expect(created?.role).toBe("observer");
  await withTotp((code) => rpc("dashboard.users.remove", { userId: created?.id, code }));
  expect((await rpc<Users>("dashboard.users.list", {})).users.map((u) => u.email)).not.toContain(
    email,
  );

  const { events } = await rpc<AuditPage>("dashboard.audit");
  for (const action of ["invite.created", "invite.accepted", "user.removed"]) {
    expect(events).toContainEqual(expect.objectContaining({ action, targetLabel: email }));
  }
});

test("the owner's address can't be taken through self sign-up, even when sign-up is open", async () => {
  const { rpc, account } = await ana();
  await setSection(rpc, "signup", { signupDisabled: false });
  try {
    const res = await fetch(`${APP}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: APP },
      body: JSON.stringify({
        email: account.email,
        password: "someone-else-password",
        name: "Not the owner",
      }),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "OWNER_ADDRESS_SETUP_ONLY" });
  } finally {
    await setSection(rpc, "signup", { signupDisabled: true });
  }
});

test("a workspace invite to a new address stops working once its sender loses the instance admin role, while sign-up is invite-only", async () => {
  const { rpc, account } = await ana();
  const cy = await member();
  const email = `${uniqueName()}@${OUTSIDE_DOMAIN}`;
  const { signupDisabled } = await rpc<{ signupDisabled: boolean }>("dashboard.system.instance");
  expect(signupDisabled).toBe(true);
  await withWorkspace(rpc, async (workspaceSlug) => {
    const joined = await inviteToWorkspace(rpc, workspaceSlug, account.member.email);
    await cy.rpc("invites.accept", { token: joined.token });
    const { members } = await rpc<{ members: { memberId: string; email: string }[] }>(
      "workspaces.listMembers",
      { workspaceSlug },
    );
    await rpc("workspaces.updateMemberRole", {
      workspaceSlug,
      memberId: members.find((m) => m.email === account.member.email)?.memberId,
      role: "admin",
      code: await harness.totp(),
    });

    await setRole(rpc, cy.userId, "admin");
    let token: string;
    try {
      token = (
        await emailedInvite(rpc, email, () =>
          cy.rpc<{ id: string }>("workspaces.createInvite", { workspaceSlug, email }),
        )
      ).token;
      expect(await anonymous("signup.invitePreview", { token })).toMatchObject({
        state: "signUp",
        email,
      });
    } finally {
      await setRole(rpc, cy.userId, "user");
    }

    for (const call of [
      () => anonymous("signup.invitePreview", { token }),
      () =>
        anonymous("signup.invite", {
          token,
          name: "Late Joiner",
          password: "late-joiner-password",
        }),
    ]) {
      expect((await rejection(call())).message).toBe(
        "Ask the instance owner or an instance admin to invite this person.",
      );
    }
  });
});
