import "server-only";
import { z } from "zod";

import {
  adapterForAddressBook,
  assertBookVisible,
  getContactIn,
  listBooksAcross,
  listContactsAcross,
  type ResolvedAddressBook,
} from "@/contacts/aggregate";
import { DEFAULT_CONTACT_MAX, emptyDraft, primaryEmail, withDisplayName } from "@/contacts/fields";
import { forgetBookLists } from "@/contacts/list-cache";
import { truncate } from "@/lib/utils";
import type { ContactDraft, ContactDto } from "@/server/schema";
import {
  addressBookProviderSchema,
  addressBookSourceErrorSchema,
  contactSchema,
} from "@/server/schema";

import type { Output } from "./output";

const SEARCH_LIMIT = 50;

export const listAddressBooksOutput = z.object({
  accountCount: z.number(),
  books: z.array(
    z.object({
      addressBookId: z.string(),
      accountEmail: z.string(),
      provider: addressBookProviderSchema,
      bookId: z.string(),
      name: z.string(),
      primary: z.boolean(),
      readOnly: z.boolean(),
    }),
  ),
  groups: z.array(
    z.object({
      addressBookId: z.string(),
      bookId: z.string(),
      groupId: z.string(),
      name: z.string(),
    }),
  ),
  errors: z.array(addressBookSourceErrorSchema).optional(),
});

const contactRowSchema = z.object({
  addressBookId: z.string(),
  bookId: z.string(),
  bookName: z.string().optional(),
  contactId: z.string(),
  name: z.string(),
  email: z.string().optional(),
  emails: z.array(z.string()),
  phones: z.array(z.string()),
  organization: z.string().optional(),
  title: z.string().optional(),
});

export const searchContactsOutput = z.object({
  count: z.number(),
  contacts: z.array(contactRowSchema),
  errors: z.array(addressBookSourceErrorSchema).optional(),
});

export const getContactOutput = contactSchema
  .omit({ accountId: true, accountSlug: true, etag: true, photoUrl: true })
  .extend({ addressBookId: z.string(), contactId: z.string() });

export const createContactOutput = z.object({
  created: z.literal(true),
  addressBookId: z.string(),
  bookId: z.string(),
  contactId: z.string(),
  name: z.string(),
});

export const updateContactOutput = z.object({ updated: z.literal(true), contactId: z.string() });

export const deleteContactOutput = z.object({ deleted: z.literal(true), contactId: z.string() });

export interface ContactWriteInput {
  name?: string;
  givenName?: string;
  familyName?: string;
  emails?: string[];
  phones?: string[];
  organization?: string;
  title?: string;
  department?: string;
  birthday?: string;
  address?: string;
  website?: string;
  notes?: string;
  groupIds?: string[];
}

function row(contact: ContactDto): z.infer<typeof contactRowSchema> {
  return {
    addressBookId: contact.accountId ?? "",
    bookId: contact.bookId,
    bookName: contact.bookName,
    contactId: contact.id,
    name: contact.name.display,
    email: primaryEmail(contact),
    emails: contact.emails.map((e) => e.value),
    phones: contact.phones.map((p) => p.value),
    organization: contact.organization,
    title: contact.title,
  };
}

function applyInput(base: ContactDraft, input: ContactWriteInput): ContactDraft {
  const next: ContactDraft = { ...base, name: { ...base.name } };
  if (input.givenName !== undefined) next.name.given = input.givenName || undefined;
  if (input.familyName !== undefined) next.name.family = input.familyName || undefined;
  if (input.name !== undefined) next.name.display = input.name;
  else if (input.givenName !== undefined || input.familyName !== undefined) next.name.display = "";
  if (input.emails !== undefined) {
    next.emails = input.emails.map((value, index) => ({
      value,
      ...(index === 0 ? { primary: true } : {}),
    }));
  }
  if (input.phones !== undefined) next.phones = input.phones.map((value) => ({ value }));
  if (input.organization !== undefined) next.organization = input.organization || undefined;
  if (input.title !== undefined) next.title = input.title || undefined;
  if (input.department !== undefined) next.department = input.department || undefined;
  if (input.birthday !== undefined) next.birthday = input.birthday || undefined;
  if (input.address !== undefined) {
    next.addresses = input.address
      ? [{ street: input.address }, ...base.addresses.slice(1)]
      : base.addresses.slice(1);
  }
  if (input.website !== undefined) {
    next.urls = input.website
      ? [{ value: input.website }, ...base.urls.slice(1)]
      : base.urls.slice(1);
  }
  if (input.notes !== undefined) next.notes = input.notes || undefined;
  if (input.groupIds !== undefined) next.groupIds = input.groupIds;
  return withDisplayName(next);
}

function toDraft(contact: ContactDto): ContactDraft {
  return {
    name: contact.name,
    nickname: contact.nickname,
    emails: contact.emails,
    phones: contact.phones,
    addresses: contact.addresses,
    organization: contact.organization,
    department: contact.department,
    title: contact.title,
    birthday: contact.birthday,
    urls: contact.urls,
    notes: contact.notes,
    groupIds: contact.groupIds,
  };
}

export async function listAddressBooks(
  accounts: ResolvedAddressBook[],
): Promise<Output<typeof listAddressBooksOutput>> {
  const { books, groups, errors } = await listBooksAcross(accounts);
  return {
    accountCount: accounts.length,
    books: books
      .filter((b) => b.visible)
      .map((b) => ({
        addressBookId: b.accountId,
        accountEmail: b.accountEmail,
        provider: b.provider,
        bookId: b.id,
        name: b.name,
        primary: b.primary,
        readOnly: b.readOnly,
      })),
    groups: groups.map((g) => ({
      addressBookId: g.accountId,
      bookId: g.bookId,
      groupId: g.id,
      name: g.name,
    })),
    errors: errors.length ? errors : undefined,
  };
}

export async function searchContacts(
  accounts: ResolvedAddressBook[],
  args: { query?: string; bookId?: string; groupId?: string; limit?: number },
): Promise<Output<typeof searchContactsOutput>> {
  const limit = Math.min(args.limit ?? SEARCH_LIMIT, DEFAULT_CONTACT_MAX);
  const { contacts, errors } = await listContactsAcross(accounts, {
    bookIds: args.bookId ? [args.bookId] : undefined,
    groupId: args.groupId,
    query: args.query,
    max: limit,
  });
  return {
    count: contacts.length,
    contacts: contacts.map(row),
    errors: errors.length ? errors : undefined,
  };
}

export async function getContact(
  account: ResolvedAddressBook,
  bookId: string,
  contactId: string,
): Promise<Output<typeof getContactOutput>> {
  const contact = await getContactIn([account], {
    accountId: account.accountId,
    bookId,
    contactId,
  });
  const {
    accountId: _account,
    accountSlug: _slug,
    etag: _etag,
    photoUrl: _photo,
    ...rest
  } = contact;
  return {
    ...rest,
    notes: rest.notes ? truncate(rest.notes, 4000) : undefined,
    addressBookId: account.accountId,
    contactId: contact.id,
  };
}

export async function createContact(
  account: ResolvedAddressBook,
  bookId: string,
  input: ContactWriteInput,
): Promise<Output<typeof createContactOutput>> {
  assertBookVisible(account, bookId);
  const draft = applyInput(emptyDraft(), input);
  const adapter = await adapterForAddressBook(account);
  const created = await adapter.create(bookId, draft);
  return {
    created: true,
    addressBookId: account.accountId,
    bookId: created.bookId,
    contactId: created.id,
    name: draft.name.display,
  };
}

export async function updateContact(
  account: ResolvedAddressBook,
  bookId: string,
  contactId: string,
  input: ContactWriteInput,
): Promise<Output<typeof updateContactOutput>> {
  const current = await getContactIn([account], {
    accountId: account.accountId,
    bookId,
    contactId,
  });
  const adapter = await adapterForAddressBook(account);
  await adapter.update(bookId, contactId, applyInput(toDraft(current), input));
  return { updated: true, contactId };
}

export async function deleteContact(
  account: ResolvedAddressBook,
  bookId: string,
  contactId: string,
): Promise<Output<typeof deleteContactOutput>> {
  assertBookVisible(account, bookId);
  const adapter = await adapterForAddressBook(account);
  await adapter.delete(bookId, contactId);
  return { deleted: true, contactId };
}

export async function forgetContactCaches(workspaceId: string): Promise<void> {
  await forgetBookLists(workspaceId);
}
