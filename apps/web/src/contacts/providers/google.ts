import { auth, people, type people_v1 } from "@googleapis/people";

import { bind } from "@/lib/bind";

import type { ContactsAdapter } from "../adapter";
import { compact, displayNameOf, filterContacts, lookupByListing, serialized } from "../fields";
import type {
  Contact,
  ContactDraft,
  ContactGroup,
  ListContactsOptions,
  ProviderBook,
} from "../types";

export const GOOGLE_BOOK_ID = "default";

const PERSON_FIELDS = [
  "names",
  "nicknames",
  "emailAddresses",
  "phoneNumbers",
  "addresses",
  "organizations",
  "birthdays",
  "urls",
  "biographies",
  "memberships",
  "photos",
  "metadata",
].join(",");
const UPDATE_FIELDS = [
  "names",
  "nicknames",
  "emailAddresses",
  "phoneNumbers",
  "addresses",
  "organizations",
  "birthdays",
  "urls",
  "biographies",
].join(",");
const SYSTEM_GROUPS = new Set(["contactGroups/myContacts", "contactGroups/starred"]);
const PAGE_SIZE = 1000;
const LIST_PAGES = 10;

interface Handle {
  accessToken: string;
  self: string;
}

export function googleContacts(accessToken: string, self: string): ContactsAdapter {
  return bind<ContactsAdapter, Handle>(
    {
      listBooks,
      listGroups,
      list,
      get,
      create,
      update,
      delete: remove,
      lookup: (h, emails, bookIds) => lookupByListing((opts) => list(h, opts), emails, bookIds),
    },
    { accessToken, self },
  );
}

function client(h: Handle): people_v1.People {
  const oauth = new auth.OAuth2();
  oauth.setCredentials({ access_token: h.accessToken });
  return people({ version: "v1", auth: oauth });
}

function writeKey(h: Handle): string {
  return `google:${h.self}`;
}

function listBooks(): Promise<ProviderBook[]> {
  return Promise.resolve([
    { id: GOOGLE_BOOK_ID, name: "Contacts", description: null, primary: true, readOnly: false },
  ]);
}

async function listGroups(h: Handle): Promise<ContactGroup[]> {
  const res = await client(h).contactGroups.list({ pageSize: 1000 });
  return (res.data.contactGroups ?? []).flatMap((group) =>
    group.resourceName && group.groupType === "USER_CONTACT_GROUP"
      ? [
          {
            id: group.resourceName,
            name: group.formattedName ?? group.name ?? "",
            bookId: GOOGLE_BOOK_ID,
          },
        ]
      : [],
  );
}

async function list(h: Handle, opts: ListContactsOptions): Promise<Contact[]> {
  if (!opts.bookIds.includes(GOOGLE_BOOK_ID)) return [];
  const api = client(h);
  const contacts: Contact[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < LIST_PAGES; page += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each page needs the previous page's token
    const res = await api.people.connections.list({
      resourceName: "people/me",
      personFields: PERSON_FIELDS,
      pageSize: PAGE_SIZE,
      ...(pageToken ? { pageToken } : {}),
    });
    contacts.push(...(res.data.connections ?? []).flatMap((person) => toContact(person) ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }
  return filterContacts(contacts, opts);
}

async function get(h: Handle, _bookId: string, contactId: string): Promise<Contact> {
  const res = await client(h).people.get({ resourceName: contactId, personFields: PERSON_FIELDS });
  const contact = toContact(res.data);
  if (!contact) throw new Error("Google returned a contact without an id");
  return contact;
}

function create(
  h: Handle,
  _bookId: string,
  draft: ContactDraft,
): Promise<{ id: string; bookId: string }> {
  return serialized(writeKey(h), async () => {
    const res = await client(h).people.createContact({
      personFields: PERSON_FIELDS,
      requestBody: {
        ...toPerson(draft),
        memberships: draft.groupIds.map((id) => ({
          contactGroupMembership: { contactGroupResourceName: id },
        })),
      },
    });
    if (!res.data.resourceName) throw new Error("Google did not return the new contact's id");
    return { id: res.data.resourceName, bookId: GOOGLE_BOOK_ID };
  });
}

function update(h: Handle, _bookId: string, contactId: string, draft: ContactDraft): Promise<void> {
  return serialized(writeKey(h), async () => {
    const api = client(h);
    const current = await api.people.get({
      resourceName: contactId,
      personFields: "metadata,memberships",
    });
    await api.people.updateContact({
      resourceName: contactId,
      updatePersonFields: UPDATE_FIELDS,
      personFields: PERSON_FIELDS,
      requestBody: { ...toPerson(draft), etag: current.data.etag ?? undefined },
    });
    const before = new Set(groupIdsOf(current.data));
    const after = new Set(draft.groupIds);
    const added = [...after].filter((id) => !before.has(id));
    const removed = [...before].filter((id) => !after.has(id));
    for (const id of [...added, ...removed]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- the People API asks for one write at a time per user
      await api.contactGroups.members.modify({
        resourceName: id,
        requestBody: added.includes(id)
          ? { resourceNamesToAdd: [contactId] }
          : { resourceNamesToRemove: [contactId] },
      });
    }
  });
}

function remove(h: Handle, _bookId: string, contactId: string): Promise<void> {
  return serialized(writeKey(h), async () => {
    await client(h).people.deleteContact({ resourceName: contactId });
  });
}

function groupIdsOf(person: people_v1.Schema$Person): string[] {
  return (person.memberships ?? []).flatMap((m) => {
    const id = m.contactGroupMembership?.contactGroupResourceName;
    return id && !SYSTEM_GROUPS.has(id) ? [id] : [];
  });
}

function birthdayOf(person: people_v1.Schema$Person): string | undefined {
  const date = person.birthdays?.find((b) => b.date)?.date;
  if (!date?.month || !date.day) return undefined;
  const mm = String(date.month).padStart(2, "0");
  const dd = String(date.day).padStart(2, "0");
  return date.year ? `${String(date.year).padStart(4, "0")}-${mm}-${dd}` : `--${mm}-${dd}`;
}

function parseBirthday(value: string | undefined): people_v1.Schema$Date | null {
  const match = value?.match(/^(\d{4}|--)-?(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return {
    ...(year && year !== "--" ? { year: Number(year) } : {}),
    month: Number(month),
    day: Number(day),
  };
}

export function toContact(person: people_v1.Schema$Person): Contact | null {
  if (!person.resourceName) return null;
  const name = person.names?.[0];
  const org = person.organizations?.[0];
  const names = {
    display: name?.displayName ?? "",
    ...compact({
      given: name?.givenName ?? undefined,
      middle: name?.middleName ?? undefined,
      family: name?.familyName ?? undefined,
      prefix: name?.honorificPrefix ?? undefined,
      suffix: name?.honorificSuffix ?? undefined,
    }),
  };
  const emails = (person.emailAddresses ?? []).flatMap((e) =>
    e.value
      ? [
          compact({
            value: e.value,
            label: e.formattedType ?? e.type ?? undefined,
            primary: e.metadata?.primary ?? undefined,
          }),
        ]
      : [],
  );
  const organization = org?.name ?? undefined;
  return compact({
    id: person.resourceName,
    bookId: GOOGLE_BOOK_ID,
    etag: person.etag ?? undefined,
    name: { ...names, display: displayNameOf({ name: names, emails, organization }) },
    nickname: person.nicknames?.[0]?.value ?? undefined,
    emails,
    phones: (person.phoneNumbers ?? []).flatMap((p) =>
      p.value ? [compact({ value: p.value, label: p.formattedType ?? p.type ?? undefined })] : [],
    ),
    addresses: (person.addresses ?? []).map((a) =>
      compact({
        street: a.streetAddress ?? undefined,
        city: a.city ?? undefined,
        region: a.region ?? undefined,
        postalCode: a.postalCode ?? undefined,
        country: a.country ?? undefined,
        label: a.formattedType ?? a.type ?? undefined,
      }),
    ),
    organization,
    department: org?.department ?? undefined,
    title: org?.title ?? undefined,
    birthday: birthdayOf(person),
    urls: (person.urls ?? []).flatMap((u) =>
      u.value ? [compact({ value: u.value, label: u.formattedType ?? u.type ?? undefined })] : [],
    ),
    notes: person.biographies?.[0]?.value ?? undefined,
    groupIds: groupIdsOf(person),
    photoUrl: person.photos?.find((p) => !p.default)?.url ?? undefined,
    updatedAt: person.metadata?.sources?.[0]?.updateTime ?? undefined,
  });
}

export function toPerson(draft: ContactDraft): people_v1.Schema$Person {
  const birthday = parseBirthday(draft.birthday);
  const structured = Boolean(draft.name.given || draft.name.family);
  return {
    names: [
      compact({
        givenName: draft.name.given,
        middleName: draft.name.middle,
        familyName: draft.name.family,
        honorificPrefix: draft.name.prefix,
        honorificSuffix: draft.name.suffix,
        unstructuredName: structured ? undefined : draft.name.display || undefined,
      }),
    ],
    nicknames: draft.nickname ? [{ value: draft.nickname }] : [],
    emailAddresses: draft.emails.map((e) => compact({ value: e.value, type: e.label })),
    phoneNumbers: draft.phones.map((p) => compact({ value: p.value, type: p.label })),
    addresses: draft.addresses.map((a) =>
      compact({
        streetAddress: a.street,
        city: a.city,
        region: a.region,
        postalCode: a.postalCode,
        country: a.country,
        type: a.label,
      }),
    ),
    organizations:
      draft.organization || draft.title || draft.department
        ? [compact({ name: draft.organization, title: draft.title, department: draft.department })]
        : [],
    birthdays: birthday ? [{ date: birthday }] : [],
    urls: draft.urls.map((u) => compact({ value: u.value, type: u.label })),
    biographies: draft.notes ? [{ value: draft.notes, contentType: "TEXT_PLAIN" }] : [],
  };
}
