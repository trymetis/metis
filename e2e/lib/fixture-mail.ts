import { randomUUID } from "node:crypto";

import { ImapFlow } from "imapflow";

import type { ImapLogin } from "./late-arrival";

const ARRIVAL = new Date("2020-01-06T09:00:00Z");

export interface FixtureMail {
  messageId: string;
}

async function withInbox<T>(login: ImapLogin, run: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: login.host,
    port: login.port,
    secure: false,
    auth: { user: login.user, pass: login.pass },
    logger: false,
  });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.logout();
  }
}

export async function appendFixture(
  login: ImapLogin,
  mail: { from: string; subject: string; headers?: [string, string][] },
): Promise<FixtureMail> {
  const messageId = `<fixture-${randomUUID()}@demo.trymetis.email>`;
  const raw = [
    `From: ${mail.from}`,
    `To: ${login.user}@demo.trymetis.email`,
    `Subject: ${mail.subject}`,
    `Date: ${ARRIVAL.toUTCString()}`,
    `Message-ID: ${messageId}`,
    ...(mail.headers ?? []).map(([name, value]) => `${name}: ${value}`),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Sent by the e2e suite.",
    "",
  ].join("\r\n");
  await withInbox(login, (client) => client.append("INBOX", raw, ["\\Seen"], ARRIVAL));
  return { messageId };
}

export async function deleteFixture(login: ImapLogin, mail: FixtureMail): Promise<void> {
  await withInbox(login, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ header: { "message-id": mail.messageId } }, { uid: true });
      if (uids && uids.length > 0) {
        await client.messageDelete(uids, { uid: true });
      }
    } finally {
      lock.release();
    }
  });
}
