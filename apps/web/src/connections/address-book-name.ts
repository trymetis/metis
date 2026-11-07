import type { AddressBookProvider } from "@/connections/types";

export const ADDRESS_BOOK_PROVIDER_LABELS: Record<AddressBookProvider, string> = {
  google: "Google Contacts",
  microsoft: "Outlook Contacts",
  zoho: "Zoho Contacts",
  carddav: "CardDAV",
};

export interface NamedAddressBook {
  provider: AddressBookProvider;
  email: string;
  server: string | null;
}

function baseName(book: NamedAddressBook): string {
  return book.server ?? `${ADDRESS_BOOK_PROVIDER_LABELS[book.provider]} · ${book.email}`;
}

export function addressBookName(book: NamedAddressBook, all: readonly NamedAddressBook[]): string {
  const base = baseName(book);
  if (book.server === null) return base;
  const clash = all.some(
    (other) =>
      other.server !== null && other.provider !== book.provider && baseName(other) === base,
  );
  return clash ? `${base} · ${ADDRESS_BOOK_PROVIDER_LABELS[book.provider]}` : base;
}
