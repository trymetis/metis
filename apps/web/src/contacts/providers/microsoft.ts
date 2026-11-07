import { Client } from "@microsoft/microsoft-graph-client";
import type {
  ContactFolder,
  Contact as GraphContact,
  PhysicalAddress,
} from "@microsoft/microsoft-graph-types";

import { bind } from "@/lib/bind";

import type { ContactsAdapter } from "../adapter";
import { compact, displayNameOf, filterContacts, lookupByListing } from "../fields";
import type {
  Contact,
  ContactDraft,
  ContactGroup,
  ListContactsOptions,
  ProviderBook,
} from "../types";

export const MICROSOFT_DEFAULT_BOOK_ID = "default";

const LIST_PAGES = 10;
const PAGE_SIZE = 1000;
const ADDRESS_LABELS = ["home", "work", "other"] as const;

interface Page<T> {
  value?: T[];
  "@odata.nextLink"?: string;
}

export function microsoftContacts(accessToken: string): ContactsAdapter {
  return bind<ContactsAdapter, string>(
    {
      listBooks,
      listGroups: () => Promise.resolve<ContactGroup[]>([]),
      list,
      get,
      create,
      update,
      delete: remove,
      lookup: (token, emails, bookIds) =>
        lookupByListing((opts) => list(token, opts), emails, bookIds),
    },
    accessToken,
  );
}

function graph(accessToken: string): Client {
  return Client.init({ authProvider: (done) => done(null, accessToken) });
}

function contactsPath(bookId: string): string {
  return bookId === MICROSOFT_DEFAULT_BOOK_ID
    ? "/me/contacts"
    : `/me/contactFolders/${encodeURIComponent(bookId)}/contacts`;
}

async function listBooks(accessToken: string): Promise<ProviderBook[]> {
  const client = graph(accessToken);
  const top: Page<ContactFolder> = await client.api("/me/contactFolders").top(100).get();
  const folders = top.value ?? [];
  const children = await Promise.all(
    folders.map(async (folder) => {
      if (!folder.id) return [];
      const page: Page<ContactFolder> = await client
        .api(`/me/contactFolders/${encodeURIComponent(folder.id)}/childFolders`)
        .top(100)
        .get();
      return page.value ?? [];
    }),
  );
  return [
    {
      id: MICROSOFT_DEFAULT_BOOK_ID,
      name: "Contacts",
      description: null,
      primary: true,
      readOnly: false,
    },
    ...[...folders, ...children.flat()].flatMap((folder) =>
      folder.id
        ? [
            {
              id: folder.id,
              name: folder.displayName ?? "Contacts",
              description: null,
              primary: false,
              readOnly: false,
            },
          ]
        : [],
    ),
  ];
}

async function listBook(client: Client, bookId: string): Promise<Contact[]> {
  const contacts: Contact[] = [];
  let next: string | undefined = contactsPath(bookId);
  for (let page = 0; next && page < LIST_PAGES; page += 1) {
    const request = client.api(next);
    // oxlint-disable-next-line eslint/no-await-in-loop -- each page needs the previous page's next link
    const res: Page<GraphContact> = await (page === 0 ? request.top(PAGE_SIZE) : request).get();
    contacts.push(...(res.value ?? []).flatMap((raw) => toContact(raw, bookId) ?? []));
    next = res["@odata.nextLink"];
  }
  return contacts;
}

async function list(accessToken: string, opts: ListContactsOptions): Promise<Contact[]> {
  const client = graph(accessToken);
  const books = await Promise.all(opts.bookIds.map((bookId) => listBook(client, bookId)));
  return filterContacts(books.flat(), opts);
}

async function get(accessToken: string, bookId: string, contactId: string): Promise<Contact> {
  const raw: GraphContact = await graph(accessToken)
    .api(`/me/contacts/${encodeURIComponent(contactId)}`)
    .get();
  const contact = toContact(raw, bookId);
  if (!contact) throw new Error("Outlook returned a contact without an id");
  return contact;
}

async function create(
  accessToken: string,
  bookId: string,
  draft: ContactDraft,
): Promise<{ id: string; bookId: string }> {
  const created: GraphContact = await graph(accessToken)
    .api(contactsPath(bookId))
    .post(toGraph(draft));
  if (!created.id) throw new Error("Outlook did not return the new contact's id");
  return { id: created.id, bookId };
}

async function update(
  accessToken: string,
  _bookId: string,
  contactId: string,
  draft: ContactDraft,
): Promise<void> {
  await graph(accessToken)
    .api(`/me/contacts/${encodeURIComponent(contactId)}`)
    .patch(toGraph(draft));
}

async function remove(accessToken: string, _bookId: string, contactId: string): Promise<void> {
  await graph(accessToken)
    .api(`/me/contacts/${encodeURIComponent(contactId)}`)
    .delete();
}

function address(raw: PhysicalAddress | null | undefined, label: string) {
  if (!raw) return [];
  const value = compact({
    street: raw.street ?? undefined,
    city: raw.city ?? undefined,
    region: raw.state ?? undefined,
    postalCode: raw.postalCode ?? undefined,
    country: raw.countryOrRegion ?? undefined,
  });
  return Object.keys(value).length > 0 ? [{ ...value, label }] : [];
}

export function toContact(raw: GraphContact, bookId: string): Contact | null {
  if (!raw.id) return null;
  const emails = (raw.emailAddresses ?? []).flatMap((e, index) =>
    e.address ? [compact({ value: e.address, primary: index === 0 ? true : undefined })] : [],
  );
  const name = {
    display: raw.displayName ?? "",
    ...compact({
      given: raw.givenName ?? undefined,
      middle: raw.middleName ?? undefined,
      family: raw.surname ?? undefined,
      prefix: raw.title ?? undefined,
      suffix: raw.generation ?? undefined,
    }),
  };
  const organization = raw.companyName ?? undefined;
  return compact({
    id: raw.id,
    bookId,
    etag: raw.changeKey ?? undefined,
    name: { ...name, display: displayNameOf({ name, emails, organization }) },
    nickname: raw.nickName ?? undefined,
    emails,
    phones: [
      ...(raw.mobilePhone ? [{ value: raw.mobilePhone, label: "mobile" }] : []),
      ...(raw.businessPhones ?? []).map((value) => ({ value, label: "work" })),
      ...(raw.homePhones ?? []).map((value) => ({ value, label: "home" })),
    ],
    addresses: [
      ...address(raw.homeAddress, "home"),
      ...address(raw.businessAddress, "work"),
      ...address(raw.otherAddress, "other"),
    ],
    organization,
    department: raw.department ?? undefined,
    title: raw.jobTitle ?? undefined,
    birthday: raw.birthday ? raw.birthday.slice(0, 10) : undefined,
    urls: raw.businessHomePage ? [{ value: raw.businessHomePage, label: "work" }] : [],
    notes: raw.personalNotes ?? undefined,
    groupIds: [],
    updatedAt: raw.lastModifiedDateTime ?? undefined,
  });
}

function graphAddress(draft: ContactDraft, label: string): PhysicalAddress {
  const found = draft.addresses.find(
    (a, index) => (a.label?.toLowerCase() ?? ADDRESS_LABELS[index]) === label,
  );
  if (!found) return {};
  return compact({
    street: found.street,
    city: found.city,
    state: found.region,
    postalCode: found.postalCode,
    countryOrRegion: found.country,
  });
}

export function toGraph(draft: ContactDraft): GraphContact {
  const phones = (label: string) =>
    draft.phones.filter((p) => (p.label?.toLowerCase() ?? "mobile") === label).map((p) => p.value);
  const birthday = /^\d{4}-\d{2}-\d{2}$/.test(draft.birthday ?? "")
    ? `${draft.birthday}T00:00:00Z`
    : null;
  return {
    displayName: draft.name.display || undefined,
    givenName: draft.name.given ?? null,
    middleName: draft.name.middle ?? null,
    surname: draft.name.family ?? null,
    title: draft.name.prefix ?? null,
    generation: draft.name.suffix ?? null,
    nickName: draft.nickname ?? null,
    emailAddresses: draft.emails.map((e) => ({
      address: e.value,
      name: draft.name.display || e.value,
    })),
    mobilePhone: phones("mobile")[0] ?? null,
    businessPhones: phones("work"),
    homePhones: phones("home"),
    homeAddress: graphAddress(draft, "home"),
    businessAddress: graphAddress(draft, "work"),
    otherAddress: graphAddress(draft, "other"),
    companyName: draft.organization ?? null,
    department: draft.department ?? null,
    jobTitle: draft.title ?? null,
    birthday,
    businessHomePage: draft.urls[0]?.value ?? null,
    personalNotes: draft.notes ?? null,
  };
}
