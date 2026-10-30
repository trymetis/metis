import { PEOPLE, REBRAND_FOLDER, SENDERS, SUBJECTS } from "@metis/e2e/lib/cast";
import { env } from "@metis/e2e/lib/env";
import { appendFixture, deleteFixture } from "@metis/e2e/lib/fixture-mail";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";

import { type Account, harness } from "../../clients/harness";
import { type Rpc, rpcWithCookie } from "../../clients/rpc";
import { signIn } from "../../clients/sign-in";
import { TOOL_GROUPS, type ToolGroup } from "../../lib/mcp-clients";
import { anchorMessageId } from "../../seed/mailbox/anchors";
import { type McpSession, session } from "../support/mcp";
import { uniqueName, until } from "../support/poll";
import { ana, totpCode } from "../support/session";
import { SETTLED } from "../support/workflow";

const BANK = SUBJECTS.bank;
const SHOP = SUBJECTS.newsletter;
const CODEYARD = SUBJECTS.otp;
const OUTSIDE_DOMAIN = "discard.demo.trymetis.email";
const RANGE = {
  timeMin: "2026-10-04T00:00:00Z",
  timeMax: "2026-10-11T00:00:00Z",
};
const SEEDED_WORKFLOWS = [
  "Label rebrand mail",
  "Morning newsletter sweep",
  "File new mail from Raj",
  "Collect rebrand and Codeyard mail",
  "Label orders once both checks finish",
  "Triage with the decision model",
  "Triage new mail",
  "Star the newest mail once approved",
  "Label mail a webhook names",
];
const CONFIGURED_PROVIDERS: Record<string, number> = {
  imap: 1,
  caldav: 1,
  cloudflare: 1,
  resend: 1,
  s3: 2,
  webdav: 1,
  ftp: 3,
  sftp: 1,
};

interface Email {
  id: string;
  threadId?: string;
  subject: string;
  isRead: boolean;
  isStarred: boolean;
}

interface Context {
  account: Account;
  rpc: Rpc;
  workspaceId: string;
  mailboxId: string;
  kickoff: Email;
  inviteId: string;
  attachmentId: string;
  driveId: string;
  work: { calendarAccountId: string; calendarId: string };
  event: { eventId: string; calendarAccountId: string; calendarId: string };
  anaMemberId: string;
  runId: string;
  ask: unknown;
  temp: { workspaceId: string; slug: string } | null;
}

interface Case {
  tool: string;
  run: (s: McpSession, c: Context) => Promise<void>;
}

interface AuditPage {
  events: { action: string; via: string; targetLabel: string | null }[];
}

type MailboxRef = Pick<Context, "workspaceId" | "mailboxId">;

const ws = (c: Pick<Context, "workspaceId">) => ({
  workspaceId: c.workspaceId,
});
const box = (c: MailboxRef) => ({ ...ws(c), mailboxId: c.mailboxId });
const drive = (c: Context) => ({ ...ws(c), driveId: c.driveId });
const work = (c: Context) => ({ ...ws(c), ...c.work });

async function emails(s: McpSession, c: MailboxRef, folder: string, limit = 50): Promise<Email[]> {
  return (await s.ok<{ emails: Email[] }>("listEmails", { ...box(c), folder, limit })).emails;
}

async function find(
  s: McpSession,
  c: Context,
  folder: string,
  subject: string,
): Promise<Email | undefined> {
  return (await emails(s, c, folder)).find((e) => e.subject === subject);
}

async function must(s: McpSession, c: Context, folder: string, subject: string): Promise<Email> {
  const found = await until(
    () => find(s, c, folder, subject),
    (e) => e !== undefined,
    { timeout: 30_000, what: `"${subject}" in ${folder}` },
  );
  if (!found) throw new Error(`"${subject}" is not in ${folder}`);
  return found;
}

async function backToInbox(s: McpSession, c: Context, subject: string) {
  for (const folder of ["archive", "trash"]) {
    const stray = await find(s, c, folder, subject);
    if (stray) await s.ok("restoreEmail", { ...box(c), id: stray.id });
  }
  await must(s, c, "inbox", subject);
}

const GRAPH = (mailboxId: string) => ({
  version: 2,
  nodes: [
    { id: "manual", step: "trigger.manual", position: { x: 0, y: 0 }, params: {} },
    {
      id: "inbox",
      step: "mail.list",
      position: { x: 0, y: 170 },
      params: {
        mailbox: { kind: "literal", value: mailboxId },
        folder: { kind: "literal", value: "inbox" },
        limit: { kind: "literal", value: 5 },
      },
    },
    {
      id: "never",
      step: "logic.filter",
      position: { x: 0, y: 340 },
      params: { condition: { kind: "expr", cel: `item.from == "nobody@${OUTSIDE_DOMAIN}"` } },
    },
    {
      id: "star",
      step: "mail.star",
      position: { x: 0, y: 510 },
      params: { message: { kind: "expr", cel: "item" }, starred: { kind: "literal", value: true } },
    },
  ],
  edges: [
    { id: "e1", source: "manual", target: "inbox", sourceHandle: "out" },
    { id: "e2", source: "inbox", target: "never", sourceHandle: "out" },
    { id: "e3", source: "never", target: "star", sourceHandle: "out" },
  ],
  settings: {},
});

async function withWorkflow(
  s: McpSession,
  c: Context,
  run: (workflowId: string, name: string) => Promise<void>,
) {
  const name = uniqueName();
  const { workflow } = await s.ok<{ workflow: { id: string } }>("createWorkflow", {
    ...ws(c),
    workflow: { name, enabled: true, graph: GRAPH(c.mailboxId) },
  });
  try {
    await run(workflow.id, name);
  } finally {
    await s.call("deleteWorkflow", { ...ws(c), workflowId: workflow.id });
  }
}

async function settledRun(s: McpSession, c: Context, runId: string) {
  return (
    await until(
      () =>
        s.ok<{ run: { status: string } }>("getWorkflowRun", {
          ...ws(c),
          runId,
        }),
      (r) => SETTLED.includes(r.run.status),
      { timeout: 90_000, interval: 2_000, what: `run ${runId} to settle` },
    )
  ).run;
}

async function withFolder(
  s: McpSession,
  c: Context,
  run: (fileId: string, name: string) => Promise<void>,
) {
  const name = uniqueName();
  const created = await s.ok<{ fileId: string }>("createFolder", {
    ...drive(c),
    name,
  });
  try {
    await run(created.fileId, name);
  } finally {
    for (const parent of [undefined, REBRAND_FOLDER]) {
      const { entries } = await s.ok<{
        entries: { fileId: string; name: string }[];
      }>("listFolder", { ...drive(c), folderId: parent });
      for (const leftover of entries.filter((e) => e.name.startsWith(name))) {
        await s.call("deleteFile", { ...drive(c), fileId: leftover.fileId });
      }
    }
  }
}

async function folderEntries(s: McpSession, c: Context, folderId?: string) {
  return (
    await s.ok<{ entries: { fileId: string; name: string; kind: string }[] }>("listFolder", {
      ...drive(c),
      folderId,
    })
  ).entries;
}

async function withEvent(
  s: McpSession,
  c: Context,
  run: (eventId: string, title: string) => Promise<void>,
) {
  const title = uniqueName();
  const { eventId } = await s.ok<{ eventId: string }>("createEvent", {
    ...work(c),
    title,
    start: "2026-10-20T10:00:00Z",
    end: "2026-10-20T11:00:00Z",
    attendees: [c.account.email],
    timeZone: "UTC",
  });
  try {
    await run(eventId, title);
  } finally {
    await s.call("deleteEvent", { ...work(c), eventId });
  }
}

async function withDraft(
  s: McpSession,
  c: Context,
  run: (draftId: string, subject: string) => Promise<void>,
) {
  const subject = `${uniqueName()} draft`;
  const { draftId } = await s.ok<{ draftId: string }>("createDraft", {
    ...box(c),
    to: [`draft@${OUTSIDE_DOMAIN}`],
    subject,
    bodyHtml: "<p>draft</p>",
  });
  try {
    await run(draftId, subject);
  } finally {
    const leftover = await find(s, c, "drafts", subject);
    if (leftover) await s.call("deleteDraft", { ...box(c), draftId: leftover.id });
  }
}

async function withSchedule(
  s: McpSession,
  c: Context,
  run: (scheduleId: string, subject: string) => Promise<void>,
) {
  const subject = `${uniqueName()} scheduled`;
  const { scheduleId } = await s.ok<{ scheduleId: string }>("scheduleEmail", {
    ...box(c),
    to: [`later@${OUTSIDE_DOMAIN}`],
    subject,
    bodyHtml: "<p>later</p>",
    scheduledFor: new Date(Date.now() + 86_400_000).toISOString(),
  });
  try {
    await run(scheduleId, subject);
  } finally {
    await s.call("cancelScheduled", { ...box(c), scheduleId });
  }
}

async function scheduledNamed(s: McpSession, c: Context, subject: string) {
  return (
    await s.ok<{
      scheduled: { scheduleId: string; subject: string; status: string }[];
    }>("listScheduled", box(c))
  ).scheduled.filter((item) => item.subject === subject);
}

async function snoozedNamed(s: McpSession, c: Context, subject: string) {
  return (
    await s.ok<{ emails: { id: string; subject: string; status: string }[] }>("listSnoozed", box(c))
  ).emails.find((e) => e.subject === subject);
}

async function snooze(s: McpSession, c: Context): Promise<Email> {
  const target = await must(s, c, "inbox", SHOP);
  await s.ok("snoozeEmail", {
    ...box(c),
    id: target.id,
    wakeAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  await until(
    () => snoozedNamed(s, c, SHOP),
    (e) => e?.status === "pending",
    { timeout: 30_000, what: "the snooze to be armed" },
  );
  return target;
}

async function clearSnooze(s: McpSession, c: Context) {
  const left = await snoozedNamed(s, c, SHOP);
  if (left) await s.call("cancelSnooze", { ...box(c), id: left.id });
  await backToInbox(s, c, SHOP);
}

const READS: Case[] = [
  {
    tool: "listWorkspaces",
    run: async (s, c) => {
      const out = await s.ok<{
        count: number;
        workspaces: { workspaceId: string; slug: string; role: string }[];
      }>("listWorkspaces", {});
      expect(out.count).toBe(out.workspaces.length);
      expect(out.workspaces).toContainEqual(
        expect.objectContaining({
          workspaceId: c.workspaceId,
          slug: c.account.workspaceSlug,
          role: "owner",
        }),
      );
    },
  },
  {
    tool: "getWorkspace",
    run: async (s, c) => {
      const out = await s.ok<{
        workspaceId: string;
        role: string;
        mailboxes: { email: string }[];
        calendarAccounts: unknown[];
        drives: unknown[];
        members: { email: string; role: string }[];
      }>("getWorkspace", ws(c));
      expect(out.workspaceId).toBe(c.workspaceId);
      expect(out.role).toBe("owner");
      expect(out.mailboxes.map((m) => m.email)).toEqual([c.account.email]);
      expect(out.drives).toHaveLength(Object.keys(c.account.driveSlugs).length);
      expect(out.calendarAccounts.length).toBeGreaterThan(0);
      expect(out.members).toContainEqual(
        expect.objectContaining({ email: c.account.email, role: "owner" }),
      );
    },
  },
  {
    tool: "listAccountResources",
    run: async (s, c) => {
      const out = await s.ok<{
        mailboxes: { email: string; workspaces: { workspaceSlug: string }[] }[];
        calendars: unknown[];
        drives: unknown[];
      }>("listAccountResources", {});
      const mailbox = out.mailboxes.find((m) => m.email === c.account.email);
      expect(mailbox?.workspaces.map((w) => w.workspaceSlug)).toContain(c.account.workspaceSlug);
      expect(out.drives.length).toBeGreaterThanOrEqual(Object.keys(c.account.driveSlugs).length);
      expect(out.calendars.length).toBeGreaterThan(0);
    },
  },
  {
    tool: "listUnavailableAccounts",
    run: async (s) => {
      const out = await s.ok<{ count: number; accounts: unknown[] }>("listUnavailableAccounts", {});
      expect(out).toMatchObject({ count: 0, accounts: [] });
    },
  },
  {
    tool: "listSignupInvites",
    run: async (s, c) => {
      const out = await s.ok<{
        count: number;
        invites: { email: string; acceptedAt: string | null }[];
      }>("listSignupInvites", {});
      expect(out.count).toBe(out.invites.length);
      const member = out.invites.find((i) => i.email === c.account.member.email);
      expect(member?.acceptedAt).toBeTruthy();
    },
  },
  {
    tool: "getInstanceStats",
    run: async (s, c) => {
      const out = await s.ok<Record<string, number>>("getInstanceStats", {});
      expect(out.users).toBeGreaterThanOrEqual(2);
      expect(out.workspaces).toBeGreaterThanOrEqual(2);
      expect(out.mailboxes).toBeGreaterThanOrEqual(1);
      expect(out.calendars).toBeGreaterThanOrEqual(1);
      expect(out.drives).toBeGreaterThanOrEqual(Object.keys(c.account.driveSlugs).length);
    },
  },
  {
    tool: "getInstanceUsage",
    run: async (s) => {
      for (const range of ["7d", "30d", "90d"]) {
        const out = await s.ok<{
          totals: { calls: number };
          byFeature: unknown[];
          byModel: unknown[];
          daily: unknown[];
          recent: unknown[];
        }>("getInstanceUsage", { range });
        expect(typeof out.totals.calls, range).toBe("number");
        for (const key of ["byFeature", "byModel", "daily", "recent"] as const)
          expect(Array.isArray(out[key]), `${range} ${key}`).toBe(true);
      }
    },
  },
  {
    tool: "getInstanceOverview",
    run: async (s) => {
      const out = await s.ok<{
        quarantinedConnections: number;
        scheduledPending: number;
        tokens7d: unknown[];
      }>("getInstanceOverview", {});
      expect(out.quarantinedConnections).toBe(0);
      expect(typeof out.scheduledPending).toBe("number");
      expect(Array.isArray(out.tokens7d)).toBe(true);
    },
  },
  {
    tool: "getInstanceConnections",
    run: async (s) => {
      const out = await s.ok<{
        total: number;
        quarantined: number;
        byProvider: { provider: string }[];
      }>("getInstanceConnections", {});
      expect(out.total).toBeGreaterThanOrEqual(9);
      expect(out.quarantined).toBe(0);
      expect(out.byProvider.map((p) => p.provider)).toEqual(
        expect.arrayContaining(["imap", "caldav", "s3", "webdav", "ftp", "sftp"]),
      );
    },
  },
  {
    tool: "getInstancePeople",
    run: async (s, c) => {
      const out = await s.ok<{
        users: number;
        withTwoFactor: number;
        recentUsers: { email: string; twoFactorEnabled: boolean }[];
      }>("getInstancePeople", {});
      expect(out.users).toBeGreaterThanOrEqual(2);
      expect(out.withTwoFactor).toBeGreaterThanOrEqual(2);
      for (const email of [c.account.email, c.account.member.email]) {
        expect(out.recentUsers).toContainEqual(
          expect.objectContaining({ email, twoFactorEnabled: true }),
        );
      }
    },
  },
  {
    tool: "getInstanceWorkspaces",
    run: async (s, c) => {
      const out = await s.ok<{ total: number; list: { slug: string }[] }>(
        "getInstanceWorkspaces",
        {},
      );
      expect(out.total).toBe(out.list.length);
      expect(out.list.map((w) => w.slug)).toEqual(
        expect.arrayContaining([c.account.workspaceSlug, c.account.member.workspaceSlug]),
      );
    },
  },
  {
    tool: "getInstanceAutomation",
    run: async (s) => {
      const out = await s.ok<{
        runner: { driver: string };
        workflows: { total: number };
      }>("getInstanceAutomation", {});
      expect(out.runner.driver).toBe("internal");
      expect(out.workflows.total).toBeGreaterThanOrEqual(SEEDED_WORKFLOWS.length);
    },
  },
  {
    tool: "getInstanceMcpClients",
    run: async (s, c) => {
      const out = await s.ok<{
        total: number;
        clients: { clientId: string }[];
      }>("getInstanceMcpClients", {});
      expect(out.total).toBe(out.clients.length);
      expect(out.clients.map((m) => m.clientId)).toEqual(
        expect.arrayContaining([
          ...Object.values(c.account.mcpClients).map((m) => m.clientId),
          c.account.member.mcpClient.clientId,
        ]),
      );
    },
  },
  {
    tool: "getInstanceAuditLog",
    run: async (s) => {
      const out = await s.ok<{
        retentionDays: number;
        events: Record<string, unknown>[];
        nextCursor: string | null;
      }>("getInstanceAuditLog", {});
      expect(out.retentionDays).toBeGreaterThan(0);
      for (const event of out.events) {
        expect(event, "network details stay out of the model").not.toHaveProperty("ip");
        expect(event).not.toHaveProperty("userAgent");
      }
      const times = out.events.map((e) => Date.parse(String(e.createdAt)));
      expect(times).toEqual(times.toSorted((a, b) => b - a));
    },
  },
  {
    tool: "getSystemOverview",
    run: async (s) => {
      const out = await s.ok<{
        drivers: unknown[];
        providers: { provider: string; configured: boolean }[];
      }>("getSystemOverview", {});
      expect(out.drivers.length).toBeGreaterThan(0);
      for (const provider of Object.keys(CONFIGURED_PROVIDERS)) {
        expect(out.providers).toContainEqual(
          expect.objectContaining({ provider, configured: true }),
        );
      }
    },
  },
  {
    tool: "getSystemInstance",
    run: async (s) => {
      const out = await s.ok<{ appUrl: string; signupDisabled: boolean }>("getSystemInstance", {});
      expect(out).toMatchObject({
        appUrl: "http://localhost:3000",
        signupDisabled: true,
      });
    },
  },
  {
    tool: "getSystemLlm",
    run: async (s) => {
      const out = await s.ok<{
        driver: string;
        chatModel: string;
        decision: { driver: string };
      }>("getSystemLlm", {});
      expect(out.driver).toBe("openai-compatible");
      expect(out.chatModel).toBe(process.env.METIS_LLM_CHAT_MODEL);
      expect(out.decision.driver).toBe("systemone");
    },
  },
  {
    tool: "getSystemPhishing",
    run: async (s) => {
      expect(await s.ok("getSystemPhishing", {})).toMatchObject({
        driver: "disabled",
      });
    },
  },
  {
    tool: "getSystemMail",
    run: async (s) => {
      expect(await s.ok("getSystemMail", {})).toMatchObject({ driver: "log" });
    },
  },
  {
    tool: "getSystemCache",
    run: async (s) => {
      expect(await s.ok("getSystemCache", {})).toMatchObject({
        driver: "memory",
      });
    },
  },
  {
    tool: "getSystemRunner",
    run: async (s) => {
      expect(await s.ok("getSystemRunner", {})).toMatchObject({
        driver: "internal",
        cadenceSec: 2,
      });
    },
  },
  {
    tool: "getSystemDatabase",
    run: async (s) => {
      expect(await s.ok("getSystemDatabase", {})).toMatchObject({
        driver: "sqld",
      });
    },
  },
  {
    tool: "getSystemProvider",
    run: async (s) => {
      const tool = (await s.tools()).find((t) => t.name === "getSystemProvider");
      const providers = z
        .array(z.string())
        .parse(tool?.inputSchema.properties?.provider?.enum ?? []);
      expect(providers).toEqual(expect.arrayContaining(Object.keys(CONFIGURED_PROVIDERS)));
      for (const provider of providers) {
        const out = await s.ok<{
          provider: string;
          configured: boolean;
          entries: unknown[];
        }>("getSystemProvider", { provider });
        const entries = CONFIGURED_PROVIDERS[provider];
        expect(out.provider).toBe(provider);
        expect(out.configured, provider).toBe(entries !== undefined);
        if (entries !== undefined) expect(out.entries, provider).toHaveLength(entries);
      }
    },
  },
  {
    tool: "getPreflightWarnings",
    run: async (s) => {
      const out = await s.ok<{
        currentVersion: number;
        run: { warnings: { kind: string; message: string }[] } | null;
      }>("getPreflightWarnings", {});
      expect(out.currentVersion).toBeGreaterThan(0);
      expect(out.run).not.toBeNull();
      expect(
        out.run?.warnings.filter((w) => w.message.includes("Fernhill Inbound")),
        "the Cloudflare gateway passed preflight",
      ).toEqual([]);
    },
  },
  {
    tool: "listMailboxes",
    run: async (s, c) => {
      const out = await s.ok<{
        count: number;
        mailboxes: { mailboxId: string; email: string }[];
      }>("listMailboxes", ws(c));
      expect(out).toMatchObject({
        count: 1,
        mailboxes: [{ mailboxId: c.mailboxId, email: c.account.email }],
      });
    },
  },
  {
    tool: "aggregateInbox",
    run: async (s, c) => {
      const out = await s.ok<{
        mailboxes: number;
        count: number;
        emails: { mailboxId: string; error?: string }[];
      }>("aggregateInbox", ws(c));
      expect(out.mailboxes).toBe(1);
      expect(out.count).toBe(out.emails.length);
      expect(out.count).toBeGreaterThan(0);
      expect(out.emails.filter((e) => e.error)).toEqual([]);
    },
  },
  {
    tool: "searchMail",
    run: async (s, c) => {
      const out = await s.ok<{ count: number; emails: { id: string }[] }>("searchMail", {
        ...ws(c),
        query: "rebrand",
        mailboxId: c.mailboxId,
      });
      expect(out.count).toBe(out.emails.length);
      expect(out.emails.map((e) => e.id)).toContain(c.kickoff.id);
    },
  },
  {
    tool: "listEmails",
    run: async (s, c) => {
      const out = await s.ok<{
        mailbox: string;
        count: number;
        emails: Email[];
      }>("listEmails", { ...box(c), folder: "inbox", limit: 20 });
      expect(out.mailbox).toBe(c.account.email);
      expect(out.count).toBe(out.emails.length);
      expect(out.emails.map((e) => e.subject)).toContain("Rebrand kickoff");
    },
  },
  {
    tool: "getEmail",
    run: async (s, c) => {
      const out = await s.ok<{
        subject: string;
        hasContent: boolean;
        body: string;
      }>("getEmail", { ...box(c), id: c.kickoff.id });
      expect(out.subject).toBe("Rebrand kickoff");
      expect(out.hasContent).toBe(true);
      expect(out.body.length).toBeGreaterThan(0);
    },
  },
  {
    tool: "getThread",
    run: async (s, c) => {
      const out = await s.ok<{
        threadId: string;
        count: number;
        emails: Email[];
      }>("getThread", { ...box(c), threadId: c.kickoff.threadId });
      expect(out.threadId).toBe(c.kickoff.threadId);
      expect(out.emails.map((e) => e.id)).toContain(c.kickoff.id);
    },
  },
  {
    tool: "getRawEmail",
    run: async (s, c) => {
      const out = await s.ok<{ raw: string; truncated: boolean }>("getRawEmail", {
        ...box(c),
        id: c.kickoff.id,
      });
      expect(out.raw).toContain("Subject: Rebrand kickoff");
      expect(out.truncated).toBe(false);
    },
  },
  {
    tool: "listAttachments",
    run: async (s, c) => {
      const out = await s.ok<{
        count: number;
        attachments: { attachmentId: string; filename: string }[];
      }>("listAttachments", { ...box(c), id: c.inviteId });
      expect(out.count).toBe(out.attachments.length);
      expect(out.attachments.map((a) => a.attachmentId)).toContain(c.attachmentId);
    },
  },
  {
    tool: "getAttachmentText",
    run: async (s, c) => {
      const out = await s.ok<{ attachmentId: string; text: string }>("getAttachmentText", {
        ...box(c),
        id: c.inviteId,
        attachmentId: c.attachmentId,
      });
      expect(out.attachmentId).toBe(c.attachmentId);
      expect(out.text).toContain("Rebrand review");
      const unknown = await s.refused("getAttachmentText", {
        ...box(c),
        id: c.inviteId,
        attachmentId: "no-such-attachment",
      });
      expect(unknown).toContain('Unknown attachmentId "no-such-attachment"');
    },
  },
  {
    tool: "searchContacts",
    run: async (s, c) => {
      const out = await s.ok<{ count: number; contacts: { email: string }[] }>("searchContacts", {
        ...box(c),
        query: "raj",
      });
      expect(out.count).toBe(out.contacts.length);
      expect(out.contacts.map((m) => m.email)).toContain(PEOPLE.raj.email);
    },
  },
  {
    tool: "summarizeThread",
    run: async (s, c) => {
      const out = await s.ok<{ id: string; cards: unknown[] }>("summarizeThread", {
        ...box(c),
        id: c.kickoff.id,
        threadId: c.kickoff.threadId,
      });
      expect(out.id).toBe(c.kickoff.id);
      expect(Array.isArray(out.cards)).toBe(true);
    },
  },
  {
    tool: "listLabels",
    run: async (s, c) => {
      const out = await s.ok<{ labels: { key: string; builtIn: boolean }[] }>("listLabels", ws(c));
      expect(out.labels).toContainEqual({
        key: "custom:clients",
        builtIn: false,
      });
      expect(out.labels).toContainEqual({ key: "work", builtIn: true });
    },
  },
  {
    tool: "listWorkflows",
    run: async (s, c) => {
      const out = await s.ok<{
        workflows: { name: string }[];
        mailboxes: { mailboxId: string }[];
      }>("listWorkflows", ws(c));
      expect(out.workflows.map((w) => w.name)).toEqual(expect.arrayContaining(SEEDED_WORKFLOWS));
      expect(out.mailboxes.map((m) => m.mailboxId)).toContain(c.mailboxId);
    },
  },
  {
    tool: "listWorkflowSteps",
    run: async (s, c) => {
      const all = await s.ok<{
        steps: { step: string; params: Record<string, { kind: string }> }[];
      }>("listWorkflowSteps", ws(c));
      const keys = all.steps.map((step) => step.step);
      expect(keys).toEqual(
        expect.arrayContaining(["trigger.manual", "mail.list", "logic.if", "flow.approval"]),
      );
      expect(keys).not.toContain("trigger.once");
      expect(keys).not.toContain("system.workflowPrune");
      expect(all.steps.find((step) => step.step === "mail.label")?.params.label?.kind).toBe(
        "label",
      );
      const ai = await s.ok<{ steps: { step: string }[] }>("listWorkflowSteps", {
        ...ws(c),
        category: "ai",
      });
      expect(ai.steps.map((step) => step.step)).toContain("ai.agent");
      expect(ai.steps.every((step) => step.step.startsWith("ai."))).toBe(true);
    },
  },
  {
    tool: "listWorkflowRuns",
    run: async (s, c) => {
      const out = await s.ok<{ runs: { id: string }[] }>("listWorkflowRuns", ws(c));
      expect(out.runs.map((r) => r.id)).toContain(c.runId);
    },
  },
  {
    tool: "getWorkflowRun",
    run: async (s, c) => {
      const out = await s.ok<{ run: { id: string; nodes: unknown[] } }>("getWorkflowRun", {
        ...ws(c),
        runId: c.runId,
      });
      expect(out.run.id).toBe(c.runId);
      expect(out.run.nodes.length).toBeGreaterThan(0);
      expect(await s.refused("getWorkflowRun", { ...ws(c), runId: "no-such-run" })).toBe(
        'No workflow run "no-such-run" in this workspace',
      );
    },
  },
  {
    tool: "previewDecision",
    run: async (s, c) => {
      const out = await s.ok<{
        mailboxId: string;
        count: number;
        items: unknown[];
      }>("previewDecision", { ...box(c), node: c.ask, limit: 10 });
      expect(out.mailboxId).toBe(c.mailboxId);
      expect(out.count).toBe(out.items.length);
    },
  },
  {
    tool: "listCalendars",
    run: async (s, c) => {
      const out = await s.ok<{
        calendars: { name: string; calendarId: string }[];
      }>("listCalendars", ws(c));
      expect(out.calendars.map((cal) => cal.name).toSorted()).toEqual([
        "Bulk",
        "Edge cases",
        "Personal",
        "Work",
      ]);
      expect(out.calendars.map((cal) => cal.calendarId)).toContain(c.work.calendarId);
    },
  },
  {
    tool: "listEvents",
    run: async (s, c) => {
      const out = await s.ok<{ count: number; events: { title: string }[] }>("listEvents", {
        ...ws(c),
        ...RANGE,
      });
      expect(out.count).toBe(out.events.length);
      expect(out.events.map((e) => e.title)).toContain("Design review");
    },
  },
  {
    tool: "getEvent",
    run: async (s, c) => {
      const out = await s.ok<{ id: string; title: string }>("getEvent", {
        ...ws(c),
        ...c.event,
      });
      expect(out).toMatchObject({
        id: c.event.eventId,
        title: "Design review",
      });
    },
  },
  {
    tool: "listWorkspaceMembers",
    run: async (s, c) => {
      const out = await s.ok<{
        count: number;
        members: { memberId: string; email: string; role: string }[];
      }>("listWorkspaceMembers", ws(c));
      expect(out.count).toBe(out.members.length);
      expect(out.members).toContainEqual(
        expect.objectContaining({
          memberId: c.anaMemberId,
          email: c.account.email,
          role: "owner",
        }),
      );
    },
  },
  {
    tool: "findMemberMail",
    run: async (s, c) => {
      const out = await s.ok<{
        member: { email: string };
        count: number;
        emails: unknown[];
      }>("findMemberMail", { ...ws(c), memberId: c.anaMemberId });
      expect(out.member.email).toBe(c.account.email);
      expect(out.count).toBe(out.emails.length);
      expect(await s.refused("findMemberMail", { ...ws(c), memberId: "nobody" })).toContain(
        'Unknown memberId "nobody"',
      );
    },
  },
  {
    tool: "findMemberEvents",
    run: async (s, c) => {
      const out = await s.ok<{
        member: { email: string };
        window: { timeMin: string; timeMax: string };
        count: number;
        events: unknown[];
      }>("findMemberEvents", { ...ws(c), memberId: c.anaMemberId, ...RANGE });
      expect(out.member.email).toBe(c.account.email);
      expect(out.window).toEqual(RANGE);
      expect(out.count).toBe(out.events.length);
    },
  },
  {
    tool: "findMemberFiles",
    run: async (s, c) => {
      const out = await s.ok<{
        member: { email: string };
        drives: unknown[];
      }>("findMemberFiles", { ...ws(c), memberId: c.anaMemberId });
      expect(out.member.email).toBe(c.account.email);
      expect(out.drives).toHaveLength(Object.keys(c.account.driveSlugs).length);
      const found = await s.ok<{ entries: { name: string }[] }>("findMemberFiles", {
        ...ws(c),
        memberId: c.anaMemberId,
        query: "welcome",
      });
      expect(found.entries.map((e) => e.name)).toContain("welcome.txt");
    },
  },
  {
    tool: "listDrives",
    run: async (s, c) => {
      const out = await s.ok<{ count: number; drives: { driveId: string }[] }>("listDrives", ws(c));
      expect(out.count).toBe(Object.keys(c.account.driveSlugs).length);
      expect(out.drives.map((d) => d.driveId)).toContain(c.driveId);
    },
  },
  {
    tool: "listFolder",
    run: async (s, c) => {
      const out = await s.ok<{
        atRoot: boolean;
        count: number;
        entries: { name: string; kind: string }[];
      }>("listFolder", drive(c));
      expect(out.atRoot).toBe(true);
      expect(out.count).toBe(out.entries.length);
      expect(out.entries).toContainEqual(
        expect.objectContaining({ name: "welcome.txt", kind: "file" }),
      );
      expect(out.entries).toContainEqual(
        expect.objectContaining({ name: "Clients", kind: "folder" }),
      );
    },
  },
  {
    tool: "searchFiles",
    run: async (s, c) => {
      const out = await s.ok<{ count: number; entries: { name: string }[] }>("searchFiles", {
        ...ws(c),
        query: "welcome",
        driveId: c.driveId,
      });
      expect(out.count).toBe(out.entries.length);
      expect(out.entries.map((e) => e.name)).toContain("welcome.txt");
    },
  },
  {
    tool: "getFile",
    run: async (s, c) => {
      expect(await s.ok("getFile", { ...drive(c), fileId: "welcome.txt" })).toMatchObject({
        fileId: "welcome.txt",
        name: "welcome.txt",
        kind: "file",
      });
      expect(await s.refused("getFile", { ...drive(c), fileId: "no-such-file.txt" })).toBe(
        "We couldn't find that.",
      );
    },
  },
  {
    tool: "getFileText",
    run: async (s, c) => {
      const out = await s.ok<{
        name: string;
        text: string;
        truncated: boolean;
      }>("getFileText", { ...drive(c), fileId: "welcome.txt" });
      expect(out.name).toBe("welcome.txt");
      expect(out.text.length).toBeGreaterThan(0);
      expect(out.truncated).toBe(false);
      expect(await s.refused("getFileText", { ...drive(c), fileId: REBRAND_FOLDER })).toBe(
        "That is a folder, not a file",
      );
    },
  },
  {
    tool: "getDriveQuota",
    run: async (s, c) => {
      const out = await s.ok<{ quotas: { driveId: string }[] }>("getDriveQuota", drive(c));
      expect(out.quotas.map((q) => q.driveId)).toEqual([c.driveId]);
    },
  },
  {
    tool: "listPins",
    run: async (s, c) => {
      const out = await s.ok<{
        count: number;
        pins: { label: string; folderId: string }[];
      }>("listPins", ws(c));
      expect(
        out.pins.filter((p) => p.label === "Rebrand" && p.folderId === REBRAND_FOLDER),
      ).toHaveLength(2);
    },
  },
  {
    tool: "listSnoozed",
    run: async (s, c) => {
      const out = await s.ok<{
        mailbox: string;
        count: number;
        emails: unknown[];
      }>("listSnoozed", box(c));
      expect(out.mailbox).toBe(c.account.email);
      expect(out.count).toBe(out.emails.length);
    },
  },
  {
    tool: "listScheduled",
    run: async (s, c) => {
      const out = await s.ok<{
        count: number;
        scheduled: { status: string }[];
      }>("listScheduled", box(c));
      expect(out.count).toBe(out.scheduled.length);
      expect(out.scheduled.map((item) => item.status)).toContain("pending");
    },
  },
  {
    tool: "listMuted",
    run: async (s, c) => {
      const out = await s.ok<{ count: number; threadIds: string[] }>("listMuted", box(c));
      expect(out.threadIds).toContain(anchorMessageId(SUBJECTS.otp));
    },
  },
  {
    tool: "listReadLater",
    run: async (s, c) => {
      const out = await s.ok<{ count: number; ids: string[] }>("listReadLater", box(c));
      expect(out.count).toBe(out.ids.length);
      expect(out.count).toBeGreaterThan(0);
    },
  },
  {
    tool: "listSubscriptions",
    run: async (s, c) => {
      const out = await s.ok<{
        scanned: number;
        count: number;
        senders: { senderEmail: string; methods: string[] }[];
      }>("listSubscriptions", box(c));
      expect(out.scanned).toBeGreaterThan(0);
      expect(out.count).toBe(out.senders.length);
      expect(out.senders).toContainEqual(
        expect.objectContaining({
          senderEmail: SENDERS.kestrel.email,
          methods: ["one_click", "mailto", "link"],
        }),
      );
    },
  },
  {
    tool: "listInvites",
    run: async (s, c) => {
      const out = await s.ok<{ count: number; invites: unknown[] }>("listInvites", ws(c));
      expect(out.count).toBe(out.invites.length);
    },
  },
];

const MAIL: Case[] = [
  {
    tool: "starEmail",
    run: async (s, c) => {
      const target = await must(s, c, "inbox", BANK);
      await s.ok("starEmail", { ...box(c), id: target.id, starred: true });
      expect((await must(s, c, "inbox", BANK)).isStarred).toBe(true);
      await s.ok("starEmail", { ...box(c), id: target.id, starred: false });
      expect((await must(s, c, "inbox", BANK)).isStarred).toBe(false);
    },
  },
  {
    tool: "markRead",
    run: async (s, c) => {
      const target = await must(s, c, "inbox", BANK);
      await s.ok("markRead", { ...box(c), ids: [target.id], read: false });
      expect((await must(s, c, "inbox", BANK)).isRead).toBe(false);
      await s.ok("markRead", { ...box(c), ids: [target.id], read: true });
      expect((await must(s, c, "inbox", BANK)).isRead).toBe(true);
    },
  },
  {
    tool: "archiveEmail",
    run: async (s, c) => {
      try {
        const target = await must(s, c, "inbox", BANK);
        expect(await s.ok("archiveEmail", { ...box(c), id: target.id })).toMatchObject({
          success: true,
        });
        await must(s, c, "archive", BANK);
        expect(await find(s, c, "inbox", BANK)).toBeUndefined();
      } finally {
        await backToInbox(s, c, BANK);
      }
    },
  },
  {
    tool: "restoreEmail",
    run: async (s, c) => {
      try {
        const target = await must(s, c, "inbox", BANK);
        await s.ok("archiveEmail", { ...box(c), id: target.id });
        const archived = await must(s, c, "archive", BANK);
        expect(await s.ok("restoreEmail", { ...box(c), id: archived.id })).toMatchObject({
          success: true,
        });
        await must(s, c, "inbox", BANK);
        expect(await find(s, c, "archive", BANK)).toBeUndefined();
      } finally {
        await backToInbox(s, c, BANK);
      }
    },
  },
  {
    tool: "deleteEmails",
    run: async (s, c) => {
      try {
        const target = await must(s, c, "inbox", BANK);
        expect(await s.ok("deleteEmails", { ...box(c), ids: [target.id] })).toMatchObject({
          deleted: 1,
        });
        await must(s, c, "trash", BANK);
        expect(await find(s, c, "inbox", BANK)).toBeUndefined();
      } finally {
        await backToInbox(s, c, BANK);
      }
    },
  },
  {
    tool: "sendEmail",
    run: async (s, c) => {
      const subject = `${uniqueName()} sent`;
      expect(
        await s.ok("sendEmail", {
          ...box(c),
          to: [`sent@${OUTSIDE_DOMAIN}`],
          subject,
          bodyHtml: "<p>sent by the e2e suite</p>",
        }),
      ).toMatchObject({ sent: true, subject });
      const sent = await must(s, c, "sent", subject);
      await s.ok("deleteEmails", { ...box(c), ids: [sent.id] });
      const binned = await must(s, c, "trash", subject);
      await s.ok("deleteEmails", { ...box(c), ids: [binned.id] });
    },
  },
  {
    tool: "createDraft",
    run: async (s, c) => {
      await withDraft(s, c, async (draftId, subject) => {
        expect(draftId).toBeTruthy();
        await must(s, c, "drafts", subject);
      });
    },
  },
  {
    tool: "updateDraft",
    run: async (s, c) => {
      await withDraft(s, c, async (draftId, subject) => {
        const edited = `${subject} edited`;
        const out = await s.ok<{ draftId: string }>("updateDraft", {
          ...box(c),
          draftId,
          to: [`draft@${OUTSIDE_DOMAIN}`],
          subject: edited,
          bodyHtml: "<p>edited</p>",
        });
        expect(out.draftId).toBeTruthy();
        const updated = await must(s, c, "drafts", edited);
        expect(await find(s, c, "drafts", subject)).toBeUndefined();
        await s.ok("deleteDraft", { ...box(c), draftId: updated.id });
      });
    },
  },
  {
    tool: "deleteDraft",
    run: async (s, c) => {
      await withDraft(s, c, async (draftId, subject) => {
        expect(await s.ok("deleteDraft", { ...box(c), draftId })).toMatchObject({ deleted: true });
        expect(await find(s, c, "drafts", subject)).toBeUndefined();
      });
    },
  },
  {
    tool: "scheduleEmail",
    run: async (s, c) => {
      await withSchedule(s, c, async (scheduleId, subject) => {
        const [mine] = await scheduledNamed(s, c, subject);
        expect(mine).toMatchObject({ scheduleId, status: "pending" });
      });
    },
  },
  {
    tool: "cancelScheduled",
    run: async (s, c) => {
      await withSchedule(s, c, async (scheduleId, subject) => {
        expect(await s.ok("cancelScheduled", { ...box(c), scheduleId })).toMatchObject({
          cancelled: true,
          scheduleId,
        });
        expect(await scheduledNamed(s, c, subject)).toEqual([]);
        expect(await s.refused("cancelScheduled", { ...box(c), scheduleId })).toBe(
          "That item is already gone",
        );
      });
    },
  },
  {
    tool: "retryScheduled",
    run: async (s, c) => {
      await withSchedule(s, c, async (scheduleId) => {
        expect(await s.refused("retryScheduled", { ...box(c), scheduleId })).toBe(
          "That scheduled message is gone",
        );
      });
    },
  },
];

const INBOX: Case[] = [
  {
    tool: "snoozeEmail",
    run: async (s, c) => {
      try {
        const target = await snooze(s, c);
        expect(await find(s, c, "inbox", SHOP)).toBeUndefined();
        await must(s, c, "archive", SHOP);
        const snoozed = await snoozedNamed(s, c, SHOP);
        expect(snoozed?.id).toBe(target.id);
      } finally {
        await clearSnooze(s, c);
      }
    },
  },
  {
    tool: "unsnoozeEmail",
    run: async (s, c) => {
      try {
        const target = await snooze(s, c);
        expect(await s.ok("unsnoozeEmail", { ...box(c), id: target.id })).toMatchObject({
          unsnoozed: true,
        });
        await must(s, c, "inbox", SHOP);
        expect(await snoozedNamed(s, c, SHOP)).toBeUndefined();
      } finally {
        await clearSnooze(s, c);
      }
    },
  },
  {
    tool: "cancelSnooze",
    run: async (s, c) => {
      try {
        const target = await snooze(s, c);
        expect(await s.ok("cancelSnooze", { ...box(c), id: target.id })).toMatchObject({
          cancelled: true,
        });
        expect(await snoozedNamed(s, c, SHOP)).toBeUndefined();
        await must(s, c, "archive", SHOP);
      } finally {
        await clearSnooze(s, c);
      }
    },
  },
  {
    tool: "muteThread",
    run: async (s, c) => {
      const target = await must(s, c, "inbox", SHOP);
      const threadId = target.threadId ?? "";
      const muted = async () =>
        (await s.ok<{ threadIds: string[] }>("listMuted", box(c))).threadIds;
      expect(await muted()).not.toContain(threadId);
      try {
        expect(await s.ok("muteThread", { ...box(c), threadId })).toMatchObject({
          muted: true,
          threadId,
        });
        expect(await muted()).toContain(threadId);
      } finally {
        await s.ok("unmuteThread", { ...box(c), threadId });
      }
    },
  },
  {
    tool: "unmuteThread",
    run: async (s, c) => {
      const target = await must(s, c, "inbox", SHOP);
      const threadId = target.threadId ?? "";
      await s.ok("muteThread", { ...box(c), threadId });
      expect(await s.ok("unmuteThread", { ...box(c), threadId })).toMatchObject({
        muted: false,
        threadId,
      });
      expect((await s.ok<{ threadIds: string[] }>("listMuted", box(c))).threadIds).not.toContain(
        threadId,
      );
    },
  },
  {
    tool: "addReadLater",
    run: async (s, c) => {
      const target = await must(s, c, "inbox", SHOP);
      const ids = async () => (await s.ok<{ ids: string[] }>("listReadLater", box(c))).ids;
      expect(await ids()).not.toContain(target.id);
      try {
        expect(await s.ok("addReadLater", { ...box(c), id: target.id })).toMatchObject({
          readLater: true,
          id: target.id,
        });
        expect((await ids())[0]).toBe(target.id);
      } finally {
        await s.ok("removeReadLater", { ...box(c), id: target.id });
      }
    },
  },
  {
    tool: "removeReadLater",
    run: async (s, c) => {
      const target = await must(s, c, "inbox", SHOP);
      await s.ok("addReadLater", { ...box(c), id: target.id });
      expect(await s.ok("removeReadLater", { ...box(c), id: target.id })).toMatchObject({
        readLater: false,
        id: target.id,
      });
      expect((await s.ok<{ ids: string[] }>("listReadLater", box(c))).ids).not.toContain(target.id);
    },
  },
];

const ALONE: Case[] = [
  {
    tool: "unsubscribe",
    run: async (s, c) => {
      const sender = `${uniqueName()}@list.${OUTSIDE_DOMAIN}`;
      const link = `https://list.${OUTSIDE_DOMAIN}/unsubscribe?u=${encodeURIComponent(sender)}`;
      const fixture = await appendFixture(env.imap, {
        from: `Weekly List <${sender}>`,
        subject: "This week on the list",
        headers: [["List-Unsubscribe", `<${link}>`]],
      });
      try {
        const found = await until(
          async () =>
            (
              await s.ok<{
                senders: {
                  senderEmail: string;
                  messageId: string;
                  methods: string[];
                }[];
              }>("listSubscriptions", box(c))
            ).senders.find((x) => x.senderEmail === sender),
          (x) => x !== undefined,
          { timeout: 30_000, interval: 31_000, what: "the list sender" },
        );
        expect(found?.methods).toEqual(["link"]);
        const out = await s.ok<{
          results: {
            senderEmail: string;
            status: string;
            method?: string;
            url?: string;
          }[];
        }>("unsubscribe", {
          ...box(c),
          items: [{ senderEmail: sender, messageId: found?.messageId }],
        });
        expect(out.results).toEqual([
          { senderEmail: sender, status: "manual", method: "link", url: link },
        ]);
      } finally {
        await deleteFixture(env.imap, fixture);
      }
    },
  },
];

const LABELS: Case[] = [
  {
    tool: "createLabel",
    run: async (s, c) => {
      const name = uniqueName();
      const out = await s.ok<{ key: string; color: string }>("createLabel", {
        ...box(c),
        name,
        color: "teal",
      });
      try {
        expect(out).toMatchObject({
          created: true,
          key: `custom:${name}`,
          color: "teal",
        });
        const keys = (await s.ok<{ labels: { key: string }[] }>("listLabels", ws(c))).labels.map(
          (l) => l.key,
        );
        expect(keys).toContain(out.key);
        expect(await s.refused("createLabel", { ...box(c), name })).toBe("Label already exists");
      } finally {
        await s.call("deleteLabel", { ...box(c), label: out.key });
      }
    },
  },
  {
    tool: "deleteLabel",
    run: async (s, c) => {
      const { key } = await s.ok<{ key: string }>("createLabel", {
        ...box(c),
        name: uniqueName(),
      });
      expect(await s.ok("deleteLabel", { ...box(c), label: key })).toMatchObject({
        deleted: true,
        key,
      });
      const keys = (await s.ok<{ labels: { key: string }[] }>("listLabels", ws(c))).labels.map(
        (l) => l.key,
      );
      expect(keys).not.toContain(key);
      expect(await s.refused("deleteLabel", { ...box(c), label: "work" })).toContain(
        "built-in labels cannot be deleted",
      );
    },
  },
  {
    tool: "setLabel",
    run: async (s, c) => {
      const target = await must(s, c, "inbox", CODEYARD);
      try {
        expect(
          await s.ok("setLabel", {
            ...box(c),
            id: target.id,
            label: "personal",
          }),
        ).toMatchObject({ success: true, id: target.id, label: "personal" });
        expect(
          await s.refused("setLabel", {
            ...box(c),
            id: target.id,
            label: "no-such-label",
          }),
        ).toContain('Unknown label key "no-such-label"');
      } finally {
        await s.ok("clearLabel", { ...box(c), id: target.id });
      }
    },
  },
  {
    tool: "setLabels",
    run: async (s, c) => {
      const target = await must(s, c, "inbox", CODEYARD);
      try {
        const out = await s.ok<{
          count: number;
          previous: Record<string, unknown>;
        }>("setLabels", { ...box(c), ids: [target.id], label: "social" });
        expect(out.count).toBe(1);
        expect(Object.keys(out.previous)).toEqual([target.id]);
      } finally {
        await s.ok("clearLabel", { ...box(c), id: target.id });
      }
    },
  },
  {
    tool: "clearLabel",
    run: async (s, c) => {
      const target = await must(s, c, "inbox", CODEYARD);
      await s.ok("setLabel", { ...box(c), id: target.id, label: "updates" });
      expect(await s.ok("clearLabel", { ...box(c), id: target.id })).toMatchObject({
        success: true,
        id: target.id,
      });
      const again = await s.ok<{ previous: Record<string, string | null> }>("setLabels", {
        ...box(c),
        ids: [target.id],
        label: "updates",
      });
      expect(again.previous[target.id] ?? null).not.toBe("updates");
      await s.ok("clearLabel", { ...box(c), id: target.id });
    },
  },
];

const DRIVE: Case[] = [
  {
    tool: "createFolder",
    run: async (s, c) => {
      await withFolder(s, c, async (fileId, name) => {
        expect(fileId).toBe(`${name}/`);
        expect(await folderEntries(s, c)).toContainEqual(
          expect.objectContaining({ name, kind: "folder" }),
        );
        expect(await s.refused("createFolder", { ...drive(c), name })).toBeTruthy();
      });
    },
  },
  {
    tool: "renameFile",
    run: async (s, c) => {
      await withFolder(s, c, async (fileId, name) => {
        const renamed = `${name}-renamed`;
        expect(await s.ok("renameFile", { ...drive(c), fileId, name: renamed })).toMatchObject({
          renamed: true,
          name: renamed,
        });
        const names = (await folderEntries(s, c)).map((e) => e.name);
        expect(names).toContain(renamed);
        expect(names).not.toContain(name);
      });
    },
  },
  {
    tool: "moveFile",
    run: async (s, c) => {
      await withFolder(s, c, async (fileId, name) => {
        expect(
          await s.ok("moveFile", {
            ...drive(c),
            fileId,
            parentFolderId: REBRAND_FOLDER,
          }),
        ).toMatchObject({ moved: true, parentFolderId: REBRAND_FOLDER });
        expect((await folderEntries(s, c, REBRAND_FOLDER)).map((e) => e.name)).toContain(name);
        expect((await folderEntries(s, c)).map((e) => e.name)).not.toContain(name);
      });
    },
  },
  {
    tool: "deleteFile",
    run: async (s, c) => {
      await withFolder(s, c, async (fileId, name) => {
        expect(await s.ok("deleteFile", { ...drive(c), fileId })).toMatchObject({
          deleted: true,
          name,
        });
        expect((await folderEntries(s, c)).map((e) => e.name)).not.toContain(name);
        expect(await s.refused("deleteFile", { ...drive(c), fileId })).toBe(
          "We couldn't find that.",
        );
      });
    },
  },
  {
    tool: "pinFolder",
    run: async (s, c) => {
      await withFolder(s, c, async (fileId, name) => {
        expect(
          await s.ok("pinFolder", {
            ...drive(c),
            folderId: fileId,
            label: name,
          }),
        ).toMatchObject({ pinned: true, folderId: fileId, label: name });
        const pins = (
          await s.ok<{ pins: { pinId: string; label: string }[] }>("listPins", ws(c))
        ).pins.filter((p) => p.label === name);
        expect(pins).toHaveLength(1);
        await s.ok("unpinFolder", { ...ws(c), pinId: pins[0]?.pinId });
        expect(
          await s.refused("pinFolder", {
            ...drive(c),
            folderId: "welcome.txt",
          }),
        ).toBe("That is a file, not a folder — only folders can be pinned");
      });
    },
  },
  {
    tool: "unpinFolder",
    run: async (s, c) => {
      await withFolder(s, c, async (fileId, name) => {
        await s.ok("pinFolder", { ...drive(c), folderId: fileId, label: name });
        const pinsNamed = async () =>
          (await s.ok<{ pins: { pinId: string; label: string }[] }>("listPins", ws(c))).pins.filter(
            (p) => p.label === name,
          );
        const [pin] = await pinsNamed();
        expect(await s.ok("unpinFolder", { ...ws(c), pinId: pin?.pinId })).toMatchObject({
          unpinned: true,
          pinId: pin?.pinId,
        });
        expect(await pinsNamed()).toEqual([]);
        expect(await s.refused("unpinFolder", { ...ws(c), pinId: pin?.pinId })).toBe(
          `Unknown pinId "${pin?.pinId}" — see listPins`,
        );
      });
    },
  },
];

const CALENDAR: Case[] = [
  {
    tool: "createEvent",
    run: async (s, c) => {
      await withEvent(s, c, async (eventId, title) => {
        expect(await s.ok("getEvent", { ...work(c), eventId })).toMatchObject({
          title,
          start: expect.stringContaining("2026-10-20"),
        });
      });
    },
  },
  {
    tool: "updateEvent",
    run: async (s, c) => {
      await withEvent(s, c, async (eventId, title) => {
        const edited = `${title} edited`;
        expect(await s.ok("updateEvent", { ...work(c), eventId, title: edited })).toMatchObject({
          updated: true,
          eventId,
        });
        expect(await s.ok("getEvent", { ...work(c), eventId })).toMatchObject({
          title: edited,
        });
      });
    },
  },
  {
    tool: "deleteEvent",
    run: async (s, c) => {
      await withEvent(s, c, async (eventId) => {
        expect(await s.ok("deleteEvent", { ...work(c), eventId })).toMatchObject({
          deleted: true,
          eventId,
        });
        expect(await s.refused("getEvent", { ...work(c), eventId })).toBe("We couldn't find that.");
      });
    },
  },
  {
    tool: "respondToEvent",
    run: async (s, c) => {
      await withEvent(s, c, async (eventId) => {
        expect(
          await s.ok("respondToEvent", {
            ...work(c),
            eventId,
            response: "tentative",
          }),
        ).toMatchObject({ responded: true, response: "tentative" });
        const event = await s.ok<{
          attendees?: { email: string; response?: string }[];
        }>("getEvent", { ...work(c), eventId });
        expect(event.attendees?.find((a) => a.email === c.account.email)?.response).toBe(
          "tentative",
        );
      });
    },
  },
];

const WORKFLOWS: Case[] = [
  {
    tool: "createWorkflow",
    run: async (s, c) => {
      await withWorkflow(s, c, async (workflowId, name) => {
        const listed = (
          await s.ok<{
            workflows: { id: string; name: string; enabled: boolean }[];
          }>("listWorkflows", ws(c))
        ).workflows.find((w) => w.id === workflowId);
        expect(listed).toMatchObject({ name, enabled: true });
        expect(
          await s.refused("createWorkflow", {
            ...ws(c),
            workflow: {
              name,
              enabled: true,
              graph: {
                version: 2,
                nodes: [
                  {
                    id: "once",
                    step: "trigger.once",
                    position: { x: 0, y: 0 },
                    params: { at: { kind: "literal", value: "2030-01-01T00:00:00.000Z" } },
                  },
                ],
                edges: [],
                settings: {},
              },
            },
          }),
        ).toContain("is only used by built-in workflows");
      });
    },
  },
  {
    tool: "updateWorkflow",
    run: async (s, c) => {
      await withWorkflow(s, c, async (workflowId, name) => {
        const out = await s.ok<{
          workflow: { name: string; revision: number };
        }>("updateWorkflow", {
          ...ws(c),
          workflowId,
          workflow: {
            name: `${name}-edited`,
            enabled: true,
            graph: GRAPH(c.mailboxId),
          },
        });
        expect(out.workflow).toMatchObject({
          name: `${name}-edited`,
          revision: 2,
        });
      });
    },
  },
  {
    tool: "toggleWorkflow",
    run: async (s, c) => {
      await withWorkflow(s, c, async (workflowId) => {
        expect(
          await s.ok("toggleWorkflow", {
            ...ws(c),
            workflowId,
            enabled: false,
          }),
        ).toMatchObject({ success: true, enabled: false });
        const listed = (
          await s.ok<{ workflows: { id: string; enabled: boolean }[] }>("listWorkflows", ws(c))
        ).workflows.find((w) => w.id === workflowId);
        expect(listed?.enabled).toBe(false);
      });
    },
  },
  {
    tool: "deleteWorkflow",
    run: async (s, c) => {
      await withWorkflow(s, c, async (workflowId) => {
        expect(await s.ok("deleteWorkflow", { ...ws(c), workflowId })).toMatchObject({
          success: true,
          workflowId,
        });
        const ids = (
          await s.ok<{ workflows: { id: string }[] }>("listWorkflows", ws(c))
        ).workflows.map((w) => w.id);
        expect(ids).not.toContain(workflowId);
        expect(await s.refused("deleteWorkflow", { ...ws(c), workflowId })).toBe(
          `No workflow "${workflowId}" in this workspace`,
        );
      });
    },
  },
  {
    tool: "applyWorkflows",
    run: async (s, c) => {
      await withWorkflow(s, c, async (workflowId) => {
        const out = await s.ok<{ queued: boolean; runId: string }>("applyWorkflows", {
          ...ws(c),
          workflowId,
        });
        expect(out.queued).toBe(true);
        expect((await settledRun(s, c, out.runId)).status).toBe("completed");
        const runs = (
          await s.ok<{ runs: { id: string }[] }>("listWorkflowRuns", {
            ...ws(c),
            workflowId,
          })
        ).runs.map((r) => r.id);
        expect(runs).toContain(out.runId);
      });
    },
  },
  {
    tool: "cancelWorkflowRun",
    run: async (s, c) => {
      await withWorkflow(s, c, async (workflowId) => {
        const { runId } = await s.ok<{ runId: string }>("applyWorkflows", {
          ...ws(c),
          workflowId,
        });
        const outcome = await s.ok<{ state: string; status?: string }>("cancelWorkflowRun", {
          ...ws(c),
          runId,
        });
        expect(["cancelled", "stopping", "finished"]).toContain(outcome.state);
        const run = await settledRun(s, c, runId);
        if (outcome.state === "finished") expect(run.status).toBe(outcome.status);
        else if (outcome.state === "stopping")
          expect(["cancelled", "completed"]).toContain(run.status);
        else expect(run.status).toBe("cancelled");
      });
    },
  },
  {
    tool: "resumeWorkflowRun",
    run: async (s, c) => {
      await withWorkflow(s, c, async (workflowId) => {
        const { runId } = await s.ok<{ runId: string }>("applyWorkflows", {
          ...ws(c),
          workflowId,
        });
        expect((await settledRun(s, c, runId)).status).toBe("completed");
        expect(await s.ok("resumeWorkflowRun", { ...ws(c), runId })).toMatchObject({
          state: "refused",
          status: "completed",
        });
      });
    },
  },
];

async function tempWorkspace(c: Context) {
  if (!c.temp) throw new Error("createWorkspace runs first in this group");
  return c.temp;
}

const ACCOUNT: Case[] = [
  {
    tool: "createWorkspace",
    run: async (s, c) => {
      const name = uniqueName();
      const out = await s.ok<{
        created: boolean;
        workspaceId: string;
        slug: string;
        name: string;
      }>("createWorkspace", { name });
      c.temp = { workspaceId: out.workspaceId, slug: out.slug };
      expect(out).toMatchObject({ created: true, name });
      const ids = (
        await s.ok<{ workspaces: { workspaceId: string }[] }>("listWorkspaces", {})
      ).workspaces.map((w) => w.workspaceId);
      expect(ids).toContain(out.workspaceId);
    },
  },
  {
    tool: "attachResource",
    run: async (s, c) => {
      const temp = await tempWorkspace(c);
      const attach = {
        workspaceId: temp.workspaceId,
        kind: "mailbox",
        resourceId: c.mailboxId,
      };
      expect(await s.ok("attachResource", attach)).toMatchObject({
        attached: true,
        aiEnabled: false,
      });
      expect(await s.refused("attachResource", attach)).toBe(
        "That mailbox is already in this workspace",
      );
    },
  },
  {
    tool: "revokeInvite",
    run: async (s, c) => {
      const temp = await tempWorkspace(c);
      const email = `${uniqueName()}@${OUTSIDE_DOMAIN}`;
      await c.rpc("workspaces.createInvite", {
        workspaceSlug: temp.slug,
        email,
      });
      const pending = async () =>
        (
          await s.ok<{ invites: { inviteId: string; email: string }[] }>("listInvites", {
            workspaceId: temp.workspaceId,
          })
        ).invites.filter((i) => i.email === email);
      const [invite] = await pending();
      expect(invite).toBeDefined();
      expect(
        await s.ok("revokeInvite", {
          workspaceId: temp.workspaceId,
          inviteId: invite?.inviteId,
        }),
      ).toMatchObject({ revoked: true });
      expect(await pending()).toEqual([]);
      const { events } = await c.rpc<AuditPage>("audit.workspace", {
        workspaceSlug: temp.slug,
      });
      expect(events).toContainEqual(
        expect.objectContaining({
          action: "workspace_invite.revoked",
          via: "mcp",
          targetLabel: email,
        }),
      );
    },
  },
  {
    tool: "removeMember",
    run: async (s, c) => {
      const temp = await tempWorkspace(c);
      const { member } = c.account;
      const { url } = await c.rpc<{ url: string }>("workspaces.createInvite", {
        workspaceSlug: temp.slug,
        email: member.email,
      });
      const cookie = await signIn(member.email, member.password, () => totpCode(member.totpURI));
      await rpcWithCookie(cookie)("invites.accept", {
        token: new URL(url).searchParams.get("token"),
      });
      const members = async () =>
        (
          await s.ok<{ members: { memberId: string; email: string }[] }>("listWorkspaceMembers", {
            workspaceId: temp.workspaceId,
          })
        ).members;
      const joined = (await members()).find((m) => m.email === member.email);
      expect(joined).toBeDefined();
      expect(
        await s.ok("removeMember", {
          workspaceId: temp.workspaceId,
          memberId: joined?.memberId,
        }),
      ).toMatchObject({ removed: true, email: member.email });
      expect((await members()).map((m) => m.email)).not.toContain(member.email);
      const { events } = await c.rpc<AuditPage>("audit.workspace", {
        workspaceSlug: temp.slug,
      });
      expect(events).toContainEqual(
        expect.objectContaining({
          action: "member.removed",
          via: "mcp",
          targetLabel: member.email,
        }),
      );
    },
  },
  {
    tool: "createSignupInvite",
    run: async (s) => {
      const email = `${uniqueName()}@${OUTSIDE_DOMAIN}`;
      const out = await s.ok<{
        invited: boolean;
        inviteId: string;
        email: string;
      }>("createSignupInvite", { email });
      try {
        expect(out).toMatchObject({ invited: true, email });
        const listed = (
          await s.ok<{ invites: { inviteId: string }[] }>("listSignupInvites", {})
        ).invites.map((i) => i.inviteId);
        expect(listed).toContain(out.inviteId);
        expect(await s.refused("createSignupInvite", { email })).toBe(
          "That email already has a pending invite",
        );
      } finally {
        await s.call("revokeSignupInvite", { inviteId: out.inviteId });
      }
    },
  },
  {
    tool: "revokeSignupInvite",
    run: async (s, c) => {
      const email = `${uniqueName()}@${OUTSIDE_DOMAIN}`;
      const { inviteId } = await s.ok<{ inviteId: string }>("createSignupInvite", { email });
      expect(await s.ok("revokeSignupInvite", { inviteId })).toMatchObject({
        revoked: true,
        inviteId,
      });
      const listed = (
        await s.ok<{ invites: { inviteId: string }[] }>("listSignupInvites", {})
      ).invites.map((i) => i.inviteId);
      expect(listed).not.toContain(inviteId);
      expect(await s.refused("revokeSignupInvite", { inviteId })).toBe("Invite not found");
      const { events } = await c.rpc<AuditPage>("audit.mine");
      for (const action of ["signup_invite.created", "signup_invite.revoked"]) {
        expect(events).toContainEqual(
          expect.objectContaining({ action, via: "mcp", targetLabel: email }),
        );
      }
    },
  },
  {
    tool: "setWorkspaceTheme",
    run: async (s, c) => {
      try {
        expect(await s.ok("setWorkspaceTheme", { ...ws(c), themeBrand: "violet" })).toMatchObject({
          updated: true,
          themeBrand: "violet",
        });
      } finally {
        await s.ok("setWorkspaceTheme", { ...ws(c), themeBrand: "blue" });
      }
    },
  },
  {
    tool: "runSystemCheck",
    run: async (s) => {
      const database = await s.ok<{ results: { status: string }[] }>("runSystemCheck", {
        driver: "database",
      });
      expect(database.results.length).toBeGreaterThan(0);
      for (const result of database.results) expect(result.status).toBe("ok");
      for (const provider of ["imap", "cloudflare"]) {
        const checked = await s.ok<{
          results: { status: string; message: string | null }[];
        }>("runSystemCheck", { provider });
        expect(checked.results.length, provider).toBeGreaterThan(0);
        for (const result of checked.results)
          expect(result.status, `${provider}: ${result.message}`).toBe("ok");
      }
      expect(await s.refused("runSystemCheck", {})).toBe("Pass exactly one of driver or provider.");
    },
  },
];

const CASES: Record<ToolGroup, Case[]> = {
  reads: READS,
  mail: MAIL,
  inbox: INBOX,
  labels: LABELS,
  drive: DRIVE,
  calendar: CALENDAR,
  workflows: WORKFLOWS,
  account: ACCOUNT,
};

const UNCOVERED = new Set(["analyzePhishing"]);

let seeded: Context | undefined;

function seededContext(): Context {
  if (!seeded) throw new Error("the beforeAll seeding did not finish");
  return seeded;
}

beforeAll(async () => {
  const { account, rpc } = await ana();
  const s = await session("reads");
  try {
    const { workspaces } = await s.ok<{
      workspaces: { workspaceId: string; slug: string }[];
    }>("listWorkspaces", {});
    const workspaceId = workspaces.find((w) => w.slug === account.workspaceSlug)?.workspaceId ?? "";
    const { mailboxes } = await s.ok<{ mailboxes: { mailboxId: string }[] }>("listMailboxes", {
      workspaceId,
    });
    const mailbox = { workspaceId, mailboxId: mailboxes[0]?.mailboxId ?? "" };
    const inbox = await emails(s, mailbox, "inbox");
    const kickoff = inbox.find((e) => e.subject === SUBJECTS.kickoff);
    const invite = inbox.find((e) => e.subject.startsWith("Invitation: Rebrand review"));
    if (!kickoff || !invite) throw new Error("the seeded inbox is missing mail");
    const { attachments } = await s.ok<{
      attachments: { attachmentId: string }[];
    }>("listAttachments", { ...box(mailbox), id: invite.id });
    const { drives } = await s.ok<{
      drives: { driveId: string; provider: string }[];
    }>("listDrives", { workspaceId });
    const { calendars } = await s.ok<{
      calendars: {
        calendarAccountId: string;
        calendarId: string;
        name: string;
      }[];
    }>("listCalendars", { workspaceId });
    const workCalendar = calendars.find((cal) => cal.name === "Work");
    const { events } = await s.ok<{
      events: {
        eventId: string;
        calendarAccountId: string;
        calendarId: string;
        title: string;
      }[];
    }>("listEvents", { workspaceId, ...RANGE });
    const design = events.find((e) => e.title === "Design review");
    const { members } = await s.ok<{
      members: { memberId: string; email: string }[];
    }>("listWorkspaceMembers", { workspaceId });
    const { runs } = await s.ok<{ runs: { id: string }[] }>("listWorkflowRuns", {
      workspaceId,
    });
    const { workflows } = await s.ok<{
      workflows: { name: string; graph: { nodes: { step: string }[] } }[];
    }>("listWorkflows", { workspaceId });
    if (!workCalendar || !design || !runs[0])
      throw new Error("the seeded calendar or workflow history is missing");
    seeded = {
      account,
      rpc,
      ...mailbox,
      temp: null,
      kickoff,
      inviteId: invite.id,
      attachmentId: attachments[0]?.attachmentId ?? "",
      driveId: drives.find((d) => d.provider === "webdav")?.driveId ?? "",
      work: {
        calendarAccountId: workCalendar.calendarAccountId,
        calendarId: workCalendar.calendarId,
      },
      event: {
        eventId: design.eventId,
        calendarAccountId: design.calendarAccountId,
        calendarId: design.calendarId,
      },
      anaMemberId: members.find((m) => m.email === account.email)?.memberId ?? "",
      runId: runs[0].id,
      ask: workflows
        .find((w) => w.name === "Triage with the decision model")
        ?.graph.nodes.find((n) => n.step === "ai.ask"),
    };
  } finally {
    await s.close();
  }
}, 300_000);

afterAll(async () => {
  if (!seeded?.temp) return;
  await seeded.rpc("workspaces.delete", {
    workspaceSlug: seeded.temp.slug,
    code: await harness.totp(),
  });
});

test("every listed tool has exactly one case", async () => {
  const s = await session("reads");
  const listed = (await s.tools()).map((t) => t.name).toSorted();
  await s.close();
  const cased = [...Object.values(CASES).flat(), ...ALONE].map((c) => c.tool);
  const duplicates = cased.filter((tool, i) => cased.indexOf(tool) !== i);
  expect(duplicates, "tools with more than one case").toEqual([]);
  expect(
    listed.filter((tool) => !cased.includes(tool) && !UNCOVERED.has(tool)),
    "listed tools without a case",
  ).toEqual([]);
  expect(
    cased.filter((tool) => !listed.includes(tool)),
    "cases for tools that are not listed",
  ).toEqual([]);
});

describe.concurrent("each tool", () => {
  test.each(TOOL_GROUPS)(
    "%s",
    async (group) => {
      const s = await session(group);
      const failures: string[] = [];
      try {
        for (const item of CASES[group]) {
          try {
            await item.run(s, seededContext());
          } catch (err) {
            failures.push(`${item.tool}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } finally {
        await s.close();
      }
      expect(failures, `${group} cases that failed`).toEqual([]);
    },
    15 * 60_000,
  );
});

describe("tools that add mail other cases read", () => {
  test.each(ALONE)("$tool", async (item) => {
    const s = await session("inbox");
    try {
      await expect(item.run(s, seededContext())).resolves.toBeUndefined();
    } finally {
      await s.close();
    }
  });
});
