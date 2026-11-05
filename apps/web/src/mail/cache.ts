import crypto from "node:crypto";

import { and, desc, eq, isNotNull, lt, or } from "drizzle-orm";

import { db } from "@/db";
import { mailMessage, mailThreadSummary } from "@/db/schema";
import type { AnalysisResult } from "@/types/analysis";
import type { Email } from "@/types/mail";
import type { ThreadSummary } from "@/types/thread-summary";
import { phishingFound } from "@/workflow/hooks";

import type { ScopedMessage } from "./aggregate";

const MAX_CACHED_BODY_BYTES = 4_000_000;

function fitsCache(body: string | undefined): boolean {
  return body === undefined || Buffer.byteLength(body, "utf8") <= MAX_CACHED_BODY_BYTES;
}

export interface CachedMessage {
  bodyHtml: string | null;
  bodyText: string | null;
  analysisResult: AnalysisResult | null;
  sender: string;
  subject: string;
  receivedAt: Date;
}

function rowKey(scoped: ScopedMessage) {
  return and(
    eq(mailMessage.mailboxId, scoped.mailboxId),
    eq(mailMessage.providerMessageId, scoped.messageId),
  );
}

function bareId(mailboxId: string, id: string | null | undefined): string | null {
  if (!id) return null;
  const prefix = `${mailboxId}:`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

export async function getCachedMessage(scoped: ScopedMessage): Promise<CachedMessage | null> {
  const [row] = await db
    .select({
      bodyHtml: mailMessage.bodyHtml,
      bodyText: mailMessage.bodyText,
      analysisResult: mailMessage.analysisResult,
      sender: mailMessage.sender,
      subject: mailMessage.subject,
      receivedAt: mailMessage.receivedAt,
    })
    .from(mailMessage)
    .where(rowKey(scoped))
    .limit(1);
  return row ?? null;
}

export async function touchCachedMessage(scoped: ScopedMessage): Promise<void> {
  await db.update(mailMessage).set({ syncedAt: new Date() }).where(rowKey(scoped));
}

export async function getCachedSubjects(keys: { mailboxId: string; providerMessageId: string }[]) {
  if (keys.length === 0) return new Map();
  const rows = await db
    .select({
      mailboxId: mailMessage.mailboxId,
      providerMessageId: mailMessage.providerMessageId,
      subject: mailMessage.subject,
      sender: mailMessage.sender,
    })
    .from(mailMessage)
    .where(
      or(
        ...keys.map((k) =>
          and(
            eq(mailMessage.mailboxId, k.mailboxId),
            eq(mailMessage.providerMessageId, k.providerMessageId),
          ),
        ),
      ),
    );

  return new Map(
    rows.map((row) => [
      `${row.mailboxId}:${row.providerMessageId}`,
      { subject: row.subject, sender: row.sender },
    ]),
  );
}

export interface CachedSummary {
  mailboxId: string;
  providerMessageId: string;
  threadId: string | null;
  sender: string;
  senderEmail: string | null;
  subject: string;
  snippet: string | null;
  isRead: boolean;
  receivedAt: Date;
}

const SUMMARY_COLUMNS = {
  mailboxId: mailMessage.mailboxId,
  providerMessageId: mailMessage.providerMessageId,
  threadId: mailMessage.threadId,
  sender: mailMessage.sender,
  senderEmail: mailMessage.senderEmail,
  subject: mailMessage.subject,
  snippet: mailMessage.snippet,
  isRead: mailMessage.isRead,
  receivedAt: mailMessage.receivedAt,
};

export async function getCachedSummaries(
  keys: { mailboxId: string; providerMessageId: string }[],
): Promise<CachedSummary[]> {
  if (keys.length === 0) return [];
  return db
    .select(SUMMARY_COLUMNS)
    .from(mailMessage)
    .where(
      or(
        ...keys.map((k) =>
          and(
            eq(mailMessage.mailboxId, k.mailboxId),
            eq(mailMessage.providerMessageId, k.providerMessageId),
          ),
        ),
      ),
    );
}

export async function getCachedThreadHeads(
  keys: { mailboxId: string; threadId: string }[],
): Promise<CachedSummary[]> {
  if (keys.length === 0) return [];
  const rows = await db
    .select(SUMMARY_COLUMNS)
    .from(mailMessage)
    .where(
      or(
        ...keys.map((k) =>
          and(eq(mailMessage.mailboxId, k.mailboxId), eq(mailMessage.threadId, k.threadId)),
        ),
      ),
    )
    .orderBy(desc(mailMessage.receivedAt));
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.mailboxId}:${row.threadId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function cacheMessage(scoped: ScopedMessage, message: Partial<Email>): Promise<void> {
  const now = new Date();

  const set: Partial<typeof mailMessage.$inferInsert> = { syncedAt: now };
  if (message.threadId !== undefined) {
    set.threadId = bareId(scoped.mailboxId, message.threadId);
  }
  if (fitsCache(message.bodyHtml) && fitsCache(message.bodyText)) {
    if (message.bodyHtml !== undefined) set.bodyHtml = message.bodyHtml;
    if (message.bodyText !== undefined) set.bodyText = message.bodyText;
  }
  if (message.snippet !== undefined) set.snippet = message.snippet;
  const senderName = message.fromName ?? message.from;
  if (senderName !== undefined) set.sender = senderName;
  if (message.from !== undefined) set.senderEmail = message.from;
  if (message.subject !== undefined) set.subject = message.subject;
  if (message.date !== undefined) set.receivedAt = new Date(message.date);
  if (message.isRead !== undefined) set.isRead = message.isRead;

  await db
    .insert(mailMessage)
    .values({
      id: crypto.randomUUID(),
      mailboxId: scoped.mailboxId,
      providerMessageId: scoped.messageId,
      sender: set.sender ?? "",
      subject: set.subject ?? "",
      threadId: set.threadId ?? null,
      senderEmail: set.senderEmail ?? null,
      snippet: set.snippet ?? null,
      bodyText: set.bodyText ?? null,
      bodyHtml: set.bodyHtml ?? null,
      isRead: set.isRead ?? false,
      receivedAt: set.receivedAt ?? now,
      syncedAt: now,
    })
    .onConflictDoUpdate({
      target: [mailMessage.mailboxId, mailMessage.providerMessageId],
      set,
    });
}

export async function getCachedAnalysis(scoped: ScopedMessage): Promise<AnalysisResult | null> {
  const cached = await getCachedMessage(scoped);
  return cached?.analysisResult ?? null;
}

export async function cacheAnalysis(
  scoped: ScopedMessage,
  analysis: AnalysisResult,
): Promise<void> {
  const now = new Date();
  await db
    .insert(mailMessage)
    .values({
      id: crypto.randomUUID(),
      mailboxId: scoped.mailboxId,
      providerMessageId: scoped.messageId,
      sender: "",
      subject: "",
      analysisResult: analysis,
      isRead: false,
      receivedAt: now,
      syncedAt: now,
    })
    .onConflictDoUpdate({
      target: [mailMessage.mailboxId, mailMessage.providerMessageId],
      set: { analysisResult: analysis, syncedAt: now },
    });
  if (analysis.classification !== "Legitimate") {
    phishingFound(scoped, analysis.classification, analysis.risk_score);
  }
}

export async function deleteCachedMessage(scoped: ScopedMessage): Promise<void> {
  await db.delete(mailMessage).where(rowKey(scoped));
}

export interface StoredSummary {
  summary: ThreadSummary;
  messageCount: number;
  lastMessageId: string;
  incrementCount: number;
  model: string;
}

export async function getThreadSummary(scopedThread: ScopedMessage): Promise<StoredSummary | null> {
  const [row] = await db
    .select({
      summary: mailThreadSummary.summary,
      messageCount: mailThreadSummary.messageCount,
      lastMessageId: mailThreadSummary.lastMessageId,
      incrementCount: mailThreadSummary.incrementCount,
      model: mailThreadSummary.model,
    })
    .from(mailThreadSummary)
    .where(
      and(
        eq(mailThreadSummary.mailboxId, scopedThread.mailboxId),
        eq(mailThreadSummary.threadKey, scopedThread.messageId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function saveThreadSummary(args: {
  scopedThread: ScopedMessage;
  summary: ThreadSummary;
  messageCount: number;
  lastMessageId: string;
  incrementCount: number;
  model: string;
}): Promise<void> {
  const now = new Date();
  await db
    .insert(mailThreadSummary)
    .values({
      id: crypto.randomUUID(),
      mailboxId: args.scopedThread.mailboxId,
      threadKey: args.scopedThread.messageId,
      summary: args.summary,
      messageCount: args.messageCount,
      lastMessageId: args.lastMessageId,
      incrementCount: args.incrementCount,
      model: args.model,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [mailThreadSummary.mailboxId, mailThreadSummary.threadKey],
      set: {
        summary: args.summary,
        messageCount: args.messageCount,
        lastMessageId: args.lastMessageId,
        incrementCount: args.incrementCount,
        model: args.model,
        updatedAt: now,
      },
    });
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function pruneCachedBodies(now: Date, retentionDays: number): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
  const cleared = await db
    .update(mailMessage)
    .set({ bodyHtml: null, bodyText: null })
    .where(
      and(
        lt(mailMessage.syncedAt, cutoff),
        or(isNotNull(mailMessage.bodyHtml), isNotNull(mailMessage.bodyText)),
      ),
    )
    .returning({ id: mailMessage.id });
  return cleared.length;
}
