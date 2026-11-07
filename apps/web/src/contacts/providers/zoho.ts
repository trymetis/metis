import { createHash } from "node:crypto";

import type { z } from "zod";

import { isZohoRegion, type ZohoRegion, zohoRegionOrder } from "@/connections/zoho-regions";
import { bind } from "@/lib/bind";
import { ProviderError } from "@/lib/errors/provider-error";
import { mergeHeaders } from "@/lib/headers";
import { getCache } from "@/services/cache";

import type { ContactsAdapter } from "../adapter";
import { filterContacts, lookupByListing } from "../fields";
import type {
  Contact,
  ContactDraft,
  ContactGroup,
  ListContactsOptions,
  ProviderBook,
} from "../types";
import {
  toContact,
  toZoho,
  ZOHO_BOOK_ID,
  zohoCategoriesSchema,
  zohoContactSchema,
  zohoCreatedSchema,
  zohoListSchema,
  zohoOneSchema,
} from "./zoho-map";

const PAGE_SIZE = 100;
const LIST_PAGES = 50;
const INCLUDE = "emails,phones,urls,address,categories";
const REGION_TTL_SEC = 24 * 60 * 60;

export function zohoContacts(accessToken: string): ContactsAdapter {
  return bind<ContactsAdapter, string>(
    {
      listBooks,
      listGroups,
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

const regionCache = new Map<string, ZohoRegion>();

function tokenKey(accessToken: string): string {
  const digest = createHash("sha256").update(accessToken).digest("base64url").slice(0, 32);
  return `zoho:contacts-region:${digest}`;
}

async function detectRegion(accessToken: string): Promise<ZohoRegion> {
  const local = regionCache.get(accessToken);
  if (local) return local;
  const key = tokenKey(accessToken);
  const shared = await getCache().get(key);
  if (shared && isZohoRegion(shared)) {
    regionCache.set(accessToken, shared);
    return shared;
  }
  const errors: string[] = [];
  for (const region of zohoRegionOrder()) {
    try {
      /* oxlint-disable eslint/no-await-in-loop -- probes each Zoho region in order and stops at the one that owns the account */
      const res = await fetch(`https://contacts.zoho.${region}/api/v1/accounts/self/categories`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      });
      if (res.ok) {
        regionCache.set(accessToken, region);
        await getCache().set(key, region, REGION_TTL_SEC);
        /* oxlint-enable eslint/no-await-in-loop */
        return region;
      }
      errors.push(`${region}:${res.status}`);
    } catch (err) {
      errors.push(`${region}:${err instanceof Error ? err.message : "err"}`);
    }
  }
  throw new Error(`Could not detect Zoho Contacts DC — tried: ${errors.join(", ")}`);
}

async function call<S extends z.ZodType>(
  schema: S,
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<z.infer<S> | undefined> {
  const region = await detectRegion(accessToken);
  const res = await fetch(`https://contacts.zoho.${region}/api/v1/accounts/self${path}`, {
    ...init,
    headers: mergeHeaders(
      {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "Content-Type": "application/json",
      },
      init?.headers,
    ),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      `[zoho-contacts] ${init?.method ?? "GET"} ${path.split("?")[0]} -> ${res.status}`,
    );
    throw new ProviderError("zoho", res.status, body, "Zoho Contacts");
  }
  const text = await res.text();
  if (!text) return undefined;
  return schema.parse(JSON.parse(text));
}

function listBooks(): Promise<ProviderBook[]> {
  return Promise.resolve([
    { id: ZOHO_BOOK_ID, name: "Contacts", description: null, primary: true, readOnly: false },
  ]);
}

async function listGroups(accessToken: string): Promise<ContactGroup[]> {
  const res = await call(zohoCategoriesSchema, accessToken, "/categories");
  return (res?.categories ?? []).flatMap((c) =>
    c.category_id ? [{ id: c.category_id, name: c.category_name ?? "", bookId: ZOHO_BOOK_ID }] : [],
  );
}

function parsed(raw: unknown): Contact | null {
  const row = zohoContactSchema.safeParse(raw);
  return row.success ? toContact(row.data) : null;
}

async function list(accessToken: string, opts: ListContactsOptions): Promise<Contact[]> {
  if (!opts.bookIds.includes(ZOHO_BOOK_ID)) return [];
  const contacts: Contact[] = [];
  for (let page = 1; page <= LIST_PAGES; page += 1) {
    const params = new URLSearchParams({
      include: INCLUDE,
      page: String(page),
      per_page: String(PAGE_SIZE),
      ...(opts.groupId ? { filter_categories: opts.groupId } : {}),
    });
    // oxlint-disable-next-line eslint/no-await-in-loop -- pages are read in order until has_more is false
    const res = await call(zohoListSchema, accessToken, `/contacts?${params.toString()}`);
    contacts.push(...(res?.contacts ?? []).flatMap((raw) => parsed(raw) ?? []));
    if (!res?.has_more) break;
  }
  return filterContacts(contacts, { query: opts.query, max: opts.max });
}

async function get(accessToken: string, _bookId: string, contactId: string): Promise<Contact> {
  const res = await call(
    zohoOneSchema,
    accessToken,
    `/contacts/${encodeURIComponent(contactId)}?include=${INCLUDE}`,
  );
  const contact = parsed(res?.contacts);
  if (!contact) throw new Error("Zoho returned no contact");
  return contact;
}

async function create(
  accessToken: string,
  _bookId: string,
  draft: ContactDraft,
): Promise<{ id: string; bookId: string }> {
  const res = await call(zohoCreatedSchema, accessToken, "/contacts?source=Metis", {
    method: "POST",
    body: JSON.stringify({ contacts: [toZoho(draft)] }),
  });
  const id = res?.contacts?.contact_id;
  if (!id) throw new Error("Zoho did not return the new contact's id");
  return { id, bookId: ZOHO_BOOK_ID };
}

async function update(
  accessToken: string,
  _bookId: string,
  contactId: string,
  draft: ContactDraft,
): Promise<void> {
  await call(zohoOneSchema, accessToken, `/contacts/${encodeURIComponent(contactId)}`, {
    method: "PUT",
    body: JSON.stringify({ contacts: toZoho(draft) }),
  });
}

async function remove(accessToken: string, _bookId: string, contactId: string): Promise<void> {
  await call(zohoOneSchema, accessToken, `/contacts/${encodeURIComponent(contactId)}`, {
    method: "DELETE",
  });
}
