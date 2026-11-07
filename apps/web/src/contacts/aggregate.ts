import type { AddressBookProvider, ConnectionAuth } from "@/connections";
import { addressBookName, type NamedAddressBook } from "@/connections/address-book-name";
import { BadRequestError } from "@/lib/errors/bad-request";
import { NotVisibleError } from "@/lib/errors/not-visible";
import { sanitizeError } from "@/lib/errors/sanitize-error";

import { type ContactsAdapter, getContactsAdapter } from "./adapter";
import { byDisplayName, contactEmails, normalizedEmail } from "./fields";
import type {
  Contact,
  ContactGroup,
  ContactSourceError,
  ProviderBook,
  TaggedContact,
} from "./types";

export interface ResolvedAddressBook {
  accountId: string;
  linkId: string;
  accountSlug: string;
  accountEmail: string;
  provider: AddressBookProvider;
  server: string | null;
  visibleBookIds: string[];
  policy: { ai: boolean };
  auth: () => Promise<ConnectionAuth>;
}

export interface TaggedBook extends ProviderBook {
  accountId: string;
  accountSlug: string;
  accountEmail: string;
  provider: AddressBookProvider;
  visible: boolean;
}

export interface TaggedGroup extends ContactGroup {
  accountId: string;
}

function named(account: ResolvedAddressBook): NamedAddressBook {
  return { provider: account.provider, email: account.accountEmail, server: account.server };
}

export function resolvedAddressBookName(
  account: ResolvedAddressBook,
  all: readonly ResolvedAddressBook[],
): string {
  return addressBookName(named(account), all.map(named));
}

export async function adapterForAddressBook(
  account: ResolvedAddressBook,
): Promise<ContactsAdapter> {
  return getContactsAdapter(account.provider, await account.auth(), account.accountEmail);
}

export function isBookVisible(account: ResolvedAddressBook, bookId: string): boolean {
  return account.visibleBookIds.includes(bookId);
}

export function resolveAddressBookAccount(
  accounts: ResolvedAddressBook[],
  accountId?: string,
): ResolvedAddressBook {
  if (!accountId) {
    const only = accounts.length === 1 ? accounts[0] : null;
    if (!only) throw new BadRequestError("Pick which address book to use");
    return only;
  }
  const found = accounts.find((a) => a.accountId === accountId);
  if (!found) throw new NotVisibleError("No address book you can see with that id");
  return found;
}

export function assertBookVisible(account: ResolvedAddressBook, bookId: string): void {
  if (!isBookVisible(account, bookId)) {
    throw new NotVisibleError("That address book is not visible in this workspace");
  }
}

function bookKey(accountId: string, bookId: string): string {
  return `${accountId}|${bookId}`;
}

function tag(
  contact: Contact,
  account: ResolvedAddressBook,
  all: readonly ResolvedAddressBook[],
  bookNames: Map<string, string>,
): TaggedContact {
  return {
    ...contact,
    bookName: contact.bookName ?? bookNames.get(bookKey(account.accountId, contact.bookId)),
    accountId: account.accountId,
    accountSlug: account.accountSlug,
    accountEmail: account.accountEmail,
    accountName: resolvedAddressBookName(account, all),
  };
}

function errorFor(
  account: ResolvedAddressBook,
  all: readonly ResolvedAddressBook[],
  err: unknown,
): ContactSourceError {
  return {
    accountId: account.accountId,
    accountEmail: account.accountEmail,
    accountName: resolvedAddressBookName(account, all),
    error: sanitizeError(err),
  };
}

function requestedBookIds(account: ResolvedAddressBook, wanted?: string[]): string[] {
  if (!wanted) return account.visibleBookIds;
  return wanted.filter((id) => isBookVisible(account, id));
}

export async function listBooksAcross(accounts: ResolvedAddressBook[]): Promise<{
  books: TaggedBook[];
  groups: TaggedGroup[];
  errors: ContactSourceError[];
}> {
  const settled = await Promise.all(
    accounts.map(async (account) => {
      try {
        const adapter = await adapterForAddressBook(account);
        const [books, groups] = await Promise.all([adapter.listBooks(), adapter.listGroups()]);
        return {
          books: books.map((book) => ({
            ...book,
            accountId: account.accountId,
            accountSlug: account.accountSlug,
            accountEmail: account.accountEmail,
            provider: account.provider,
            visible: isBookVisible(account, book.id),
          })),
          groups: groups
            .filter((group) => isBookVisible(account, group.bookId))
            .map((group) => ({ ...group, accountId: account.accountId })),
          error: null as ContactSourceError | null,
        };
      } catch (err) {
        return {
          books: [] as TaggedBook[],
          groups: [] as TaggedGroup[],
          error: errorFor(account, accounts, err),
        };
      }
    }),
  );
  return {
    books: settled.flatMap((row) => row.books),
    groups: settled.flatMap((row) => row.groups),
    errors: settled.flatMap((row) => (row.error ? [row.error] : [])),
  };
}

export async function listContactsAcross(
  accounts: ResolvedAddressBook[],
  opts: { bookIds?: string[]; groupId?: string; query?: string; max?: number },
): Promise<{ contacts: TaggedContact[]; errors: ContactSourceError[] }> {
  const settled = await Promise.all(
    accounts.map(async (account) => {
      const bookIds = requestedBookIds(account, opts.bookIds);
      if (bookIds.length === 0) return { contacts: [] as TaggedContact[], error: null };
      try {
        const adapter = await adapterForAddressBook(account);
        const [books, contacts] = await Promise.all([
          adapter.listBooks(),
          adapter.list({ bookIds, groupId: opts.groupId, query: opts.query, max: opts.max }),
        ]);
        const names = new Map(books.map((b) => [bookKey(account.accountId, b.id), b.name]));
        return {
          contacts: contacts
            .filter((c) => isBookVisible(account, c.bookId))
            .map((c) => tag(c, account, accounts, names)),
          error: null as ContactSourceError | null,
        };
      } catch (err) {
        return { contacts: [] as TaggedContact[], error: errorFor(account, accounts, err) };
      }
    }),
  );
  const contacts = settled.flatMap((row) => row.contacts).toSorted(byDisplayName);
  return {
    contacts: opts.max ? contacts.slice(0, opts.max) : contacts,
    errors: settled.flatMap((row) => (row.error ? [row.error] : [])),
  };
}

export async function getContactIn(
  accounts: ResolvedAddressBook[],
  ref: { accountId?: string; bookId: string; contactId: string },
): Promise<TaggedContact> {
  const account = resolveAddressBookAccount(accounts, ref.accountId);
  assertBookVisible(account, ref.bookId);
  const adapter = await adapterForAddressBook(account);
  const [contact, books] = await Promise.all([
    adapter.get(ref.bookId, ref.contactId),
    adapter.listBooks(),
  ]);
  if (contact.bookId !== ref.bookId) {
    throw new NotVisibleError("That contact is not in this address book");
  }
  const names = new Map(books.map((b) => [bookKey(account.accountId, b.id), b.name]));
  return tag(contact, account, accounts, names);
}

export interface ContactLookupHit {
  email: string;
  account: ResolvedAddressBook;
  contact: Contact;
}

export async function lookupAcross(
  accounts: ResolvedAddressBook[],
  emails: string[],
): Promise<ContactLookupHit[]> {
  const wanted = new Set(emails.map(normalizedEmail));
  const settled = await Promise.all(
    accounts.map(async (account) => {
      if (account.visibleBookIds.length === 0) return [];
      try {
        const adapter = await adapterForAddressBook(account);
        const found = await adapter.lookup([...wanted], account.visibleBookIds);
        return found
          .filter((contact) => isBookVisible(account, contact.bookId))
          .flatMap((contact) =>
            contactEmails(contact)
              .filter((email) => wanted.has(email))
              .map((email) => ({ email, account, contact })),
          );
      } catch (err) {
        console.warn(`[contacts] lookup failed for ${account.accountId}: ${sanitizeError(err)}`);
        return [];
      }
    }),
  );
  return settled.flat();
}
