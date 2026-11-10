import { expect, test } from "vitest";

import type { Rpc } from "../../clients/rpc";
import { uniqueName, until } from "../support/poll";
import { ana, mailboxScope, scope } from "../support/session";
import { at, edge, getRun, graphOf, lit, node, waitForRun } from "../support/workflow";

const OUTSIDE_DOMAIN = "discard.demo.trymetis.email";
const SIGNATURE = "Workflow signature from the e2e suite";
const FOOTER = "Workflow footer from the e2e suite";

type Box = ReturnType<typeof mailboxScope>;

async function findIn(rpc: Rpc, box: Box, folder: string, subject: string) {
  return until(
    async () =>
      (
        await rpc<{ emails: { id: string; subject: string }[] }>("mail.messages.list", {
          ...box,
          folder,
          limit: 50,
        })
      ).emails.find((e) => e.subject === subject),
    (e) => e !== undefined,
    { timeout: 60_000, what: `"${subject}" in ${folder}` },
  );
}

async function opened(rpc: Rpc, box: Box, id: string): Promise<string> {
  const message = await rpc<{ bodyHtml?: string; bodyText?: string }>("mail.messages.get", {
    ...box,
    id,
  });
  return `${message.bodyHtml ?? ""}\n${message.bodyText ?? ""}`;
}

test(
  "Create a draft adds the runner's signature without the footer, and Send mail with Add signature off gets only the footer",
  async () => {
    const { rpc, account } = await ana();
    const box = mailboxScope(account);
    const ws = scope(account);
    const { mailboxes } = await rpc<{ mailboxes: { mailboxId: string; slug: string }[] }>(
      "workspaceMailboxes.list",
      ws,
    );
    const mailboxId = mailboxes.find((m) => m.slug === account.mailboxSlug)?.mailboxId;
    if (!mailboxId) throw new Error("the seeded mailbox is not in the workspace");

    const { signature } = await rpc<{ signature: { id: string } }>("mail.signatures.save", {
      ...box,
      scope: "personal",
      signature: {
        name: uniqueName(),
        html: `<p>${SIGNATURE}</p>`,
        defaultNew: true,
        defaultReply: false,
      },
    });
    const { footer: footerBefore } = await rpc<{ footer: { html: string; enabled: boolean } }>(
      "workspaceSignatures.list",
      ws,
    );
    await rpc("workspaceSignatures.setFooter", { ...ws, html: `<p>${FOOTER}</p>`, enabled: true });

    const drafted = `${uniqueName()} drafted`;
    const sent = `${uniqueName()} sent`;
    const graph = graphOf(
      [
        node("manual", "trigger.manual", at(0)),
        node("draft", "mail.draft", at(1), {
          mailbox: lit(mailboxId),
          to: lit([`draft@${OUTSIDE_DOMAIN}`]),
          subject: lit(drafted),
          body: lit("Drafted by a workflow"),
        }),
        node("send", "mail.send", at(1, 1), {
          mailbox: lit(mailboxId),
          to: lit([`sent@${OUTSIDE_DOMAIN}`]),
          subject: lit(sent),
          body: lit("Sent by a workflow"),
          signature: lit(false),
        }),
      ],
      [edge("manual", "draft"), edge("manual", "send")],
    );
    const { workflow } = await rpc<{ workflow: { id: string } }>("workflows.create", {
      ...ws,
      workflow: { name: uniqueName(), enabled: true, graph },
    });
    try {
      const { runId } = await rpc<{ runId: string }>("workflows.run", { ...ws, id: workflow.id });
      const run = await waitForRun(rpc, account, runId, 120_000);
      expect(run.status, (await getRun(rpc, account, runId)).error ?? "").toBe("completed");

      const draft = await findIn(rpc, box, "drafts", drafted);
      const draftBody = await opened(rpc, box, draft?.id ?? "");
      expect(draftBody).toContain("Drafted by a workflow");
      expect(draftBody).toContain(SIGNATURE);
      expect(draftBody).not.toContain(FOOTER);
      await rpc("mail.drafts.delete", { ...box, draftId: draft?.id });

      const copy = await findIn(rpc, box, "sent", sent);
      const sentBody = await opened(rpc, box, copy?.id ?? "");
      expect(sentBody).toContain("Sent by a workflow");
      expect(sentBody).toContain(FOOTER);
      expect(sentBody).not.toContain(SIGNATURE);
      await rpc("mail.messages.delete", { ...box, id: copy?.id });
    } finally {
      await rpc("workflows.delete", { ...ws, id: workflow.id });
      await rpc("mail.signatures.delete", { ...box, scope: "personal", id: signature.id });
      await rpc("workspaceSignatures.setFooter", { ...ws, ...footerBefore });
    }
  },
  4 * 60_000,
);
