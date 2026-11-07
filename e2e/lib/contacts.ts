export const ADDRESS_BOOK_COLLECTIONS = [{ slug: "contacts", name: "Studio contacts" }] as const;

export type AddressBookCollection = (typeof ADDRESS_BOOK_COLLECTIONS)[number]["slug"];

export function addressBookCollectionUrl(
  baseUrl: string,
  user: string,
  slug: AddressBookCollection,
): string {
  return `${baseUrl.replace(/\/+$/, "")}/${user}/${slug}/`;
}

export interface SeededContact {
  uid: string;
  name: string;
  given?: string;
  family?: string;
  email?: string;
  phone?: string;
  organization?: string;
  title?: string;
}

export const SEEDED_CONTACTS: readonly SeededContact[] = [
  {
    uid: "raj-mehta",
    name: "Raj Mehta",
    given: "Raj",
    family: "Mehta",
    email: "raj@demo.trymetis.email",
    phone: "+351 912 345 678",
    organization: "Fernhill Studio",
    title: "Rebrand lead",
  },
  {
    uid: "priya-nair",
    name: "Priya Nair",
    given: "Priya",
    family: "Nair",
    email: "priya@demo.trymetis.email",
    organization: "Fernhill Studio",
  },
  {
    uid: "kenji-watanabe",
    name: "Kenji Watanabe",
    given: "Kenji",
    family: "Watanabe",
    email: "kenji@aozora-ceramics.jp",
    organization: "Aozora Ceramics",
    title: "Brand director",
  },
  {
    uid: "lena-hoffmann",
    name: "Lena Hoffmann",
    given: "Lena",
    family: "Hoffmann",
    email: "lena@kaltwasser-gmbh.de",
    organization: "Kaltwasser GmbH",
  },
  {
    uid: "harbour-hall-front-desk",
    name: "Harbour Hall front desk",
    phone: "+44 20 7946 0321",
    organization: "Harbour Hall Venues",
  },
];

export const UNSAVED_SENDER = "tomas@demo.trymetis.email";
