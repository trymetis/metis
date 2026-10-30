import { ImapFlow } from "imapflow";

import { MAIL_CASES } from "./edge/mail-cases";
import { MAILBOX_FOLDERS, mailbox } from "./mailbox";
import { edgeEnabled, reject } from "./report";

const EDGE_ARRIVAL = Date.UTC(2024, 5, 1);

export interface ImapTarget {
  host: string;
  port: number;
  user: string;
  pass: string;
}

export async function seedMail(target: ImapTarget): Promise<void> {
  const client = new ImapFlow({
    host: target.host,
    port: target.port,
    secure: false,
    auth: { user: target.user, pass: target.pass },
    logger: false,
  });
  await client.connect();
  try {
    const existing = new Set((await client.list()).map((box) => box.path));
    for (const folder of MAILBOX_FOLDERS) {
      if (!existing.has(folder)) await client.mailboxCreate(folder);
    }

    const status = await client.status("INBOX", { messages: true });
    const messages = status === false ? 0 : (status.messages ?? 0);
    if (messages > 0) {
      console.log(`[seed] INBOX already has ${messages} messages`);
      return;
    }

    if (edgeEnabled()) {
      let appended = 0;
      for (const edge of MAIL_CASES) {
        try {
          const built = edge.build();
          for (const raw of Array.isArray(built) ? built : [built]) {
            await client.append("INBOX", raw, [], new Date(EDGE_ARRIVAL + appended * 1000));
            appended++;
          }
        } catch (err) {
          reject("imap", edge.name, err);
        }
      }
      console.log(`[seed] appended ${appended} edge-case messages (${MAIL_CASES.length} cases)`);
    }

    const counts = new Map<string, number>();
    for (const message of mailbox()) {
      await client.append(message.folder, message.raw, message.flags, message.date);
      counts.set(message.folder, (counts.get(message.folder) ?? 0) + 1);
    }
    console.log(
      `[seed] appended ${[...counts].map(([folder, n]) => `${n} to ${folder}`).join(", ")}`,
    );
  } finally {
    await client.logout();
  }
}
