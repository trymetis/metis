import { ImapFlow } from "imapflow";

import { lateArrival } from "../seed/mailbox/late-arrival";
import { SUBJECTS } from "./cast";

export const LATE_ARRIVAL_SUBJECT = SUBJECTS.lateArrival;
export const LATE_ARRIVAL_WORKFLOW = "Triage new mail";

export interface ImapLogin {
  host: string;
  port: number;
  user: string;
  pass: string;
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

export async function appendLateArrival(login: ImapLogin): Promise<void> {
  const message = lateArrival();
  await withInbox(login, (client) => client.append("INBOX", message.raw, [], message.date));
}

export async function deleteLateArrival(login: ImapLogin): Promise<void> {
  await withInbox(login, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ subject: LATE_ARRIVAL_SUBJECT }, { uid: true });
      if (uids && uids.length > 0) {
        await client.messageDelete(uids, { uid: true });
      }
    } finally {
      lock.release();
    }
  });
}
