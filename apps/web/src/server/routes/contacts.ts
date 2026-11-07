import "server-only";
import { ORPCError } from "@orpc/server";

import {
  adapterForAddressBook,
  assertBookVisible,
  getContactIn,
  listBooksAcross,
  listContactsAcross,
  resolveAddressBookAccount,
} from "@/contacts/aggregate";
import { withDisplayName } from "@/contacts/fields";
import { cachedBookList, forgetBookLists } from "@/contacts/list-cache";
import { lookupSavedContacts } from "@/contacts/lookup";

import { addressBookSession } from "../middlewares/address-book-session";
import { workspaceSession } from "../middlewares/workspace-session";
import {
  addressBookScopeSchema,
  contactRefInputSchema,
  contactSchema,
  createContactInputSchema,
  createContactOutputSchema,
  listContactsInputSchema,
  listContactsOutputSchema,
  listSessionBooksOutputSchema,
  lookupContactsInputSchema,
  lookupContactsOutputSchema,
  successSchema,
  updateContactInputSchema,
} from "../schema";

function fail(err: unknown): ORPCError<"BAD_GATEWAY", unknown> {
  return new ORPCError("BAD_GATEWAY", { cause: err });
}

export const contactsRouter = {
  books: addressBookSession(addressBookScopeSchema)
    .output(listSessionBooksOutputSchema)
    .handler(async ({ context }) => {
      const { addressBook } = context;
      const { books, groups, errors } = await cachedBookList(
        addressBook.workspaceId,
        addressBook.addressBookSlug,
        () => listBooksAcross(addressBook.accounts),
      );
      return { books, groups, errors: errors.length ? errors : undefined };
    }),

  list: addressBookSession(listContactsInputSchema)
    .output(listContactsOutputSchema)
    .handler(async ({ input, context }) => {
      const accounts = input.accountId
        ? [resolveAddressBookAccount(context.addressBook.accounts, input.accountId)]
        : context.addressBook.accounts;
      const { contacts, errors } = await listContactsAcross(accounts, {
        bookIds: input.bookIds,
        groupId: input.groupId,
        query: input.query,
        max: input.max,
      });
      return { contacts, errors: errors.length ? errors : undefined };
    }),

  get: addressBookSession(contactRefInputSchema)
    .output(contactSchema)
    .handler(async ({ input, context }) => {
      try {
        return await getContactIn(context.addressBook.accounts, input);
      } catch (err) {
        throw fail(err);
      }
    }),

  create: addressBookSession(createContactInputSchema)
    .output(createContactOutputSchema)
    .handler(async ({ input, context }) => {
      const account = resolveAddressBookAccount(context.addressBook.accounts, input.accountId);
      assertBookVisible(account, input.bookId);
      try {
        const adapter = await adapterForAddressBook(account);
        const created = await adapter.create(input.bookId, withDisplayName(input.contact));
        await forgetBookLists(context.addressBook.workspaceId);
        return { ...created, accountId: account.accountId, addressBookSlug: account.accountSlug };
      } catch (err) {
        throw fail(err);
      }
    }),

  update: addressBookSession(updateContactInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const account = resolveAddressBookAccount(context.addressBook.accounts, input.accountId);
      assertBookVisible(account, input.bookId);
      try {
        const adapter = await adapterForAddressBook(account);
        await adapter.update(input.bookId, input.contactId, withDisplayName(input.contact));
        await forgetBookLists(context.addressBook.workspaceId);
        return { success: true as const };
      } catch (err) {
        throw fail(err);
      }
    }),

  delete: addressBookSession(contactRefInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const account = resolveAddressBookAccount(context.addressBook.accounts, input.accountId);
      assertBookVisible(account, input.bookId);
      try {
        const adapter = await adapterForAddressBook(account);
        await adapter.delete(input.bookId, input.contactId);
        await forgetBookLists(context.addressBook.workspaceId);
        return { success: true as const };
      } catch (err) {
        throw fail(err);
      }
    }),

  lookup: workspaceSession(lookupContactsInputSchema)
    .output(lookupContactsOutputSchema)
    .handler(async ({ input, context }) => ({
      matches: await lookupSavedContacts(context.appUser.workspaceId, input.emails),
    })),
};
