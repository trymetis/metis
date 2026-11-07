import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { requireAddressBook, withToolErrors } from "@/mastra/toolkit/resolve";
import {
  addressBookTarget,
  contactFields,
  contactTarget,
  searchContactsFields,
} from "@/mastra/toolkit/schema";
import * as contacts from "@/ops/contacts";

import { mcpScopeFromCall } from "../context";
import { inWorkspace, workspaceTarget } from "../schema";

export const listAddressBooks = createTool({
  id: "listAddressBooks",
  description:
    "List the address books connected to one Metis Suite workspace with AI on, the books inside each that the workspace can see, and their groups. Call this first to learn which addressBookId and bookId values exist.",
  inputSchema: z.object(workspaceTarget),
  execute: async ({ workspaceId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      return contacts.listAddressBooks(ctx.addressBooks);
    }),
});

export const searchContacts = createTool({
  id: "searchContacts",
  description:
    "Search the saved contacts in a workspace's address books by part of a name, email, phone number or organization. Without a query it lists contacts.",
  inputSchema: inWorkspace(searchContactsFields),
  execute: async (
    { workspaceId, query, addressBookId, bookId, groupId, limit },
    { requestContext },
  ) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      if (addressBookId || bookId) {
        const r = requireAddressBook(ctx.addressBooks, addressBookId);
        if ("error" in r) return r;
        return contacts.searchContacts([r.account], { query, bookId, groupId, limit });
      }
      return contacts.searchContacts(ctx.addressBooks, { query, groupId, limit });
    }),
});

export const getContact = createTool({
  id: "getContact",
  description: "Fetch one saved contact in full. Needs bookId and contactId from searchContacts.",
  inputSchema: inWorkspace(contactTarget),
  execute: async ({ workspaceId, addressBookId, bookId, contactId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireAddressBook(ctx.addressBooks, addressBookId);
      if ("error" in r) return r;
      return contacts.getContact(r.account, bookId, contactId);
    }),
});

export const createContact = createTool({
  id: "createContact",
  description: "Save a new contact to an address book in a workspace.",
  inputSchema: inWorkspace({
    ...addressBookTarget,
    ...contactFields,
    summary: z.string().describe("Short description of the contact that will be saved and where"),
  }),
  requireApproval: true,
  execute: async (
    { workspaceId, addressBookId, bookId, summary: _summary, ...input },
    { requestContext },
  ) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireAddressBook(ctx.addressBooks, addressBookId);
      if ("error" in r) return r;
      const result = await contacts.createContact(r.account, bookId, input);
      await contacts.forgetContactCaches(ctx.workspaceId);
      return result;
    }),
});

export const updateContact = createTool({
  id: "updateContact",
  description:
    "Change fields on a saved contact. Only the fields you pass are modified; a list you pass replaces the old list.",
  inputSchema: inWorkspace({
    ...contactTarget,
    ...contactFields,
    summary: z.string().describe("Short description of what will change"),
  }),
  requireApproval: true,
  execute: async (
    { workspaceId, addressBookId, bookId, contactId, summary: _summary, ...input },
    { requestContext },
  ) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireAddressBook(ctx.addressBooks, addressBookId);
      if ("error" in r) return r;
      const result = await contacts.updateContact(r.account, bookId, contactId, input);
      await contacts.forgetContactCaches(ctx.workspaceId);
      return result;
    }),
});

export const deleteContact = createTool({
  id: "deleteContact",
  description: "Delete a saved contact from its address book at the provider.",
  inputSchema: inWorkspace({
    ...contactTarget,
    summary: z.string().describe("Short description of the contact that will be deleted"),
  }),
  requireApproval: true,
  execute: async ({ workspaceId, addressBookId, bookId, contactId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireAddressBook(ctx.addressBooks, addressBookId);
      if ("error" in r) return r;
      const result = await contacts.deleteContact(r.account, bookId, contactId);
      await contacts.forgetContactCaches(ctx.workspaceId);
      return result;
    }),
});
