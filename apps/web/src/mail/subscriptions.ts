import "server-only";
import { inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { mailUnsubscribe } from "@/db/schema";
import { sanitizeError } from "@/lib/errors/sanitize-error";
import {
  type BulkUnsubscribeResult,
  type SubscriptionSender,
  subscriptionSenderSchema,
} from "@/server/schema";
import { getCache } from "@/services/cache";
import { enforceRateLimit } from "@/services/rate-limit";
import { RATE_LIMITS } from "@/services/rate-limits";
import type { Email } from "@/types/mail";

import type { MailAdapter } from "./adapter";
import { type MailScope, mailboxIds, scopeMessage } from "./session";
import {
  extractEmailAddress,
  parseMailtoUnsubscribe,
  parseUnsubscribeHeader,
  performOneClickUnsubscribe,
  unsubscribeMethods,
} from "./unsubscribe";

const SCAN_CACHE_SEC = 5 * 60;

const cachedScanSchema = z.object({
  senders: z.array(subscriptionSenderSchema.omit({ unsubscribedStatus: true })),
  scanned: z.number(),
});

type CachedScan = z.infer<typeof cachedScanSchema>;

interface SenderGroup {
  senderEmail: string;
  senderName?: string;
  count: number;
  latest: Email;
}

async function collectInbox(adapter: MailAdapter, scanLimit: number): Promise<Email[]> {
  const collected: Email[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 5 && collected.length < scanLimit; page++) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each page needs the previous page's token
    const res = await adapter.listMessages(
      "inbox",
      pageToken,
      Math.min(100, scanLimit - collected.length),
    );
    collected.push(...res.emails);
    if (!res.nextPageToken || res.emails.length === 0) break;
    pageToken = res.nextPageToken;
  }

  return collected.slice(0, scanLimit);
}

function groupBySender(emails: Email[]): SenderGroup[] {
  const groups = new Map<string, SenderGroup>();
  for (const email of emails) {
    const senderEmail = extractEmailAddress(email.from);
    if (!senderEmail) continue;
    const existing = groups.get(senderEmail);
    if (existing) {
      existing.count++;
    } else {
      groups.set(senderEmail, {
        senderEmail,
        senderName: email.fromName || undefined,
        count: 1,
        latest: email,
      });
    }
  }
  return [...groups.values()];
}

async function mapChunked<T, R>(
  items: T[],
  chunkSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    // oxlint-disable-next-line eslint/no-await-in-loop -- chunks run one after another to cap concurrency at chunkSize
    results.push(...(await Promise.all(chunk.map(fn))));
  }
  return results;
}

async function readCachedScan(key: string): Promise<CachedScan | null> {
  const raw = await getCache().get(key);
  if (!raw) return null;
  try {
    return cachedScanSchema.safeParse(JSON.parse(raw)).data ?? null;
  } catch {
    return null;
  }
}

async function runScan(
  mail: Pick<MailScope, "adapter" | "mailboxes">,
  requestedScanLimit: number,
): Promise<CachedScan> {
  const adapter = mail.adapter;
  const hasZoho = mail.mailboxes.some((m) => m.provider === "zoho");
  const scanLimit = hasZoho ? Math.min(requestedScanLimit, 50) : requestedScanLimit;
  const emails = await collectInbox(adapter, scanLimit);
  const groups = groupBySender(emails);

  const concurrency = hasZoho ? 3 : 8;
  const withInfo = await mapChunked(groups, concurrency, async (g) => {
    const info = await adapter.getUnsubscribeInfo(g.latest.id).catch(() => null);
    if (!info) return null;
    const methods = unsubscribeMethods(parseUnsubscribeHeader(info));
    if (methods.length === 0) return null;
    return { group: g, methods };
  });

  const senders = withInfo
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .map(({ group, methods }) => ({
      senderEmail: group.senderEmail,
      senderName: group.senderName,
      messageId: group.latest.id,
      count: group.count,
      latestDate: group.latest.date,
      latestSubject: group.latest.subject,
      methods,
    }))
    .toSorted((a, b) => b.count - a.count);

  return { senders, scanned: emails.length };
}

export async function scanSubscriptions(
  mail: Pick<MailScope, "userId" | "adapter" | "mailboxes">,
  requestedScanLimit: number,
): Promise<{ senders: SubscriptionSender[]; scanned: number }> {
  const ids = mailboxIds(mail);
  const scope = ids.toSorted().join(",");
  const key = `subscriptions-scan:${scope}:${requestedScanLimit}`;

  let scan = await readCachedScan(key);
  if (!scan) {
    await enforceRateLimit(scope, RATE_LIMITS.mailSubscriptionsScan, "scans");
    scan = await runScan(mail, requestedScanLimit);
    await getCache().set(key, JSON.stringify(scan), SCAN_CACHE_SEC);
  }

  const unsubRows = await db
    .select()
    .from(mailUnsubscribe)
    .where(inArray(mailUnsubscribe.mailboxId, ids));
  const statusBySender = new Map(unsubRows.map((r) => [r.senderEmail, r.status]));

  return {
    senders: scan.senders.map((sender) => ({
      ...sender,
      unsubscribedStatus: statusBySender.get(sender.senderEmail),
    })),
    scanned: scan.scanned,
  };
}

export async function unsubscribeSenders(
  mail: Pick<MailScope, "userId" | "adapter" | "mailboxes" | "isAggregate">,
  items: { messageId: string; senderEmail: string }[],
): Promise<BulkUnsubscribeResult[]> {
  await enforceRateLimit(mail.userId, RATE_LIMITS.mailUnsubscribe, "unsubscribe requests");

  const results: BulkUnsubscribeResult[] = [];

  /* oxlint-disable eslint/no-await-in-loop -- an unsubscribe can send mail or call the sender's endpoint; one at a time stays under provider send limits */
  for (const item of items) {
    const senderEmail = item.senderEmail.toLowerCase();
    const result = await unsubscribeOne(mail.adapter, item.messageId);
    results.push({ ...result, senderEmail });

    if (result.status !== "failed") {
      await db
        .insert(mailUnsubscribe)
        .values({
          id: crypto.randomUUID(),
          mailboxId: scopeMessage(mail, item.messageId).mailboxId,
          unsubscribedByUserId: mail.userId,
          senderEmail,
          senderName: null,
          method: result.method ?? "link",
          status: result.status,
          createdAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [mailUnsubscribe.mailboxId, mailUnsubscribe.senderEmail],
          set: {
            method: result.method ?? "link",
            status: result.status,
            createdAt: new Date(),
          },
        });
    }
  }
  /* oxlint-enable eslint/no-await-in-loop */

  return results;
}

async function unsubscribeOne(
  adapter: MailAdapter,
  messageId: string,
): Promise<Omit<BulkUnsubscribeResult, "senderEmail">> {
  const info = await adapter.getUnsubscribeInfo(messageId).catch(() => null);
  if (!info) {
    return {
      status: "failed",
      error: "No unsubscribe header found on this message",
    };
  }

  const parsed = parseUnsubscribeHeader(info);
  const errors: string[] = [];

  if (parsed.oneClickUrl) {
    try {
      await performOneClickUnsubscribe(parsed.oneClickUrl);
      return { status: "done", method: "one_click" };
    } catch (err) {
      errors.push(sanitizeError(err));
    }
  }

  if (parsed.mailtoUrl) {
    const mailto = parseMailtoUnsubscribe(parsed.mailtoUrl);
    if (mailto) {
      try {
        await adapter.sendMessage({
          to: [mailto.to],
          subject: mailto.subject,
          bodyHtml: `<p>${mailto.body}</p>`,
          bodyText: mailto.body,
        });
        return { status: "done", method: "mailto" };
      } catch (err) {
        errors.push(sanitizeError(err));
      }
    }
  }

  if (parsed.linkUrl) {
    return { status: "manual", method: "link", url: parsed.linkUrl };
  }

  return {
    status: "failed",
    error: errors[0] ?? "This sender didn't offer a way to unsubscribe.",
  };
}
