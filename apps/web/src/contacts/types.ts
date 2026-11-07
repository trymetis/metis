import type { ContactDraft, ContactDto, ContactGroupDto, ProviderBook } from "@/server/schema";

export type Contact = Omit<
  ContactDto,
  "accountId" | "accountSlug" | "accountEmail" | "accountName"
>;
export type TaggedContact = ContactDto;
export type { ContactDraft, ProviderBook };
export type ContactGroup = Omit<ContactGroupDto, "accountId">;

export interface ListContactsOptions {
  bookIds: string[];
  groupId?: string;
  query?: string;
  max?: number;
}

export interface ContactSourceError {
  accountId: string;
  accountEmail: string;
  accountName?: string;
  error: string;
}
