import "server-only";
import { savedContactIndex } from "@/contacts/lookup";
import type { MailAdapter } from "@/mail/adapter";
import { suggestContacts } from "@/mail/contacts";

export interface SavedContactRef {
  addressBookSlug: string;
  accountId: string;
  bookId: string;
  contactId: string;
}

export interface PersonSuggestion {
  email: string;
  name?: string;
  saved?: SavedContactRef;
}

export async function savedPeople(workspaceId: string): Promise<PersonSuggestion[]> {
  const entries = await savedContactIndex(workspaceId).catch((err: unknown) => {
    console.warn("[people] saved contacts unavailable", err);
    return [];
  });
  return entries
    .flatMap((entry) => (entry.email ? [entry] : []))
    .map((entry) => ({
      email: entry.email,
      ...(entry.name && entry.name !== entry.email ? { name: entry.name } : {}),
      saved: {
        addressBookSlug: entry.addressBookSlug,
        accountId: entry.accountId,
        bookId: entry.bookId,
        contactId: entry.contactId,
      },
    }));
}

export function mergePeople(...lists: PersonSuggestion[][]): PersonSuggestion[] {
  const seen = new Set<string>();
  const out: PersonSuggestion[] = [];
  for (const person of lists.flat()) {
    const email = person.email.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({ ...person, email });
  }
  return out;
}

export async function suggestPeople(opts: {
  userId: string;
  workspaceId: string;
  mailboxIds: string[];
  adapter: MailAdapter | null;
  between?: PersonSuggestion[];
}): Promise<PersonSuggestion[]> {
  const [saved, history] = await Promise.all([
    savedPeople(opts.workspaceId),
    opts.adapter
      ? suggestContacts({
          userId: opts.userId,
          mailboxIds: opts.mailboxIds,
          adapter: opts.adapter,
        }).catch((err: unknown) => {
          console.warn("[people] mail history unavailable", err);
          return [];
        })
      : Promise.resolve([]),
  ]);
  return mergePeople(saved, opts.between ?? [], history);
}
