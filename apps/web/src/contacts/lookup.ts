import "server-only";
import { ALL_ADDRESS_BOOKS_SLUG } from "@/workspace/path";

import { listBooksAcross, listContactsAcross, type ResolvedAddressBook } from "./aggregate";
import { contactEmails, normalizedEmail } from "./fields";
import { type BookList, cachedBookList, cachedSavedIndex, type SavedIndex } from "./list-cache";
import { workspaceAddressBookAccounts } from "./session";

const INDEX_MAX = 10_000;

export type SavedContactEntry = SavedIndex["entries"][number];

async function buildIndex(accounts: ResolvedAddressBook[]): Promise<SavedIndex> {
  const { contacts, errors } = await listContactsAcross(accounts, { max: INDEX_MAX });
  return {
    entries: contacts.flatMap((contact) => {
      const emails = contactEmails(contact);
      return (emails.length > 0 ? emails : [""]).map((email) => ({
        email,
        name: contact.name.display,
        addressBookSlug: contact.accountSlug ?? "",
        accountId: contact.accountId ?? "",
        bookId: contact.bookId,
        bookName: contact.bookName ?? "",
        contactId: contact.id,
        phones: contact.phones.map((p) => p.value),
        ...(contact.organization ? { organization: contact.organization } : {}),
        ...(contact.title ? { title: contact.title } : {}),
      }));
    }),
    complete: errors.length === 0,
  };
}

export async function savedContactIndex(workspaceId: string): Promise<SavedContactEntry[]> {
  const accounts = await workspaceAddressBookAccounts(workspaceId);
  if (accounts.length === 0) return [];
  const index = await cachedSavedIndex(workspaceId, () => buildIndex(accounts));
  return index.entries;
}

export async function lookupSavedContacts(
  workspaceId: string,
  emails: string[],
): Promise<SavedContactEntry[]> {
  const wanted = new Set(emails.map(normalizedEmail));
  const entries = await savedContactIndex(workspaceId);
  return entries.filter((entry) => entry.email && wanted.has(entry.email));
}

export async function workspaceBookList(workspaceId: string): Promise<BookList> {
  const accounts = await workspaceAddressBookAccounts(workspaceId);
  if (accounts.length === 0) return { books: [], groups: [], errors: [] };
  return cachedBookList(workspaceId, ALL_ADDRESS_BOOKS_SLUG, () => listBooksAcross(accounts));
}
