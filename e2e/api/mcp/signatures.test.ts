import { afterAll, beforeAll, expect, test } from "vitest";

import type { Rpc } from "../../clients/rpc";
import { type McpSession, session } from "../support/mcp";
import { uniqueName, until } from "../support/poll";
import { ana } from "../support/session";

const OUTSIDE_DOMAIN = "discard.demo.trymetis.email";
const SIGNATURE = "Signed by the e2e suite";
const FOOTER = "Footer from the e2e suite";

interface Target {
  workspaceId: string;
  mailboxId: string;
}

interface Box {
  workspaceSlug: string;
  mailboxSlug: string;
}

let rpc: Rpc;
let target: Target;
let mailbox: Box;
let signatureId = "";
let footerBefore: { html: string; enabled: boolean } = { html: "", enabled: false };

async function find(s: McpSession, folder: string, subject: string): Promise<string> {
  const listed = await until(
    async () =>
      (
        await s.ok<{ emails: { id: string; subject: string }[] }>("listEmails", {
          ...target,
          folder,
          limit: 50,
        })
      ).emails.find((e) => e.subject === subject),
    (e) => e !== undefined,
    { timeout: 30_000, what: `"${subject}" in ${folder}` },
  );
  if (!listed) throw new Error(`"${subject}" is not in ${folder}`);
  return listed.id;
}

async function body(s: McpSession, id: string): Promise<string> {
  return (await s.ok<{ body: string }>("getEmail", { ...target, id })).body;
}

async function discardSent(s: McpSession, subject: string): Promise<void> {
  const sent = await find(s, "sent", subject);
  await s.ok("deleteEmails", { ...target, ids: [sent] });
  const binned = await find(s, "trash", subject);
  await s.ok("deleteEmails", { ...target, ids: [binned] });
}

beforeAll(async () => {
  const session0 = await ana();
  rpc = session0.rpc;
  const { account } = session0;
  const s = await session("reads");
  try {
    const { workspaces } = await s.ok<{ workspaces: { workspaceId: string; slug: string }[] }>(
      "listWorkspaces",
      {},
    );
    const workspaceId = workspaces.find((w) => w.slug === account.workspaceSlug)?.workspaceId ?? "";
    const { mailboxes } = await s.ok<{ mailboxes: { mailboxId: string }[] }>("listMailboxes", {
      workspaceId,
    });
    target = { workspaceId, mailboxId: mailboxes[0]?.mailboxId ?? "" };
  } finally {
    await s.close();
  }
  const linked = await rpc<{ mailboxes: { mailboxId: string; slug: string }[] }>(
    "workspaceMailboxes.list",
    { workspaceSlug: account.workspaceSlug },
  );
  const slug = linked.mailboxes.find((m) => m.mailboxId === target.mailboxId)?.slug;
  if (!slug) throw new Error("the MCP mailbox is not in the seeded workspace");
  mailbox = { workspaceSlug: account.workspaceSlug, mailboxSlug: slug };

  const saved = await rpc<{ signature: { id: string } }>("mail.signatures.save", {
    ...mailbox,
    scope: "personal",
    signature: {
      name: uniqueName(),
      html: `<p>${SIGNATURE}</p>`,
      defaultNew: true,
      defaultReply: false,
    },
  });
  signatureId = saved.signature.id;

  const before = await rpc<{ footer: { html: string; enabled: boolean } }>(
    "workspaceSignatures.list",
    { workspaceSlug: account.workspaceSlug },
  );
  footerBefore = before.footer;
  await rpc("workspaceSignatures.setFooter", {
    workspaceSlug: account.workspaceSlug,
    html: `<p>${FOOTER}</p>`,
    enabled: true,
  });
});

afterAll(async () => {
  if (signatureId) {
    await rpc("mail.signatures.delete", { ...mailbox, scope: "personal", id: signatureId });
  }
  await rpc("workspaceSignatures.setFooter", {
    workspaceSlug: mailbox.workspaceSlug,
    ...footerBefore,
  });
});

test("sendEmail adds the sender's default signature and the workspace footer, and leaves the signature out when asked", async () => {
  const s = await session("mail");
  try {
    const signed = `${uniqueName()} signed`;
    await s.ok("sendEmail", {
      ...target,
      to: [`signed@${OUTSIDE_DOMAIN}`],
      subject: signed,
      bodyHtml: "<p>Body text</p>",
    });
    const unsigned = `${uniqueName()} unsigned`;
    await s.ok("sendEmail", {
      ...target,
      to: [`unsigned@${OUTSIDE_DOMAIN}`],
      subject: unsigned,
      bodyHtml: "<p>Body text</p>",
      signature: false,
    });

    const reads = await session("reads");
    try {
      const withSignature = await body(reads, await find(reads, "sent", signed));
      expect(withSignature).toContain("Body text");
      expect(withSignature).toContain(SIGNATURE);
      expect(withSignature).toContain(FOOTER);
      expect(withSignature.indexOf(SIGNATURE)).toBeLessThan(withSignature.indexOf(FOOTER));

      const without = await body(reads, await find(reads, "sent", unsigned));
      expect(without).not.toContain(SIGNATURE);
      expect(without).toContain(FOOTER);
    } finally {
      await reads.close();
    }

    await discardSent(s, signed);
    await discardSent(s, unsigned);
  } finally {
    await s.close();
  }
});

test("createDraft adds the signature but never the footer, and updateDraft adds nothing", async () => {
  const s = await session("mail");
  const reads = await session("reads");
  const subject = `${uniqueName()} draft`;
  let draftId = "";
  try {
    ({ draftId } = await s.ok<{ draftId: string }>("createDraft", {
      ...target,
      to: [`draft@${OUTSIDE_DOMAIN}`],
      subject,
      bodyHtml: "<p>Draft text</p>",
    }));
    const created = await body(reads, await find(reads, "drafts", subject));
    expect(created).toContain(SIGNATURE);
    expect(created).not.toContain(FOOTER);

    const edited = `${subject} edited`;
    ({ draftId } = await s.ok<{ draftId: string }>("updateDraft", {
      ...target,
      draftId,
      to: [`draft@${OUTSIDE_DOMAIN}`],
      subject: edited,
      bodyHtml: "<p>Edited text</p>",
    }));
    const updated = await body(reads, await find(reads, "drafts", edited));
    expect(updated).toContain("Edited text");
    expect(updated).not.toContain(SIGNATURE);
    expect(updated).not.toContain(FOOTER);
  } finally {
    if (draftId) await s.ok("deleteDraft", { ...target, draftId });
    await s.close();
    await reads.close();
  }
});

test("scheduleEmail queues the message with the signature and the footer", async () => {
  const s = await session("mail");
  const subject = `${uniqueName()} scheduled`;
  try {
    const { scheduleId } = await s.ok<{ scheduleId: string }>("scheduleEmail", {
      ...target,
      to: [`later@${OUTSIDE_DOMAIN}`],
      subject,
      bodyHtml: "<p>Later text</p>",
      scheduledFor: new Date(Date.now() + 86_400_000).toISOString(),
    });
    try {
      const { scheduled } = await rpc<{
        scheduled: { id: string; payload: { bodyHtml: string } | null }[];
      }>("mail.scheduledSend.list", mailbox);
      const html = scheduled.find((item) => item.id === scheduleId)?.payload?.bodyHtml ?? "";
      expect(html.startsWith("<p>Later text</p>")).toBe(true);
      expect(html.indexOf(SIGNATURE)).toBeGreaterThan(0);
      expect(html.indexOf(FOOTER)).toBeGreaterThan(html.indexOf(SIGNATURE));
      expect(html.split(FOOTER)).toHaveLength(2);
    } finally {
      await s.ok("cancelScheduled", { ...target, scheduleId });
    }
  } finally {
    await s.close();
  }
});
