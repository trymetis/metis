import { expect, test } from "vitest";

import { jsonRpc, modernBody, modernHeaders, postMcp } from "../../clients/mcp";
import { type Rpc, RpcError, rpcWithCookie } from "../../clients/rpc";
import { signIn } from "../../clients/sign-in";
import { withTotp } from "../support/config";
import { inviteAccount } from "../support/invites";
import { McpSession, memberToken } from "../support/mcp";
import { uniqueName, until } from "../support/poll";
import { ana, totpCode } from "../support/session";
import { at, edge, graphOf, lit, node, SETTLED } from "../support/workflow";

const OUTSIDE_DOMAIN = "discard.demo.trymetis.email";

const SESSION_CACHE_MS = 2 * 60_000;

const BANNED = "This account is banned. Ask the instance owner or an admin.";

interface Users {
  users: {
    id: string;
    email: string;
    role: string;
    banned: boolean;
    banReason: string | null;
    banExpiresAt: string | null;
  }[];
}

interface AuditPage {
  events: { action: string; targetLabel: string | null; detail: Record<string, unknown> }[];
}

async function rejection(call: Promise<unknown>): Promise<RpcError> {
  const err = await call.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof RpcError)) throw new Error("expected an RpcError");
  return err;
}

async function failure(call: Promise<unknown>): Promise<Error> {
  const err = await call.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof Error)) throw new Error("expected the call to fail");
  return err;
}

async function member() {
  const { rpc, account } = await ana();
  const code = () => totpCode(account.member.totpURI);
  const signInMember = () => signIn(account.member.email, account.member.password, code);
  const { users } = await rpc<Users>("dashboard.users.list", { search: account.member.email });
  const userId = users.find((u) => u.email === account.member.email)?.id;
  if (!userId) throw new Error("the member is not listed");
  return {
    rpc: rpcWithCookie(await signInMember()),
    signIn: signInMember,
    code,
    userId,
    email: account.member.email,
    workspaceSlug: account.member.workspaceSlug,
  };
}

async function setRole(rpc: Rpc, userId: string, role: "admin" | "observer" | "user") {
  await withTotp((code) => rpc("dashboard.users.setRole", { userId, role, code }));
}

test("a ban signs the user out, refuses sign-in, stops their MCP clients and their workflows, and an unban lets them back", async () => {
  const { rpc } = await ana();
  const cy = await member();
  const workspace = { workspaceSlug: cy.workspaceSlug };

  const mcp = await McpSession.open(await memberToken());
  await mcp.ok("listWorkspaces", {});
  await mcp.close();

  const graph = graphOf(
    [
      node("manual", "trigger.manual", at(0)),
      node("before", "logic.set", at(1), { fields: lit([]) }),
      node("later", "flow.delay", at(2), { amount: lit(1), unit: lit("minutes") }),
      node("after", "logic.set", at(3), { fields: lit([]) }),
    ],
    [edge("manual", "before"), edge("before", "later"), edge("later", "after")],
  );
  const { workflow } = await cy.rpc<{ workflow: { id: string } }>("workflows.create", {
    ...workspace,
    workflow: { name: uniqueName(), enabled: true, graph },
  });
  const { runId } = await cy.rpc<{ runId: string }>("workflows.run", {
    ...workspace,
    id: workflow.id,
  });
  const waiting = await until(
    () =>
      cy.rpc<{ run: { status: string; dueAt: string } }>("workflows.getRun", {
        ...workspace,
        runId,
      }),
    ({ run }) => run.status === "waiting",
    { timeout: 60_000, what: "the run to start waiting" },
  );

  let banned = false;
  try {
    await withTotp((code) =>
      rpc("dashboard.users.ban", { userId: cy.userId, reason: "e2e ban", duration: "1d", code }),
    );
    banned = true;
    const bannedAt = Date.now();

    expect((await failure(cy.signIn())).message).toContain(BANNED);
    const refusedMcp = await postMcp(
      await memberToken(),
      modernBody("tools/list"),
      modernHeaders("tools/list"),
    );
    expect(refusedMcp.status).toBe(403);
    expect((await jsonRpc(refusedMcp)).error).toMatchObject({ message: BANNED });

    const { users } = await rpc<Users>("dashboard.users.list", { status: "banned" });
    const listed = users.find((u) => u.id === cy.userId);
    expect(listed).toMatchObject({ banned: true, banReason: "e2e ban" });
    expect(new Date(listed?.banExpiresAt ?? 0).getTime()).toBeGreaterThan(Date.now());
    const active = await rpc<Users>("dashboard.users.list", { status: "active" });
    expect(active.users.map((u) => u.id)).not.toContain(cy.userId);

    const wakeAt = Math.max(
      new Date(waiting.run.dueAt).getTime() + 30_000,
      bannedAt + SESSION_CACHE_MS + 5_000,
    );
    await new Promise((done) => setTimeout(done, Math.max(wakeAt - Date.now(), 0)));
    expect((await rejection(cy.rpc("audit.mine"))).status).toBe(401);
  } finally {
    if (banned) {
      await withTotp((code) => rpc("dashboard.users.unban", { userId: cy.userId, code }));
    }
  }

  const back = rpcWithCookie(await cy.signIn());
  const settled = await until(
    () =>
      back<{ run: { status: string; error: string | null } }>("workflows.getRun", {
        ...workspace,
        runId,
      }),
    ({ run }) => SETTLED.includes(run.status),
    { timeout: 60_000, what: "the run to settle" },
  );
  expect(settled.run).toMatchObject({
    status: "blocked",
    error: "The workflow's owner is banned from this instance",
  });
  await back("workflows.delete", { ...workspace, id: workflow.id });

  const reopened = await McpSession.open(await memberToken());
  await reopened.ok("listWorkspaces", {});
  await reopened.close();

  const { events } = await rpc<AuditPage>("dashboard.audit");
  expect(events).toContainEqual(
    expect.objectContaining({
      action: "user.banned",
      targetLabel: cy.email,
      detail: expect.objectContaining({ reason: "e2e ban" }),
    }),
  );
  expect(events).toContainEqual(
    expect.objectContaining({ action: "user.unbanned", targetLabel: cy.email }),
  );
});

test("nobody bans the owner or themselves, and an admin can't ban another admin", async () => {
  const { rpc, account } = await ana();
  const cy = await member();
  const { users } = await rpc<Users>("dashboard.users.list", { role: "owner" });
  const anaId = users.find((u) => u.email === account.email)?.id;

  const owner = await rejection(
    withTotp((code) => rpc("dashboard.users.ban", { userId: anaId, duration: "permanent", code })),
  );
  expect(owner.message).toBe("The instance owner can't be banned");

  const adminEmail = `${uniqueName()}@${OUTSIDE_DOMAIN}`;
  const { token } = await inviteAccount(rpc, adminEmail, "admin");
  await rpcWithCookie("")("signup.invite", {
    token,
    name: "Second Admin",
    password: "second-admin-password",
  });
  const secondAdmin = (await rpc<Users>("dashboard.users.list", { search: adminEmail })).users[0];
  expect(secondAdmin).toMatchObject({ email: adminEmail, role: "admin" });

  await setRole(rpc, cy.userId, "admin");
  try {
    const self = await rejection(
      cy.rpc("dashboard.users.ban", { userId: cy.userId, duration: "permanent", code: cy.code() }),
    );
    expect(self.message).toBe("You can't ban yourself");
    const byAdmin = await rejection(
      cy.rpc("dashboard.users.ban", { userId: anaId, duration: "permanent", code: cy.code() }),
    );
    expect(byAdmin.message).toBe("The instance owner can't be banned");
    const adminOnAdmin = await rejection(
      cy.rpc("dashboard.users.ban", {
        userId: secondAdmin?.id,
        duration: "permanent",
        code: cy.code(),
      }),
    );
    expect(adminOnAdmin.status).toBe(403);
    expect(adminOnAdmin.message).toBe("Only the instance owner can ban an admin");
  } finally {
    await setRole(rpc, cy.userId, "user");
    await withTotp((code) => rpc("dashboard.users.remove", { userId: secondAdmin?.id, code }));
  }

  const notBanned = await rejection(
    withTotp((code) => rpc("dashboard.users.unban", { userId: cy.userId, code })),
  );
  expect(notBanned.message).toBe("This user isn't banned");
});
