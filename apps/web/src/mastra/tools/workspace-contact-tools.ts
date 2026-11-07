import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import * as contacts from "@/ops/contacts";

import { getWorkspaceCtx } from "../runtime-context";
import { requireAddressBook, withToolErrors } from "../toolkit/resolve";
import {
  addressBookTarget,
  contactFields,
  contactTarget,
  searchContactsFields,
} from "../toolkit/schema";

const listAddressBooksTool = createTool({
  id: "listAddressBooks",
  description:
    "List every address book connected to this workspace with AI on, the books inside each one this workspace can see, and their groups. Call this when you need an addressBookId or bookId the conversation has not already given you.",
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      return contacts.listAddressBooks(ctx.addressBooks);
    }),
});

const searchContactsTool = createTool({
  id: "searchContacts",
  description:
    "Search the saved contacts in this workspace's address books by part of a name, email, phone number or organization. Without a query it lists contacts. Use it to find someone's address before drafting or inviting.",
  inputSchema: z.object(searchContactsFields),
  execute: async ({ query, addressBookId, bookId, groupId, limit }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      if (addressBookId || bookId) {
        const r = requireAddressBook(ctx.addressBooks, addressBookId);
        if ("error" in r) return r;
        return contacts.searchContacts([r.account], { query, bookId, groupId, limit });
      }
      return contacts.searchContacts(ctx.addressBooks, { query, groupId, limit });
    }),
});

const getContactTool = createTool({
  id: "getContact",
  description: "Fetch one saved contact in full. Needs bookId and contactId from searchContacts.",
  inputSchema: z.object(contactTarget),
  execute: async ({ addressBookId, bookId, contactId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireAddressBook(ctx.addressBooks, addressBookId);
      if ("error" in r) return r;
      return contacts.getContact(r.account, bookId, contactId);
    }),
});

const createContactTool = createTool({
  id: "createContact",
  description: "Save a new contact to an address book.",
  inputSchema: z.object({
    ...addressBookTarget,
    ...contactFields,
    summary: z.string().describe("Short description of the contact that will be saved and where"),
  }),
  requireApproval: true,
  execute: async ({ addressBookId, bookId, summary: _summary, ...input }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireAddressBook(ctx.addressBooks, addressBookId);
      if ("error" in r) return r;
      const result = await contacts.createContact(r.account, bookId, input);
      await contacts.forgetContactCaches(ctx.workspaceId);
      return result;
    }),
});

const updateContactTool = createTool({
  id: "updateContact",
  description:
    "Change fields on a saved contact. Only the fields you pass are modified; a list you pass replaces the old list.",
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
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireAddressBook(ctx.addressBooks, addressBookId);
      if ("error" in r) return r;
      const result = await contacts.updateContact(r.account, bookId, contactId, input);
      await contacts.forgetContactCaches(ctx.workspaceId);
      return result;
    }),
});

const deleteContactTool = createTool({
  id: "deleteContact",
  description: "Delete a saved contact from its address book at the provider.",
  inputSchema: z.object({
    ...contactTarget,
    summary: z.string().describe("Short description of the contact that will be deleted"),
  }),
  requireApproval: true,
  execute: async ({ addressBookId, bookId, contactId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireAddressBook(ctx.addressBooks, addressBookId);
      if ("error" in r) return r;
      const result = await contacts.deleteContact(r.account, bookId, contactId);
      await contacts.forgetContactCaches(ctx.workspaceId);
      return result;
    }),
});

export const workspaceContactTools = {
  listAddressBooks: listAddressBooksTool,
  searchContacts: searchContactsTool,
  getContact: getContactTool,
  createContact: createContactTool,
  updateContact: updateContactTool,
  deleteContact: deleteContactTool,
};
