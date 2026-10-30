import { expect, test } from "vitest";

import type { Account } from "../../clients/harness";
import { type Rpc, RpcError } from "../../clients/rpc";
import { uniqueName } from "../support/poll";
import { ana } from "../support/session";

interface Diagnostic {
  start: number;
  end: number;
  message: string;
}

interface MailHit {
  id: string;
  subject: string;
  from: string;
  mailboxSlug?: string;
}

interface EventHit {
  title: string;
  location?: string;
}

interface FileHit {
  name: string;
  kind: string;
  driveSlug: string;
}

interface LocalHit {
  kind: string;
  title: string;
  [key: string]: unknown;
}

const TIME_ZONE = "UTC";

function input(account: Account, q: string) {
  return { workspaceSlug: account.workspaceSlug, q, timeZone: TIME_ZONE };
}

async function mail(rpc: Rpc, account: Account, q: string) {
  return rpc<{ emails: MailHit[]; diagnostics: Diagnostic[] }>("search.mail", input(account, q));
}

async function local(rpc: Rpc, account: Account, q: string) {
  return rpc<{ hits: LocalHit[]; errors: string[]; diagnostics: Diagnostic[] }>(
    "search.local",
    input(account, q),
  );
}

test("a retired or unknown key comes back as a diagnostic with no results", async () => {
  const { rpc, account } = await ana();
  const retired = await mail(rpc, account, "in:inbox");
  expect(retired.emails).toEqual([]);
  expect(retired.diagnostics[0]?.message).toContain("mail-folder:");

  const unknown = await local(rpc, account, "colour:blue");
  expect(unknown.hits).toEqual([]);
  expect(unknown.diagnostics[0]?.message).toContain("colour:");

  const unfinished = await mail(rpc, account, '(from:raj OR "rebrand');
  expect(unfinished.emails).toEqual([]);
  expect(unfinished.diagnostics.length).toBeGreaterThan(0);
});

test("mail search combines provider fields, negation and OR", async () => {
  const { rpc, account } = await ana();
  const both = await mail(rpc, account, "from:raj@demo.trymetis.email subject:Rebrand");
  const subjects = both.emails.map((e) => e.subject);
  expect(subjects).toContain("Rebrand kickoff");
  expect(subjects.some((s) => s.startsWith("Invitation: Rebrand review"))).toBe(true);
  for (const hit of both.emails) expect(hit.from).toBe("raj@demo.trymetis.email");

  const without = await mail(rpc, account, "from:raj@demo.trymetis.email -subject:kickoff");
  expect(without.emails.map((e) => e.subject)).not.toContain("Rebrand kickoff");

  const either = await mail(
    rpc,
    account,
    "(from:orders@brightloom.com OR from:alerts@konkanbank.in) mail-folder:inbox",
  );
  const found = either.emails.map((e) => e.subject);
  expect(found).toContain("Your order A-42 has shipped");
  expect(found).toContain("INR 1,250.00 debited from a/c **4821");
  expect(found).not.toContain("Rebrand kickoff");
});

test("a mailbox: filter outside the workspace finds nothing", async () => {
  const { rpc, account } = await ana();
  const res = await mail(rpc, account, "mailbox:no-such-mailbox rebrand");
  expect(res.diagnostics).toEqual([]);
  expect(res.emails).toEqual([]);
  const scoped = await mail(rpc, account, `mailbox:${account.mailboxSlug} rebrand`);
  for (const hit of scoped.emails) {
    expect(hit.mailboxSlug).toBe(account.mailboxSlug);
  }
});

test("event search finds the seeded events by location and by word", async () => {
  const { rpc, account } = await ana();
  const byLocation = await rpc<{ events: EventHit[] }>(
    "search.events",
    input(account, 'location:"Studio 2" after:2026-10-01 before:2026-10-15'),
  );
  expect(byLocation.events.map((e) => e.title)).toContain("Design review");

  const byWord = await rpc<{ events: EventHit[] }>(
    "search.events",
    input(account, "type:event standup"),
  );
  expect(byWord.events.map((e) => e.title)).toContain("Daily standup");
  expect(byWord.events.map((e) => e.title)).not.toContain("Design review");
});

const DRIVES = ["s3", "s3Relay", "webdav", "ftps", "ftp", "ftpsImplicit", "sftp"] as const;

test.each(DRIVES)(
  "file search on the %s drive narrows by drive, extension and kind",
  async (kind) => {
    const { rpc, account } = await ana();
    const slug = account.driveSlugs[kind];
    expect(slug).toBeDefined();

    const named = await rpc<{ entries: FileHit[] }>(
      "search.files",
      input(account, `drive:${slug} welcome ext:txt`),
    );
    for (const hit of named.entries) expect(hit.driveSlug).toBe(slug);
    const names = named.entries.map((e) => e.name);
    expect(names.includes("welcome.txt"), names.join(", ")).toBe(kind !== "ftp");

    const folders = await rpc<{ entries: FileHit[] }>(
      "search.files",
      input(account, `drive:${slug} Clients kind:folder`),
    );
    expect(folders.entries.map((e) => e.name)).toContain("Clients");
    for (const hit of folders.entries) {
      expect(hit.kind).toBe("folder");
      expect(hit.driveSlug).toBe(slug);
    }
  },
);

test("a filter no file takes searches no file", async () => {
  const { rpc, account } = await ana();
  const res = await rpc<{ entries: FileHit[] }>(
    "search.files",
    input(account, "from:raj@demo.trymetis.email welcome"),
  );
  expect(res.entries).toEqual([]);
});

test("local search returns members, labels, mail folders and the workspace's resources", async () => {
  const { rpc, account } = await ana();
  const members = await local(rpc, account, `type:member ${account.email}`);
  const me = members.hits.find((h) => h.kind === "member");
  expect(me?.email).toBe(account.email);
  expect(me?.role).toBe("owner");

  const labels = await local(rpc, account, "type:label Clients");
  expect(labels.hits.map((h) => h.title)).toContain("Clients");

  const folders = await local(rpc, account, `type:mail-folder mailbox:${account.mailboxSlug} spam`);
  expect(folders.hits.map((h) => h.title)).toEqual(["Spam"]);

  const drives = await local(rpc, account, "type:drive provider:sftp");
  expect(drives.hits.length).toBeGreaterThan(0);
  for (const hit of drives.hits) expect(hit.provider).toBe("sftp");

  const connections = await local(rpc, account, "type:connection");
  expect(connections.hits.length).toBeGreaterThan(0);
});

test("is: values match exactly, so is:read never matches unread", async () => {
  const { rpc, account } = await ana();
  const off = await local(rpc, account, "type:workflow is:disabled");
  const on = await local(rpc, account, "type:workflow is:enabled");
  for (const hit of off.hits) expect(hit.enabled).toBe(false);
  for (const hit of on.hits) expect(hit.enabled).toBe(true);
  const titles = new Set(on.hits.map((h) => h.title));
  for (const hit of off.hits) expect(titles.has(hit.title)).toBe(false);
});

test("suggest lists the workspace's mailboxes and labels", async () => {
  const { rpc, account } = await ana();
  const mailboxes = await rpc<{ values: { value: string }[] }>("search.suggest", {
    workspaceSlug: account.workspaceSlug,
    key: "mailbox",
    prefix: "",
  });
  expect(mailboxes.values.map((v) => v.value)).toContain(account.mailboxSlug);

  const labels = await rpc<{ values: { value: string; label: string }[] }>("search.suggest", {
    workspaceSlug: account.workspaceSlug,
    key: "label",
    prefix: "cli",
  });
  expect(labels.values.map((v) => v.label)).toContain("Clients");
});

test("saved searches round-trip and a deleted one is gone", async () => {
  const { rpc, account } = await ana();
  const scope = { workspaceSlug: account.workspaceSlug };
  const name = uniqueName();
  const { search } = await rpc<{ search: { id: string; query: string } }>("search.saved.create", {
    ...scope,
    name,
    query: "from:raj@demo.trymetis.email has:attachment",
  });
  try {
    const { searches } = await rpc<{
      searches: { id: string; name: string; query: string }[];
    }>("search.saved.list", scope);
    expect(searches.find((s) => s.id === search.id)).toMatchObject({
      name,
      query: "from:raj@demo.trymetis.email has:attachment",
    });
  } finally {
    await rpc("search.saved.delete", { ...scope, id: search.id });
  }
  const after = await rpc<{ searches: { id: string }[] }>("search.saved.list", scope);
  expect(after.searches.map((s) => s.id)).not.toContain(search.id);
  await expect(rpc("search.saved.delete", { ...scope, id: search.id })).rejects.toBeInstanceOf(
    RpcError,
  );
});
