import { expect, test } from "vitest";

import { harness } from "../../clients/harness";
import { type Rpc, RpcError, rpcWithCookie } from "../../clients/rpc";
import { signIn } from "../../clients/sign-in";
import { inviteToWorkspace } from "../support/invites";
import { uniqueName } from "../support/poll";
import { ana, totpCode } from "../support/session";

const OUTSIDE_DOMAIN = "discard.demo.trymetis.email";

interface Signature {
  id: string;
  scope: "personal" | "mailbox" | "workspace";
  name: string;
  html: string;
  defaultNew: boolean;
  defaultReply: boolean;
}

interface ComposeSignatures {
  signatures: { id: string; scope: string; name: string; html: string }[];
  defaultNew: string | null;
  defaultReply: string | null;
}

interface Scheduled {
  id: string;
  subject: string;
  payload: { bodyHtml: string; bodyText?: string } | null;
}

interface AuditPage {
  events: { action: string; detail: Record<string, unknown> }[];
}

interface Fresh {
  ws: { workspaceSlug: string };
  box: { workspaceSlug: string; mailboxSlug: string };
  email: string;
}

async function rejection(call: Promise<unknown>): Promise<RpcError> {
  const err = await call.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof RpcError)) throw new Error("expected an RpcError");
  return err;
}

function fields(name: string, html: string, defaults: Partial<Signature> = {}) {
  return {
    name,
    html,
    defaultNew: defaults.defaultNew ?? false,
    defaultReply: defaults.defaultReply ?? false,
  };
}

async function clearMailboxSignatures(rpc: Rpc, box: Fresh["box"]): Promise<void> {
  const listed = await rpc<{ mailbox: Signature[]; personal: Signature[] }>(
    "mail.signatures.list",
    box,
  );
  for (const s of [...listed.mailbox, ...listed.personal]) {
    await rpc("mail.signatures.delete", { ...box, scope: s.scope, id: s.id });
  }
}

async function withWorkspace(rpc: Rpc, run: (fresh: Fresh) => Promise<void>): Promise<void> {
  const created = await rpc<{ slug: string }>("workspaces.create", { name: uniqueName() });
  const ws = { workspaceSlug: created.slug };
  let box: Fresh["box"] | null = null;
  try {
    const { mailboxes } = await rpc<{
      mailboxes: { mailboxId: string; provider: string; email: string }[];
    }>("workspaceMailboxes.attachable", ws);
    const imap = mailboxes.find((m) => m.provider === "imap");
    if (!imap) throw new Error("the seeded IMAP mailbox is not attachable");
    const linked = await rpc<{ slug: string }>("workspaceMailboxes.attach", {
      ...ws,
      mailboxId: imap.mailboxId,
    });
    box = { ...ws, mailboxSlug: linked.slug };
    await run({ ws, box, email: imap.email });
  } finally {
    if (box) await clearMailboxSignatures(rpc, box);
    await rpc("workspaces.delete", { ...ws, code: await harness.totp() });
  }
}

test("each list keeps one default of each kind, and saving cleans the HTML", async () => {
  const { rpc } = await ana();
  await withWorkspace(rpc, async ({ ws }) => {
    const first = await rpc<{ signature: Signature }>("workspaceSignatures.save", {
      ...ws,
      signature: fields("First", "<p>First</p>", { defaultNew: true, defaultReply: true }),
    });
    const second = await rpc<{ signature: Signature }>("workspaceSignatures.save", {
      ...ws,
      signature: fields(
        "Second",
        '<p>Second</p><script>alert(1)</script><img src="http://example.com/a.png"><img src="https://example.com/logo.png"><a href="javascript:alert(1)">bad</a>',
        { defaultNew: true },
      ),
    });

    const { signatures } = await rpc<{ signatures: Signature[] }>("workspaceSignatures.list", ws);
    const byName = new Map(signatures.map((s) => [s.name, s]));
    expect(byName.get("First")).toMatchObject({ defaultNew: false, defaultReply: true });
    expect(byName.get("Second")).toMatchObject({ defaultNew: true, defaultReply: false });

    const html = second.signature.html;
    expect(html).toContain("<p>Second</p>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("http://example.com/a.png");
    expect(html).toContain('src="https://example.com/logo.png"');
    expect(html).not.toContain("javascript:");

    await rpc("workspaceSignatures.delete", { ...ws, id: first.signature.id });
    const after = await rpc<{ signatures: Signature[] }>("workspaceSignatures.list", ws);
    expect(after.signatures.map((s) => s.name)).toEqual(["Second"]);

    const gone = await rejection(
      rpc("workspaceSignatures.delete", { ...ws, id: first.signature.id }),
    );
    expect(gone.code).toBe("NOT_FOUND");
  });
});

test("a list holds at most 25 signatures", async () => {
  const { rpc } = await ana();
  await withWorkspace(rpc, async ({ ws }) => {
    for (let i = 0; i < 25; i++) {
      await rpc("workspaceSignatures.save", { ...ws, signature: fields(`S${i}`, `<p>${i}</p>`) });
    }
    const full = await rejection(
      rpc("workspaceSignatures.save", { ...ws, signature: fields("One more", "<p>more</p>") }),
    );
    expect(full.code).toBe("BAD_REQUEST");
    expect(full.message).toBe("You can keep up to 25 signatures here");
  });
});

test("the composer gets the most personal default for each kind, with the sender filled in", async () => {
  const { rpc, account } = await ana();
  await withWorkspace(rpc, async ({ ws, box, email }) => {
    const shared = await rpc<{ signature: Signature }>("workspaceSignatures.save", {
      ...ws,
      signature: fields("Team", "<p>Team</p>", { defaultNew: true, defaultReply: true }),
    });
    const mailbox = await rpc<{ signature: Signature }>("mail.signatures.save", {
      ...box,
      scope: "mailbox",
      signature: fields("Desk", "<p>Desk {{email}}</p>", { defaultReply: true }),
    });
    const mine = await rpc<{ signature: Signature }>("mail.signatures.save", {
      ...box,
      scope: "personal",
      signature: fields("Mine", "<p>{{ Name }} at {{email}}</p>", { defaultNew: true }),
    });
    const empty = await rpc<{ signature: Signature }>("mail.signatures.save", {
      ...box,
      scope: "personal",
      signature: fields("Empty", "<script>gone</script>"),
    });
    expect(empty.signature.html).toBe("");

    const listed = await rpc<{
      mailbox: Signature[];
      personal: Signature[];
      canEditMailbox: boolean;
    }>("mail.signatures.list", box);
    expect(listed.canEditMailbox).toBe(true);
    expect(listed.mailbox.map((s) => s.id)).toEqual([mailbox.signature.id]);
    expect(listed.personal.map((s) => s.id).toSorted()).toEqual(
      [mine.signature.id, empty.signature.id].toSorted(),
    );

    const compose = await rpc<ComposeSignatures>("mail.signatures.forCompose", box);
    expect(compose.defaultNew).toBe(mine.signature.id);
    expect(compose.defaultReply).toBe(mailbox.signature.id);
    expect(compose.signatures.map((s) => [s.id, s.scope])).toEqual([
      [mine.signature.id, "personal"],
      [mailbox.signature.id, "mailbox"],
      [shared.signature.id, "workspace"],
    ]);
    expect(compose.signatures[0]?.html).toBe(`<p>${account.name} at ${email}</p>`);
    expect(compose.signatures[1]?.html).toBe(`<p>Desk ${email}</p>`);

    await rpc("mail.signatures.delete", { ...box, scope: "personal", id: mine.signature.id });
    const fallback = await rpc<ComposeSignatures>("mail.signatures.forCompose", box);
    expect(fallback.defaultNew).toBe(shared.signature.id);
  });
});

test("members edit only their own signatures; the workspace's and the mailbox's stay with their owners", async () => {
  const { rpc, account } = await ana();
  await withWorkspace(rpc, async ({ ws, box }) => {
    const { token } = await inviteToWorkspace(rpc, ws.workspaceSlug, account.member.email);
    const cookie = await signIn(account.member.email, account.member.password, () =>
      totpCode(account.member.totpURI),
    );
    const cy = rpcWithCookie(cookie);
    await cy("invites.accept", { token });

    const listed = await cy<{ canEdit: boolean }>("workspaceSignatures.list", ws);
    expect(listed.canEdit).toBe(false);

    const shared = await rejection(
      cy("workspaceSignatures.save", { ...ws, signature: fields("No", "<p>no</p>") }),
    );
    expect(shared.code).toBe("FORBIDDEN");

    const footer = await rejection(
      cy("workspaceSignatures.setFooter", { ...ws, html: "<p>no</p>", enabled: true }),
    );
    expect(footer.code).toBe("FORBIDDEN");

    const theirs = await cy<{ canEditMailbox: boolean }>("mail.signatures.list", box);
    expect(theirs.canEditMailbox).toBe(false);
    const mailbox = await rejection(
      cy("mail.signatures.save", {
        ...box,
        scope: "mailbox",
        signature: fields("No", "<p>no</p>"),
      }),
    );
    expect(mailbox.code).toBe("FORBIDDEN");

    const own = await cy<{ signature: Signature }>("mail.signatures.save", {
      ...box,
      scope: "personal",
      signature: fields("Cy", "<p>Cy</p>", { defaultNew: true }),
    });
    const anaSees = await rpc<{ personal: Signature[] }>("mail.signatures.list", box);
    expect(anaSees.personal.map((s) => s.id)).not.toContain(own.signature.id);
    const notHers = await rejection(
      rpc("mail.signatures.delete", { ...box, scope: "personal", id: own.signature.id }),
    );
    expect(notHers.code).toBe("NOT_FOUND");
    await cy("mail.signatures.delete", { ...box, scope: "personal", id: own.signature.id });
  });
});

test("the footer goes on mail sent from the workspace, never adds the signature to an app send, and its changes are recorded", async () => {
  const { rpc } = await ana();
  await withWorkspace(rpc, async ({ ws, box }) => {
    await rpc("workspaceSignatures.save", {
      ...ws,
      signature: fields("Team", "<p>Team signature</p>", { defaultNew: true }),
    });
    const saved = await rpc<{ html: string; enabled: boolean }>("workspaceSignatures.setFooter", {
      ...ws,
      html: "<p>Legal footer</p><script>x</script>",
      enabled: true,
    });
    expect(saved).toEqual({ html: "<p>Legal footer</p>", enabled: true });

    const subject = uniqueName();
    const scheduled = await rpc<{ id: string }>("mail.scheduledSend.create", {
      ...box,
      payload: {
        to: [`${uniqueName()}@${OUTSIDE_DOMAIN}`],
        subject,
        bodyHtml: "<p>Body</p>",
        bodyText: "Body",
      },
      scheduledFor: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
    });
    try {
      const { scheduled: list } = await rpc<{ scheduled: Scheduled[] }>(
        "mail.scheduledSend.list",
        box,
      );
      const payload = list.find((s) => s.id === scheduled.id)?.payload;
      expect(payload?.bodyHtml.startsWith("<p>Body</p>")).toBe(true);
      expect(payload?.bodyHtml.endsWith("<p>Legal footer</p></div>")).toBe(true);
      expect(payload?.bodyHtml).not.toContain("Team signature");
      expect(payload?.bodyText).toBe("Body\n\nLegal footer");
    } finally {
      await rpc("mail.scheduledSend.cancel", { ...box, id: scheduled.id });
    }

    const off = await rpc<{ html: string; enabled: boolean }>("workspaceSignatures.setFooter", {
      ...ws,
      html: "<p>Legal footer</p>",
      enabled: false,
    });
    expect(off.enabled).toBe(false);
    await rpc("workspaceSignatures.setFooter", {
      ...ws,
      html: "<p>Legal footer</p>",
      enabled: false,
    });

    const found = await rpc<AuditPage>("audit.workspace", { ...ws, q: "mail footer" });
    const footerEvents = found.events.filter((e) => e.action === "workspace.mail_footer_changed");
    expect(footerEvents.map((e) => e.detail.enabled)).toEqual([false, true]);

    const listed = await rpc<{ footer: { html: string; enabled: boolean } }>(
      "workspaceSignatures.list",
      ws,
    );
    expect(listed.footer).toEqual({ html: "<p>Legal footer</p>", enabled: false });
  });
});
