import "server-only";
import { createDAVClient, type DAVAddressBook, type DAVVCard } from "tsdav";
import { Agent } from "undici";

import type { CaldavCredentials } from "@/connections";
import { bind } from "@/lib/bind";

import type { ContactsAdapter } from "../adapter";
import { filterContacts, lookupByListing } from "../fields";
import type {
  Contact,
  ContactDraft,
  ContactGroup,
  ListContactsOptions,
  ProviderBook,
} from "../types";
import { buildVCard } from "../vcard-write";
import { mergeVCard, parseVCard } from "./vcard";

type DAVClient = Awaited<ReturnType<typeof createDAVClient>>;
type DavBook = DAVAddressBook & { readOnly: boolean };

const CLIENT_TTL_MS = 5 * 60_000;
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });
const clients = new Map<
  string,
  { client: DAVClient; books: DavBook[] | null; expiresAt: number }
>();

export function carddavContacts(credentials: CaldavCredentials): ContactsAdapter {
  return bind<ContactsAdapter, CaldavCredentials>(
    {
      listBooks,
      listGroups: () => Promise.resolve<ContactGroup[]>([]),
      list,
      get,
      create,
      update,
      delete: remove,
      lookup: (c, emails, bookIds) => lookupByListing((opts) => list(c, opts), emails, bookIds),
    },
    credentials,
  );
}

function clientKey(credentials: CaldavCredentials): string {
  return JSON.stringify([
    credentials.url,
    credentials.user,
    credentials.pass,
    credentials.allowInsecureTls,
  ]);
}

function fetchOptions(credentials: CaldavCredentials): RequestInit {
  return credentials.allowInsecureTls ? { dispatcher: insecureAgent } : {};
}

async function getClient(credentials: CaldavCredentials): Promise<DAVClient> {
  const key = clientKey(credentials);
  const cached = clients.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.client;
  const client = await createDAVClient({
    serverUrl: credentials.url,
    credentials: { username: credentials.user, password: credentials.pass },
    authMethod: "Basic",
    defaultAccountType: "carddav",
    fetchOptions: fetchOptions(credentials),
  });
  clients.set(key, { client, books: null, expiresAt: Date.now() + CLIENT_TTL_MS });
  return client;
}

async function isReadOnly(
  client: DAVClient,
  credentials: CaldavCredentials,
  book: DAVAddressBook,
): Promise<boolean> {
  try {
    const [res] = await client.propfind({
      url: book.url,
      props: { "d:current-user-privilege-set": {} },
      depth: "0",
      fetchOptions: fetchOptions(credentials),
    });
    const privileges = res?.props?.currentUserPrivilegeSet;
    if (!privileges) return false;
    return !/"(write|write-content|all)"/.test(JSON.stringify(privileges));
  } catch {
    return false;
  }
}

async function davBooks(credentials: CaldavCredentials): Promise<DavBook[]> {
  const client = await getClient(credentials);
  const cached = clients.get(clientKey(credentials));
  if (cached?.books) return cached.books;
  const found = await client.fetchAddressBooks({ fetchOptions: fetchOptions(credentials) });
  const books = await Promise.all(
    found.map(async (book) => ({
      ...book,
      readOnly: await isReadOnly(client, credentials, book),
    })),
  );
  if (cached) cached.books = books;
  return books;
}

async function findBook(credentials: CaldavCredentials, bookId: string): Promise<DavBook> {
  const book = (await davBooks(credentials)).find((b) => b.url === bookId);
  if (!book) throw new Error("That address book is not on this server");
  return book;
}

function bookName(book: DAVAddressBook): string {
  if (typeof book.displayName === "string" && book.displayName.trim()) return book.displayName;
  const last = book.url.replace(/\/+$/, "").split("/").pop();
  return last ? decodeURIComponent(last) : "Contacts";
}

async function listBooks(credentials: CaldavCredentials): Promise<ProviderBook[]> {
  const books = await davBooks(credentials);
  const primary = Math.max(
    0,
    books.findIndex((book) => !book.readOnly),
  );
  return books.map((book, index) => ({
    id: book.url,
    name: bookName(book),
    description: typeof book.description === "string" ? book.description : null,
    primary: index === primary,
    readOnly: book.readOnly,
  }));
}

async function vcardsIn(
  credentials: CaldavCredentials,
  book: DAVAddressBook,
  objectUrls?: string[],
): Promise<DAVVCard[]> {
  const client = await getClient(credentials);
  return client.fetchVCards({
    addressBook: book,
    ...(objectUrls ? { objectUrls, useMultiGet: true } : {}),
    fetchOptions: fetchOptions(credentials),
  });
}

async function list(credentials: CaldavCredentials, opts: ListContactsOptions): Promise<Contact[]> {
  const books = await davBooks(credentials);
  const wanted = books.filter((book) => opts.bookIds.includes(book.url));
  const rows = await Promise.all(
    wanted.map(async (book) =>
      (await vcardsIn(credentials, book)).flatMap((card) => parseVCard(card, book.url) ?? []),
    ),
  );
  return filterContacts(rows.flat(), opts);
}

async function fetchCard(
  credentials: CaldavCredentials,
  bookId: string,
  contactId: string,
): Promise<DAVVCard> {
  const book = await findBook(credentials, bookId);
  const [card] = await vcardsIn(credentials, book, [contactId]);
  if (!card || typeof card.data !== "string") {
    throw new Error("That contact is not on this server");
  }
  return card;
}

async function get(
  credentials: CaldavCredentials,
  bookId: string,
  contactId: string,
): Promise<Contact> {
  const contact = parseVCard(await fetchCard(credentials, bookId, contactId), bookId);
  if (!contact) throw new Error("That contact could not be read");
  return contact;
}

async function create(
  credentials: CaldavCredentials,
  bookId: string,
  draft: ContactDraft,
): Promise<{ id: string; bookId: string }> {
  const client = await getClient(credentials);
  const book = await findBook(credentials, bookId);
  const uid = crypto.randomUUID();
  const filename = `${uid}.vcf`;
  const res = await client.createVCard({
    addressBook: book,
    filename,
    vCardString: buildVCard(draft, uid),
    fetchOptions: fetchOptions(credentials),
  });
  if (!res.ok) throw new Error(`The CardDAV server refused the new contact (${res.status})`);
  const base = book.url.endsWith("/") ? book.url : `${book.url}/`;
  return { id: new URL(filename, base).toString(), bookId };
}

async function update(
  credentials: CaldavCredentials,
  bookId: string,
  contactId: string,
  draft: ContactDraft,
): Promise<void> {
  const client = await getClient(credentials);
  const card = await fetchCard(credentials, bookId, contactId);
  const res = await client.updateVCard({
    vCard: { url: card.url, etag: card.etag, data: mergeVCard(String(card.data), draft) },
    fetchOptions: fetchOptions(credentials),
  });
  if (!res.ok) throw new Error(`The CardDAV server refused the change (${res.status})`);
}

async function remove(
  credentials: CaldavCredentials,
  bookId: string,
  contactId: string,
): Promise<void> {
  const client = await getClient(credentials);
  const card = await fetchCard(credentials, bookId, contactId);
  const res = await client.deleteVCard({
    vCard: { url: card.url, etag: card.etag },
    fetchOptions: fetchOptions(credentials),
  });
  if (!res.ok) throw new Error(`The CardDAV server refused the delete (${res.status})`);
}

export async function carddavVerify(credentials: CaldavCredentials): Promise<void> {
  clients.delete(clientKey(credentials));
  await davBooks(credentials);
}
