import {
  ADDRESS_BOOK_COLLECTIONS,
  type AddressBookCollection,
  SEEDED_CONTACTS,
  type SeededContact,
} from "../lib/contacts";
import type { CaldavTarget } from "./calendar";

function collectionName(slug: AddressBookCollection): string {
  return ADDRESS_BOOK_COLLECTIONS.find((c) => c.slug === slug)?.name ?? slug;
}

async function dav(
  target: CaldavTarget,
  method: string,
  path: string,
  body?: string,
  contentType = "application/xml; charset=utf-8",
): Promise<Response> {
  return fetch(`${target.url}${path}`, {
    method,
    headers: {
      authorization: `Basic ${btoa(`${target.user}:${target.pass}`)}`,
      "content-type": contentType,
      depth: "0",
    },
    body,
  });
}

async function ensureAddressBook(
  target: CaldavTarget,
  slug: AddressBookCollection,
): Promise<string> {
  const collection = `/${target.user}/${slug}/`;
  const probe = await dav(target, "PROPFIND", collection);
  if (probe.status !== 404) return collection;
  const created = await dav(
    target,
    "MKCOL",
    collection,
    `<?xml version="1.0" encoding="utf-8"?>
<D:mkcol xmlns:D="DAV:" xmlns:CR="urn:ietf:params:xml:ns:carddav">
  <D:set><D:prop>
    <D:resourcetype><D:collection/><CR:addressbook/></D:resourcetype>
    <D:displayname>${collectionName(slug)}</D:displayname>
  </D:prop></D:set>
</D:mkcol>`,
  );
  if (!created.ok) throw new Error(`MKCOL ${collection} -> ${created.status}`);
  return collection;
}

function vcard(contact: SeededContact): string {
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `UID:${contact.uid}`,
    `FN:${contact.name}`,
    `N:${contact.family ?? ""};${contact.given ?? ""};;;`,
    ...(contact.email ? [`EMAIL;TYPE=WORK:${contact.email}`] : []),
    ...(contact.phone ? [`TEL;TYPE=CELL:${contact.phone}`] : []),
    ...(contact.organization ? [`ORG:${contact.organization}`] : []),
    ...(contact.title ? [`TITLE:${contact.title}`] : []),
    "END:VCARD",
    "",
  ].join("\r\n");
}

export async function seedContacts(target: CaldavTarget): Promise<void> {
  const collection = await ensureAddressBook(target, "contacts");
  for (const contact of SEEDED_CONTACTS) {
    const res = await dav(
      target,
      "PUT",
      `${collection}${contact.uid}.vcf`,
      vcard(contact),
      "text/vcard; charset=utf-8",
    );
    if (!res.ok) throw new Error(`PUT ${contact.uid}.vcf -> ${res.status} ${await res.text()}`);
  }
  console.log(`[seed] put ${SEEDED_CONTACTS.length} contacts into ${collection}`);
}
