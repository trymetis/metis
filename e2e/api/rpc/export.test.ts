import { CLIENTS_FOLDER } from "@metis/e2e/lib/cast";
import { WORKSPACE_CHATS } from "@metis/e2e/lib/llm-scenarios";
import { expect, test } from "vitest";

import { type Rpc, rpcWithCookie } from "../../clients/rpc";
import { signIn } from "../../clients/sign-in";
import { uniqueName } from "../support/poll";
import { ana, mailboxScope, totpCode } from "../support/session";

interface ResourceLink {
  provider: string;
  email: string;
  slug: string;
  shared: boolean;
  aiEnabled: boolean;
}

interface DataExport {
  format: string;
  version: number;
  exportedAt: string;
  notice: string;
  account: { name: string; email: string; createdAt: string };
  preferences: {
    defaultWorkspace: string | null;
    workspaceOrder: string[];
    mailRemoteContent: string;
    mailCleanLinks: boolean;
    signInAlerts: boolean;
    remoteContentAllowed: { kind: string; value: string }[];
  };
  workspaces: {
    name: string;
    slug: string;
    role: string;
    themeBrand: string;
    mailboxes: (ResourceLink & { phishingDetectionEnabled: boolean })[];
    calendars: (ResourceLink & { visibleCalendarIds: string[] })[];
    drives: (ResourceLink & { visibleRootIds: string[] })[];
  }[];
  signatures: {
    mailbox: string;
    scope: string;
    name: string;
    html: string;
    defaultNew: boolean;
    defaultReply: boolean;
    createdAt: string;
  }[];
  labels: {
    mailbox: string;
    definitions: { key: string; name: string; color: string }[];
    assignments: { messageId: string; label: string; source: string }[];
  }[];
  workflows: {
    workspace: string | null;
    name: string;
    enabled: boolean;
    mailboxes: Record<string, string>;
    calendars: Record<string, string>;
    drives: Record<string, string>;
    graph: { nodes: { step: string }[] };
  }[];
  assistantThreads: {
    workspace: string | null;
    title: string;
    messages: { role: string; parts: { type: string; text?: string }[] }[];
  }[];
  securityActivity: {
    at: string;
    action: string;
    actorEmail: string;
    targetLabel: string | null;
  }[];
}

function exportData(rpc: Rpc) {
  return rpc<DataExport>("user.exportData");
}

test("the export holds the account's preferences, workspaces, labels, workflows and chats", async () => {
  const { rpc, account } = await ana();
  const data = await exportData(rpc);

  expect(data.format).toBe("metis-suite-export");
  expect(data.version).toBe(1);
  expect(data.notice).toContain("not a mailbox archive");
  expect(data.account.email).toBe(account.email);
  expect(data.preferences.workspaceOrder).toContain(account.workspaceSlug);
  expect(typeof data.preferences.signInAlerts).toBe("boolean");

  const workspace = data.workspaces.find((w) => w.slug === account.workspaceSlug);
  expect(workspace).toMatchObject({ role: "owner", themeBrand: "blue" });
  expect(workspace?.mailboxes.map((m) => m.slug)).toContain(account.mailboxSlug);
  expect(workspace?.calendars.map((c) => c.slug)).toContain(account.calendarSlug);
  expect(workspace?.drives.map((d) => d.slug)).toEqual(
    expect.arrayContaining(Object.values(account.driveSlugs)),
  );
  const ftp = workspace?.drives.find((d) => d.slug === account.driveSlugs.ftp);
  expect(ftp?.visibleRootIds).toEqual([CLIENTS_FOLDER]);

  const definitions = data.labels.flatMap((l) => l.definitions);
  expect(definitions).toContainEqual({
    key: "custom:clients",
    name: "Clients",
    color: "blue",
    createdAt: expect.any(String),
  });

  const rebrand = data.workflows.find((w) => w.name === "Label rebrand mail");
  expect(rebrand?.workspace).toBe(account.workspaceSlug);
  expect(rebrand?.graph.nodes.length).toBeGreaterThan(0);
  const sourced = data.workflows.filter((w) => w.graph.nodes.some((n) => n.step === "mail.list"));
  expect(sourced.length).toBeGreaterThan(0);
  for (const w of sourced) {
    expect(Object.keys(w.mailboxes).length, w.name).toBeGreaterThan(0);
  }

  const stored = data.assistantThreads.find((t) =>
    t.messages
      .find((m) => m.role === "user")
      ?.parts.some((p) => p.text === WORKSPACE_CHATS.stored[0]),
  );
  expect(stored?.workspace).toBe(account.workspaceSlug);
  expect(stored?.messages.filter((m) => m.role === "user").length).toBe(
    WORKSPACE_CHATS.stored.length,
  );
});

test("the export holds the account's own and mailbox signatures, never the workspace's", async () => {
  const { rpc, account } = await ana();
  const box = mailboxScope(account);
  const ws = { workspaceSlug: account.workspaceSlug };
  const name = uniqueName();
  const fields = (html: string) => ({ name, html, defaultNew: false, defaultReply: false });
  const saved = await Promise.all([
    rpc<{ signature: { id: string } }>("mail.signatures.save", {
      ...box,
      scope: "personal",
      signature: fields("<p>personal</p>"),
    }),
    rpc<{ signature: { id: string } }>("mail.signatures.save", {
      ...box,
      scope: "mailbox",
      signature: fields("<p>mailbox</p>"),
    }),
    rpc<{ signature: { id: string } }>("workspaceSignatures.save", {
      ...ws,
      signature: fields("<p>workspace</p>"),
    }),
  ]);
  try {
    const { signatures } = await exportData(rpc);
    const mine = signatures.filter((s) => s.name === name);
    expect(mine.map((s) => `${s.scope} ${s.html}`).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "mailbox <p>mailbox</p>",
      "personal <p>personal</p>",
    ]);
    for (const s of mine) {
      expect(s).toMatchObject({
        defaultNew: false,
        defaultReply: false,
        createdAt: expect.any(String),
      });
      expect(s.mailbox).toContain("@");
    }
  } finally {
    const [personal, mailbox, shared] = saved;
    await rpc("mail.signatures.delete", { ...box, scope: "personal", id: personal.signature.id });
    await rpc("mail.signatures.delete", { ...box, scope: "mailbox", id: mailbox.signature.id });
    await rpc("workspaceSignatures.delete", { ...ws, id: shared.signature.id });
  }
});

test("the export holds the account's own security activity", async () => {
  const { rpc, account } = await ana();
  const ws = { workspaceSlug: account.workspaceSlug };
  const email = `${uniqueName()}@discard.demo.trymetis.email`;
  const { id } = await rpc<{ id: string }>("workspaces.createInvite", {
    ...ws,
    email,
  });
  await rpc("workspaces.revokeInvite", { ...ws, inviteId: id });

  const { securityActivity } = await exportData(rpc);
  expect(securityActivity).toContainEqual(
    expect.objectContaining({
      action: "invite.revoked",
      actorEmail: account.email,
      targetLabel: email,
      at: expect.any(String),
    }),
  );
  for (const event of securityActivity) {
    expect(event).not.toHaveProperty("id");
    expect(event).not.toHaveProperty("mcpClientId");
  }
});

test("the export carries no credentials", async () => {
  const { rpc, account } = await ana();
  const raw = JSON.stringify(await exportData(rpc));
  for (const key of [
    "accessToken",
    "refreshToken",
    "credentials",
    "password",
    "totp",
    "backupCodes",
  ]) {
    expect(raw).not.toContain(`"${key}"`);
  }
  expect(raw).not.toContain(account.password);
});

test("a member's export holds only their own data", async () => {
  const { account } = await ana();
  const { member } = account;
  const cookie = await signIn(member.email, member.password, () => totpCode(member.totpURI));
  const data = await exportData(rpcWithCookie(cookie));

  expect(data.account.email).toBe(member.email);
  const slugs = data.workspaces.map((w) => w.slug);
  expect(slugs).toContain(member.workspaceSlug);
  expect(slugs).not.toContain(account.workspaceSlug);
  expect(data.labels.flatMap((l) => l.definitions)).not.toContainEqual(
    expect.objectContaining({ key: "custom:clients" }),
  );
  expect(data.signatures.map((s) => s.scope)).not.toContain("mailbox");
  expect(data.workflows.map((w) => w.workspace)).not.toContain(account.workspaceSlug);
  expect(data.assistantThreads.map((t) => t.workspace)).not.toContain(account.workspaceSlug);
});
