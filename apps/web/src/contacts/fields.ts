import type { Contact, ContactDraft } from "./types";

export const DEFAULT_CONTACT_MAX = 2000;

export function emptyDraft(): ContactDraft {
  return {
    name: { display: "" },
    emails: [],
    phones: [],
    addresses: [],
    urls: [],
    groupIds: [],
  };
}

function joined(parts: (string | undefined)[]): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
}

export function displayNameOf(
  fields: Pick<ContactDraft, "name" | "emails" | "organization">,
): string {
  const parts = joined([
    fields.name.prefix,
    fields.name.given,
    fields.name.middle,
    fields.name.family,
    fields.name.suffix,
  ]);
  return (
    fields.name.display.trim() ||
    parts ||
    fields.organization?.trim() ||
    fields.emails[0]?.value.trim() ||
    ""
  );
}

export function primaryEmail(contact: Pick<ContactDraft, "emails">): string | undefined {
  return (contact.emails.find((e) => e.primary) ?? contact.emails[0])?.value;
}

export function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function contactEmails(contact: Pick<ContactDraft, "emails">): string[] {
  return contact.emails.map((e) => normalizedEmail(e.value)).filter(Boolean);
}

export function matchesQuery(contact: Contact, query: string | undefined): boolean {
  const needle = query?.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    contact.name.display,
    contact.name.given,
    contact.name.family,
    contact.nickname,
    contact.organization,
    contact.title,
    ...contact.emails.map((e) => e.value),
    ...contact.phones.map((p) => p.value),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  return needle.split(/\s+/).every((word) => haystack.includes(word));
}

export function filterContacts(
  contacts: Contact[],
  opts: { groupId?: string; query?: string; max?: number },
): Contact[] {
  const kept = contacts.filter(
    (c) => (!opts.groupId || c.groupIds.includes(opts.groupId)) && matchesQuery(c, opts.query),
  );
  return opts.max ? kept.slice(0, opts.max) : kept;
}

export function byDisplayName(
  a: { name: { display: string } },
  b: { name: { display: string } },
): number {
  return a.name.display.localeCompare(b.name.display, undefined, { sensitivity: "base" });
}

export function withDisplayName<T extends ContactDraft>(draft: T): T {
  return { ...draft, name: { ...draft.name, display: displayNameOf(draft) } };
}

export function compact<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || entry === null || entry === "") continue;
    out[key] = entry;
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- dropping empty keys keeps every remaining key's type
  return out as T;
}

export async function lookupByListing(
  list: (opts: { bookIds: string[] }) => Promise<Contact[]>,
  emails: string[],
  bookIds: string[],
): Promise<Contact[]> {
  if (emails.length === 0 || bookIds.length === 0) return [];
  const wanted = new Set(emails.map(normalizedEmail));
  const all = await list({ bookIds });
  return all.filter((contact) => contactEmails(contact).some((email) => wanted.has(email)));
}

const queues = new Map<string, Promise<unknown>>();

export function serialized<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(run, run);
  const settled = next.catch(() => undefined);
  queues.set(key, settled);
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });
  return next;
}
