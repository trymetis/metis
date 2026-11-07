import {
  type AddressBookProvider,
  type ConnectionAuth,
  carddavCredentials,
  oauthToken,
} from "@/connections";

import { carddavContacts } from "./providers/carddav";
import { googleContacts } from "./providers/google";
import { microsoftContacts } from "./providers/microsoft";
import { zohoContacts } from "./providers/zoho";
import type {
  Contact,
  ContactDraft,
  ContactGroup,
  ListContactsOptions,
  ProviderBook,
} from "./types";

export interface ContactsAdapter {
  listBooks(): Promise<ProviderBook[]>;
  listGroups(): Promise<ContactGroup[]>;
  list(opts: ListContactsOptions): Promise<Contact[]>;
  get(bookId: string, contactId: string): Promise<Contact>;
  create(bookId: string, draft: ContactDraft): Promise<{ id: string; bookId: string }>;
  update(bookId: string, contactId: string, draft: ContactDraft): Promise<void>;
  delete(bookId: string, contactId: string): Promise<void>;
  lookup(emails: string[], bookIds: string[]): Promise<Contact[]>;
}

const CONTACTS_ADAPTERS: Record<
  AddressBookProvider,
  (auth: ConnectionAuth, selfEmail: string) => ContactsAdapter
> = {
  google: (auth, self) => googleContacts(oauthToken(auth), self),
  microsoft: (auth) => microsoftContacts(oauthToken(auth)),
  zoho: (auth) => zohoContacts(oauthToken(auth)),
  carddav: (auth) => carddavContacts(carddavCredentials(auth)),
};

export function getContactsAdapter(
  provider: AddressBookProvider,
  auth: ConnectionAuth,
  selfEmail = "",
): ContactsAdapter {
  return CONTACTS_ADAPTERS[provider](auth, selfEmail);
}
