import { CLASSIFY_BATCH_SIZE, GATED_SUBJECTS, INBOX_PAGE_SIZE } from "@metis/e2e/lib/llm-scenarios";
import { inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../../../src/db";
import { mailLabel } from "../../../../src/db/schema";
import { classifyMessages } from "../../../../src/mail/classify";
import { mailboxIds, scopeMessage } from "../../../../src/mail/session";
import { generateSmartReplies } from "../../../../src/mail/smart-replies";
import { buildThreadSummary } from "../../../../src/mail/thread-summary";
import { decisionEnabled } from "../../../../src/services/decision";
import { MAIL_FOLDERS, type MailFolder } from "../../../../src/types/mail";
import { eachLimited, Failures, type InboxEmail, loadWorld, type StepContext } from "./context";

const SUMMARY_LANES = 4;

async function classifyLikeTheList(ctx: StepContext, inbox: InboxEmail[]): Promise<number> {
  const { mail } = ctx.session;
  const labelled = new Set(
    (
      await db
        .select({
          mailboxId: mailLabel.mailboxId,
          messageId: mailLabel.messageId,
        })
        .from(mailLabel)
        .where(inArray(mailLabel.mailboxId, mailboxIds(mail)))
    ).map((row) => `${row.mailboxId}/${row.messageId}`),
  );
  const known = new Set(
    inbox
      .filter((e) => {
        const target = scopeMessage(mail, e.id);
        return labelled.has(`${target.mailboxId}/${target.messageId}`);
      })
      .map((e) => e.id),
  );
  const attempted = new Set<string>();
  let classified = 0;
  for (;;) {
    const batch = inbox
      .filter((e) => !known.has(e.id) && !attempted.has(e.id))
      .slice(0, CLASSIFY_BATCH_SIZE);
    if (batch.length === 0) return classified;
    for (const e of batch) attempted.add(e.id);
    const labels = await classifyMessages(
      mail,
      batch.map((e) => ({
        id: e.id,
        sender: e.fromName || e.from,
        subject: e.subject,
        snippet: e.snippet,
      })),
    );
    for (const id of Object.keys(labels)) known.add(id);
    classified += Object.keys(labels).length;
  }
}

async function beyondFirstPage(ctx: StepContext, firstPage: InboxEmail[]): Promise<InboxEmail[]> {
  const { mail } = ctx.session;
  const seen = new Set(firstPage.map((e) => e.id));
  const rest: InboxEmail[] = [];
  let pageToken: string | undefined;
  do {
    const page = await mail.adapter.listMessages("inbox", pageToken, INBOX_PAGE_SIZE);
    rest.push(...page.emails.filter((e) => !seen.has(e.id)));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return rest;
}

async function summarizeThreads(ctx: StepContext, emails: InboxEmail[], classifier: string) {
  const { mail } = ctx.session;
  const threads = new Map<string, InboxEmail[]>();
  for (const email of emails) {
    const thread = email.threadId ?? email.id;
    threads.set(thread, [...(threads.get(thread) ?? []), email]);
  }
  const failures = new Failures();
  await eachLimited([...threads.values()], SUMMARY_LANES, async (thread) => {
    for (const email of thread) {
      await failures.attempt(`summary "${email.subject}"`, async () => {
        await buildThreadSummary(mail, email.id, email.threadId);
        console.log(`[record] summary under ${classifier} labels "${email.subject}"`);
      });
    }
  });
  failures.throwIfAny();
}

async function recordFolder(ctx: StepContext, folder: MailFolder): Promise<void> {
  const { emails } = await ctx.session.mail.adapter.listMessages(
    folder,
    undefined,
    INBOX_PAGE_SIZE,
  );
  const classified = await classifyLikeTheList(ctx, emails);
  console.log(`[record] decision classifier labelled ${classified}/${emails.length} in ${folder}`);
  await summarizeThreads(ctx, emails, "decision");
}

async function recordGated(ctx: StepContext): Promise<void> {
  const { mail } = ctx.session;
  const { inbox } = await loadWorld(ctx);
  const all = [...inbox, ...(await beyondFirstPage(ctx, inbox))];
  for (const subject of GATED_SUBJECTS) {
    const email = all.find((e) => e.subject === subject);
    if (!email) throw new Error(`"${subject}" is not in the inbox`);
    const item = {
      id: email.id,
      sender: email.fromName || email.from,
      subject: email.subject,
      snippet: email.snippet,
    };
    await classifyMessages(mail, [item]);
    await buildThreadSummary(mail, email.id, email.threadId);
    await generateSmartReplies(mail, item);
    console.log(`[record] searched, classified, summarized and replied to "${subject}"`);
  }
}

export async function run(ctx: StepContext): Promise<void> {
  const folder = ctx.scenario.arg;
  if (folder === "gated") {
    await recordGated(ctx);
    return;
  }
  if (folder) {
    await recordFolder(ctx, z.enum(MAIL_FOLDERS).parse(folder));
    return;
  }
  const { inbox } = await loadWorld(ctx);
  const classifier = decisionEnabled("classifier") ? "decision" : "LLM";

  const classified = await classifyLikeTheList(ctx, inbox);
  console.log(`[record] ${classifier} classifier labelled ${classified}/${inbox.length}`);

  await summarizeThreads(ctx, inbox, classifier);

  if (decisionEnabled("classifier")) {
    const rest = await beyondFirstPage(ctx, inbox);
    const deep = await classifyLikeTheList(ctx, rest);
    console.log(`[record] decision classifier labelled ${deep}/${rest.length} beyond page one`);
  }
}
