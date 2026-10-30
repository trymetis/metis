import { env } from "@metis/e2e/lib/env";
import { ImapFlow } from "imapflow";
import { expect, test } from "vitest";

import { uniqueName, until } from "../support/poll";
import { ana, mailboxScope } from "../support/session";

async function withImap<T>(run: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: env.imap.host,
    port: env.imap.port,
    secure: false,
    auth: { user: env.imap.user, pass: env.imap.pass },
    logger: false,
  });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.logout();
  }
}

test("a message snoozed from the archive wakes up back in the archive", async () => {
  const { rpc, account } = await ana();
  const mailbox = mailboxScope(account);
  const subject = uniqueName();
  const find = async (folder: string) =>
    (
      await rpc<{ emails: { id: string; subject: string }[] }>("mail.messages.list", {
        ...mailbox,
        folder,
        limit: 100,
      })
    ).emails.find((e) => e.subject === subject);
  await withImap((client) =>
    client.append(
      "Archive",
      `From: snooze@demo.trymetis.email\r\nTo: ${env.imap.user}\r\nSubject: ${subject}\r\nDate: ${new Date().toUTCString()}\r\n\r\nSnoozed from the archive.\r\n`,
      ["\\Seen"],
    ),
  );
  try {
    const archived = await until(() => find("archive"), Boolean, {
      what: "the message to show in the archive",
    });
    await rpc("mail.messages.snooze", {
      ...mailbox,
      id: archived?.id,
      wakeAt: new Date(Date.now() + 15_000).toISOString(),
      folder: "archive",
    });
    const status = async () =>
      (
        await rpc<{ emails: { subject: string; status: string }[] }>(
          "mail.messages.listSnoozed",
          mailbox,
        )
      ).emails.find((e) => e.subject === subject)?.status;
    await until(status, (s) => s === "pending", { what: "the snooze to be armed" });
    await until(status, (s) => s !== "pending", {
      timeout: 120_000,
      interval: 2_000,
      what: "the snooze to wake",
    });
    expect(await find("archive")).toBeDefined();
    expect(await find("inbox")).toBeUndefined();
  } finally {
    await withImap(async (client) => {
      for (const folder of ["Archive", "INBOX"]) {
        const lock = await client.getMailboxLock(folder);
        try {
          const found = await client.search({ subject }, { uid: true });
          if (found && found.length > 0) await client.messageDelete(found, { uid: true });
        } finally {
          lock.release();
        }
      }
    });
  }
});
