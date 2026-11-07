import { z } from "zod";

import { lenient } from "@/lib/zod";

import { compact, displayNameOf } from "../fields";
import type { Contact, ContactDraft } from "../types";

export const ZOHO_BOOK_ID = "personal";

const zohoValueSchema = z.union([z.string(), z.number()]).transform(String);

export const zohoContactSchema = z.object({
  contact_id: zohoValueSchema,
  first_name: lenient(z.string()),
  middle_name: lenient(z.string()),
  last_name: lenient(z.string()),
  nick_name: lenient(z.string()),
  display_name: lenient(z.string()),
  company: lenient(z.string()),
  job_title: lenient(z.string()),
  department: lenient(z.string()),
  notes: lenient(z.string()),
  birth_year: lenient(zohoValueSchema),
  birth_month: lenient(zohoValueSchema),
  birth_day: lenient(zohoValueSchema),
  photo_url: lenient(z.string()),
  updated_time: lenient(z.number()),
  emails: lenient(
    z.array(
      z.object({
        email_id: lenient(z.string()),
        is_primary: lenient(z.boolean()),
        type: lenient(z.string()),
      }),
    ),
  ),
  phones: lenient(z.array(z.object({ number: lenient(z.string()), type: lenient(z.string()) }))),
  urls: lenient(z.array(z.object({ url: lenient(z.string()), type: lenient(z.string()) }))),
  address: lenient(
    z.array(
      z.object({
        street_addr: lenient(z.string()),
        city: lenient(z.string()),
        state: lenient(z.string()),
        postal_code: lenient(z.string()),
        country: lenient(z.string()),
        type: lenient(z.string()),
      }),
    ),
  ),
  categories: lenient(z.array(z.object({ category_id: lenient(zohoValueSchema) }))),
});

export const zohoListSchema = z.object({
  contacts: lenient(z.array(z.unknown())),
  has_more: lenient(z.boolean()),
});
export const zohoOneSchema = z.object({ contacts: lenient(z.unknown()) });
export const zohoCreatedSchema = z.object({
  contacts: lenient(z.object({ contact_id: lenient(zohoValueSchema) })),
});
export const zohoCategoriesSchema = z.object({
  categories: lenient(
    z.array(
      z.object({ category_id: lenient(zohoValueSchema), category_name: lenient(z.string()) }),
    ),
  ),
});

export type ZohoContact = z.infer<typeof zohoContactSchema>;

function birthdayOf(row: ZohoContact): string | undefined {
  if (!row.birth_month || !row.birth_day) return undefined;
  const mm = row.birth_month.padStart(2, "0");
  const dd = row.birth_day.padStart(2, "0");
  return row.birth_year ? `${row.birth_year.padStart(4, "0")}-${mm}-${dd}` : `--${mm}-${dd}`;
}

export function toContact(row: ZohoContact): Contact {
  const emails = (row.emails ?? []).flatMap((e) =>
    e.email_id ? [compact({ value: e.email_id, label: e.type, primary: e.is_primary })] : [],
  );
  const name = {
    display: row.display_name ?? "",
    ...compact({ given: row.first_name, middle: row.middle_name, family: row.last_name }),
  };
  return compact({
    id: row.contact_id,
    bookId: ZOHO_BOOK_ID,
    name: { ...name, display: displayNameOf({ name, emails, organization: row.company }) },
    nickname: row.nick_name,
    emails,
    phones: (row.phones ?? []).flatMap((p) =>
      p.number ? [compact({ value: p.number, label: p.type })] : [],
    ),
    addresses: (row.address ?? []).map((a) =>
      compact({
        street: a.street_addr,
        city: a.city,
        region: a.state,
        postalCode: a.postal_code,
        country: a.country,
        label: a.type,
      }),
    ),
    organization: row.company,
    department: row.department,
    title: row.job_title,
    birthday: birthdayOf(row),
    urls: (row.urls ?? []).flatMap((u) =>
      u.url ? [compact({ value: u.url, label: u.type })] : [],
    ),
    notes: row.notes,
    groupIds: (row.categories ?? []).flatMap((c) => (c.category_id ? [c.category_id] : [])),
    photoUrl: row.photo_url && !row.photo_url.endsWith("/user.gif") ? row.photo_url : undefined,
    updatedAt:
      row.updated_time && row.updated_time > 0
        ? new Date(row.updated_time).toISOString()
        : undefined,
  });
}

export function toZoho(draft: ContactDraft): Record<string, unknown> {
  const birthday = draft.birthday?.match(/^(\d{4}|--)-?(\d{2})-(\d{2})$/);
  return {
    first_name: draft.name.given ?? (draft.name.family ? "" : draft.name.display),
    middle_name: draft.name.middle ?? "",
    last_name: draft.name.family ?? "",
    nick_name: draft.nickname ?? "",
    emails: draft.emails.map((e, index) => ({
      email_id: e.value,
      is_primary: e.primary ?? index === 0,
    })),
    phones: draft.phones.map((p) => ({ number: p.value, type: p.label ?? "mobile" })),
    address: draft.addresses.map((a) =>
      compact({
        street_addr: a.street,
        city: a.city,
        state: a.region,
        postal_code: a.postalCode,
        country: a.country,
        type: a.label ?? "home",
      }),
    ),
    company: draft.organization ?? "",
    job_title: draft.title ?? "",
    notes: draft.notes ?? "",
    ...(birthday
      ? {
          ...(birthday[1] && birthday[1] !== "--" ? { birth_year: birthday[1] } : {}),
          birth_month: birthday[2],
          birth_day: birthday[3],
        }
      : {}),
  };
}
