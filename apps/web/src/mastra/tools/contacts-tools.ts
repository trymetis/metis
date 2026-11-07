import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import * as contacts from "@/ops/contacts";

import { getContactsCtx } from "../runtime-context";
import { requireAddressBook, withToolErrors } from "../toolkit/resolve";
import {
  addressBookTarget,
  contactFields,
  contactTarget,
  searchContactsFields,
} from "../toolkit/schema";

const listPanelAddressBooksTool = createTool({
  id: "listAddressBooks",
  description:
    "List the address books and books this view can see, with their groups. Call this before anything that needs an addressBookId or bookId.",
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getContactsCtx(requestContext);
      const { accountCount: _accountCount, ...rest } = await contacts.listAddressBooks(
        ctx.accounts,
      );
      return {
        scope: ctx.isAggregate
          ? "every address book in this workspace"
          : ctx.accounts[0]?.accountEmail,
        ...rest,
      };
    }),
});

const searchPanelContactsTool = createTool({
  id: "searchContacts",
  description:
    "Search the contacts in this view by part of a name, email, phone number or organization. Without a query it lists contacts.",
  inputSchema: z.object(searchContactsFields),
  execute: async ({ query, addressBookId, bookId, groupId, limit }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getContactsCtx(requestContext);
      if (addressBookId || bookId) {
        const r = requireAddressBook(ctx.accounts, addressBookId);
        if ("error" in r) return r;
        return contacts.searchContacts([r.account], { query, bookId, groupId, limit });
      }
      return contacts.searchContacts(ctx.accounts, { query, groupId, limit });
    }),
});

const getPanelContactTool = createTool({
  id: "getContact",
  description: "Fetch one contact in full. Needs bookId and contactId from searchContacts.",
  inputSchema: z.object(contactTarget),
  execute: async ({ addressBookId, bookId, contactId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getContactsCtx(requestContext);
      const r = requireAddressBook(ctx.accounts, addressBookId);
      if ("error" in r) return r;
      return contacts.getContact(r.account, bookId, contactId);
    }),
});

const createPanelContactTool = createTool({
  id: "createContact",
  description: "Save a new contact to a book in this view.",
  inputSchema: z.object({
    ...addressBookTarget,
    ...contactFields,
    summary: z.string().describe("Short description of the contact that will be saved and where"),
  }),
  requireApproval: true,
  execute: async ({ addressBookId, bookId, summary: _summary, ...input }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getContactsCtx(requestContext);
      const r = requireAddressBook(ctx.accounts, addressBookId);
      if ("error" in r) return r;
      const result = await contacts.createContact(r.account, bookId, input);
      await contacts.forgetContactCaches(ctx.workspaceId);
      return result;
    }),
});

const updatePanelContactTool = createTool({
  id: "updateContact",
  description:
    "Change fields on a contact. Only the fields you pass are modified; a list you pass replaces the old list.",
  inputSchema: z.object({
    ...contactTarget,
    ...contactFields,
    summary: z.string().describe("Short description of what will change"),
  }),
  requireApproval: true,
  execute: async (
    { addressBookId, bookId, contactId, summary: _summary, ...input },
    { requestContext },
  ) =>
    withToolErrors(async () => {
      const ctx = getContactsCtx(requestContext);
      const r = requireAddressBook(ctx.accounts, addressBookId);
      if ("error" in r) return r;
      const result = await contacts.updateContact(r.account, bookId, contactId, input);
      await contacts.forgetContactCaches(ctx.workspaceId);
      return result;
    }),
});

const deletePanelContactTool = createTool({
  id: "deleteContact",
  description: "Delete a contact from its address book at the provider.",
  inputSchema: z.object({
    ...contactTarget,
    summary: z.string().describe("Short description of the contact that will be deleted"),
  }),
  requireApproval: true,
  execute: async ({ addressBookId, bookId, contactId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getContactsCtx(requestContext);
      const r = requireAddressBook(ctx.accounts, addressBookId);
      if ("error" in r) return r;
      const result = await contacts.deleteContact(r.account, bookId, contactId);
      await contacts.forgetContactCaches(ctx.workspaceId);
      return result;
    }),
});

export const contactsTools = {
  listAddressBooks: listPanelAddressBooksTool,
  searchContacts: searchPanelContactsTool,
  getContact: getPanelContactTool,
  createContact: createPanelContactTool,
  updateContact: updatePanelContactTool,
  deleteContact: deletePanelContactTool,
};
