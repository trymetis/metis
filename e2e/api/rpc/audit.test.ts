import { expect, test } from "vitest";

import { harness } from "../../clients/harness";
import { type Rpc, RpcError, rpcWithCookie } from "../../clients/rpc";
import { signIn } from "../../clients/sign-in";
import { inviteToWorkspace } from "../support/invites";
import { uniqueName } from "../support/poll";
import { ana, totpCode } from "../support/session";

const OUTSIDE_DOMAIN = "discard.demo.trymetis.email";

interface AuditEvent {
  id: string;
  createdAt: string;
  action: string;
  via: string;
  actorEmail: string;
  workspaceName: string | null;
  targetLabel: string | null;
  resourceKind: string | null;
  detail: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
}

interface AuditPage {
  events: AuditEvent[];
  nextCursor: string | null;
}

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

test("membership changes in a workspace are recorded for its admins, the member and the owner", async () => {
  const { rpc, account } = await ana();
  const cy = await member();
  const name = uniqueName();
  const created = await rpc<{ slug: string }>("workspaces.create", { name });
  const ws = { workspaceSlug: created.slug };
  try {
    const { token } = await inviteToWorkspace(rpc, created.slug, account.member.email);
    await cy("invites.accept", { token });
    const { members } = await rpc<{
      members: { memberId: string; email: string }[];
    }>("workspaces.listMembers", ws);
    const memberId = members.find((m) => m.email === account.member.email)?.memberId;
    expect(memberId).toBeDefined();

    await rpc("workspaces.updateMemberRole", {
      ...ws,
      memberId,
      role: "admin",
      code: await harness.totp(),
    });

    const adminView = await cy<AuditPage>("audit.workspace", ws);
    expect(adminView.events).toContainEqual(
      expect.objectContaining({
        action: "member.role_changed",
        via: "app",
        actorEmail: account.email,
        targetLabel: account.member.email,
        detail: { from: "member", to: "admin" },
        ip: null,
        userAgent: null,
      }),
    );
    for (const action of ["invite.created", "invite.accepted"]) {
      expect(adminView.events).toContainEqual(
        expect.objectContaining({ action, targetLabel: account.member.email }),
      );
    }

    await rpc("workspaces.removeMember", { ...ws, memberId });

    const own = await cy<AuditPage>("audit.mine");
    for (const action of ["member.role_changed", "member.removed"]) {
      expect(own.events).toContainEqual(expect.objectContaining({ action, workspaceName: name }));
    }
  } finally {
    await rpc("workspaces.delete", { ...ws, code: await harness.totp() });
  }

  const instance = await rpc<AuditPage & { retentionDays: number }>("dashboard.audit");
  expect(instance.retentionDays).toBeGreaterThan(0);
  expect(instance.events).toContainEqual(
    expect.objectContaining({
      action: "workspace.deleted",
      actorEmail: account.email,
      workspaceName: name,
    }),
  );
});

test("revoking a workspace invite is recorded with the invitee", async () => {
  const { rpc, account } = await ana();
  const ws = { workspaceSlug: account.workspaceSlug };
  const email = `${uniqueName()}@${OUTSIDE_DOMAIN}`;
  const { id } = await rpc<{ id: string }>("workspaces.createInvite", {
    ...ws,
    email,
  });
  await rpc("workspaces.revokeInvite", { ...ws, inviteId: id });

  const { events } = await rpc<AuditPage>("audit.workspace", ws);
  for (const action of ["invite.created", "invite.revoked"]) {
    expect(events).toContainEqual(
      expect.objectContaining({ action, via: "app", targetLabel: email }),
    );
  }

  const found = await rpc<AuditPage>("audit.workspace", { ...ws, q: "revoked the invite" });
  expect(found.events).toContainEqual(
    expect.objectContaining({ action: "invite.revoked", targetLabel: email }),
  );
  expect(found.events.every((event) => event.action === "invite.revoked")).toBe(true);
});

test("turning on a sensitive MCP tool is recorded with the tools", async () => {
  const { rpc } = await ana();
  const label = uniqueName();
  const { client } = await rpc<{ client: { clientId: string } }>("mcp.createClient", {
    label,
    preset: "custom",
    redirectUris: ["http://127.0.0.1/callback"],
  });
  try {
    await rpc("mcp.setTools", {
      clientId: client.clientId,
      tools: { createWorkspace: true },
    });
    const { events } = await rpc<AuditPage>("audit.mine");
    expect(events).toContainEqual(
      expect.objectContaining({
        action: "mcp_client.created",
        targetLabel: label,
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        action: "mcp_client.sensitive_tools_enabled",
        targetLabel: label,
        detail: { clientId: client.clientId, tools: ["createWorkspace"] },
      }),
    );
  } finally {
    await rpc("mcp.deleteClient", { clientId: client.clientId });
  }
});

test("pages are newest first and follow the cursor without repeats", async () => {
  const { rpc } = await ana();
  const first = await rpc<AuditPage>("dashboard.audit");
  const times = first.events.map((e) => Date.parse(e.createdAt));
  expect(times).toEqual(times.toSorted((a, b) => b - a));
  if (!first.nextCursor) return;
  const second = await rpc<AuditPage>("dashboard.audit", {
    cursor: first.nextCursor,
  });
  const seen = new Set(first.events.map((e) => e.id));
  expect(second.events.filter((e) => seen.has(e.id))).toEqual([]);
  expect(Date.parse(second.events[0]?.createdAt ?? "")).toBeLessThanOrEqual(times.at(-1) ?? 0);
});

test("only admins read workspace activity and only the owner reads the instance log", async () => {
  const { account } = await ana();
  const cy = await member();

  const outside = await rejection(cy("audit.workspace", { workspaceSlug: account.workspaceSlug }));
  expect(outside.code).toBe("FORBIDDEN");

  const dashboard = await rejection(cy("dashboard.audit"));
  expect(dashboard.code).toBe("NOT_FOUND");

  const doneToThem = [
    "member.role_changed",
    "member.removed",
    "workspace.ownership_transferred",
    "resource.detached",
    "instance_role.granted",
    "instance_role.revoked",
    "user.banned",
    "user.unbanned",
  ];
  const own = await cy<AuditPage>("audit.mine");
  for (const event of own.events) {
    if (event.actorEmail === account.member.email) continue;
    expect(doneToThem, "someone else's event reaches a member only when it targets them").toContain(
      event.action,
    );
  }
});

test("an address book detach is recorded and found by searching for address book", async () => {
  const { rpc } = await ana();
  const created = await rpc<{ slug: string }>("workspaces.create", { name: uniqueName() });
  const ws = { workspaceSlug: created.slug };
  try {
    const { addressBooks } = await rpc<{
      addressBooks: { addressBookId: string; provider: string }[];
    }>("workspaceAddressBooks.attachable", ws);
    const book = addressBooks.find((b) => b.provider === "carddav");
    expect(book).toBeDefined();
    await rpc("workspaceAddressBooks.attach", { ...ws, addressBookId: book?.addressBookId });
    const listed = await rpc<{ addressBooks: { linkId: string }[] }>(
      "workspaceAddressBooks.list",
      ws,
    );
    await rpc("workspaceAddressBooks.detach", { ...ws, linkId: listed.addressBooks[0]?.linkId });

    const found = await rpc<AuditPage>("audit.workspace", { ...ws, q: "address book detached" });
    expect(found.events).toContainEqual(
      expect.objectContaining({ action: "resource.detached", resourceKind: "addressbook" }),
    );
  } finally {
    await rpc("workspaces.delete", { ...ws, code: await harness.totp() });
  }
});
