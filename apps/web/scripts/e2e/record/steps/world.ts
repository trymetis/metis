import { writeFile } from "node:fs/promises";

import { SUBJECTS } from "@metis/e2e/lib/cast";
import { env } from "@metis/e2e/lib/env";
import { deleteLateArrival } from "@metis/e2e/lib/late-arrival";
import { INBOX_PAGE_SIZE } from "@metis/e2e/lib/llm-scenarios";

import { cacheMessage } from "../../../../src/mail/cache";
import { seedProviderLabels } from "../../../../src/mail/labels";
import { muteThreads } from "../../../../src/mail/mute";
import { addReadLater } from "../../../../src/mail/read-later";
import { scopeMessage } from "../../../../src/mail/session";
import { listMessagesOutputSchema } from "../../../../src/server/schema";
import type { Email } from "../../../../src/types/mail";
import { removeApprovalFolder } from "./approval-folder";
import { findEmail, type StepContext, type World } from "./context";

const MUTED_SUBJECT = SUBJECTS.otp;
const READ_LATER_SUBJECT = SUBJECTS.shipment;

export async function run(ctx: StepContext): Promise<void> {
  const { mail } = ctx.session;

  await deleteLateArrival(env.imap);
  const removed = await removeApprovalFolder(ctx.session);
  console.log(
    `[record] stack converged: late arrival absent, ${removed} leftover approval folder(s) removed`,
  );

  const listed = await mail.adapter.listMessages("inbox", undefined, INBOX_PAGE_SIZE);
  const byMailbox = new Map<string, Email[]>();
  for (const email of listed.emails ?? []) {
    const { mailboxId } = scopeMessage(mail, email.id);
    byMailbox.set(mailboxId, [...(byMailbox.get(mailboxId) ?? []), email]);
  }
  for (const [mailboxId, emails] of byMailbox) {
    await seedProviderLabels({ mailboxId, emails });
  }
  const inbox = listMessagesOutputSchema.parse({
    emails: listed.emails ?? [],
    mailboxErrors: listed.mailboxErrors,
    nextPageToken: listed.nextPageToken,
    total: listed.total,
  }).emails;

  for (const email of inbox) {
    const body = await mail.adapter.getMessage(email.id);
    if (body.bodyHtml || body.bodyText) {
      await cacheMessage(scopeMessage(mail, email.id), body);
    }
  }
  const unread = inbox.filter((e) => !e.isRead).map((e) => e.id);
  if (unread.length > 0) await mail.adapter.batchMarkRead(unread, true);
  console.log(`[record] opened ${inbox.length} inbox messages, marked ${unread.length} read`);

  const world: World = {
    inbox: inbox.map((e) => ({ ...e, isRead: true })),
  };
  const muted = findEmail(world, MUTED_SUBJECT);
  await muteThreads(mail, [muted.threadId ?? muted.id]);
  await addReadLater(mail, findEmail(world, READ_LATER_SUBJECT).id);
  console.log(`[record] muted "${MUTED_SUBJECT}", saved "${READ_LATER_SUBJECT}" for later`);

  await writeFile(ctx.worldPath, JSON.stringify(world));
}
