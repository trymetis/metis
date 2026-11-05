import "server-only";
import { z } from "zod";

import { getCache } from "@/services/cache";
import { enforceRateLimit } from "@/services/rate-limit";
import type { Recipient } from "@/types/mail";

import type { MailAdapter } from "./adapter";

export interface ContactSuggestion {
  email: string;
  name?: string;
}

const CONTACTS_TTL_SEC = 10 * 60;

const contactsSchema = z.array(z.object({ email: z.string(), name: z.string().optional() }));

function contactsKey(mailboxId: string): string {
  return `contacts:${mailboxId}`;
}

function cacheFailed(err: unknown): void {
  console.warn(`[mail/contacts] cache: ${err instanceof Error ? err.message : String(err)}`);
}

async function cachedContacts(
  mailboxIds: string[],
  field: string,
): Promise<ContactSuggestion[] | null> {
  try {
    const stored = await Promise.all(
      mailboxIds.map((id) => getCache().hget(contactsKey(id), field)),
    );
    const [first] = stored;
    if (!first || stored.some((value) => value !== first)) return null;
    const parsed = contactsSchema.safeParse(JSON.parse(first));
    return parsed.success ? parsed.data : null;
  } catch (err) {
    cacheFailed(err);
    return null;
  }
}

async function storeContacts(
  mailboxIds: string[],
  field: string,
  contacts: ContactSuggestion[],
): Promise<void> {
  const value = JSON.stringify(contacts);
  await Promise.all(
    mailboxIds.map((id) =>
      getCache().hsetExpiring(contactsKey(id), field, value, CONTACTS_TTL_SEC),
    ),
  ).catch(cacheFailed);
}

export async function forgetContacts(mailboxId: string): Promise<void> {
  await getCache().del(contactsKey(mailboxId)).catch(cacheFailed);
}

export async function suggestContacts(opts: {
  userId: string;
  mailboxIds: string[];
  adapter: MailAdapter;
}): Promise<ContactSuggestion[]> {
  const mailboxIds = opts.mailboxIds.toSorted();
  const field = mailboxIds.join(",");
  const cached = await cachedContacts(mailboxIds, field);
  if (cached) return cached;

  await enforceRateLimit(
    opts.userId,
    { scope: "mail-contacts", limit: 20, windowSec: 60 },
    "Too many requests. Please wait a moment.",
  );

  const [sent, inbox] = await Promise.all([
    opts.adapter.listMessages("sent", undefined, 50).catch(() => null),
    opts.adapter.listMessages("inbox", undefined, 50).catch(() => null),
  ]);

  const counts = new Map<string, { email: string; name?: string; count: number }>();
  const add = (rawEmail: string | undefined, name: string | undefined, weight: number) => {
    const email = (rawEmail ?? "").trim().toLowerCase();
    if (!email.includes("@")) return;
    const entry = counts.get(email) ?? {
      email,
      name: undefined as string | undefined,
      count: 0,
    };
    const trimmed = (name ?? "").trim();
    if (!entry.name && trimmed && trimmed.toLowerCase() !== email) {
      entry.name = trimmed;
    }
    entry.count += weight;
    counts.set(email, entry);
  };

  for (const e of sent?.emails ?? []) {
    const to = e.toRecipients ?? e.to.map((email): Recipient => ({ email }));
    const cc = e.ccRecipients ?? (e.cc ?? []).map((email): Recipient => ({ email }));
    for (const r of to) add(r.email, r.name, 2);
    for (const r of cc) add(r.email, r.name, 1);
  }
  for (const e of inbox?.emails ?? []) {
    add(e.from, e.fromName, 1);
  }

  const contacts = [...counts.values()]
    .toSorted((a, b) => b.count - a.count)
    .slice(0, 200)
    .map(({ email, name }) => ({ email, name }));

  if (sent && inbox) await storeContacts(mailboxIds, field, contacts);
  return contacts;
}
