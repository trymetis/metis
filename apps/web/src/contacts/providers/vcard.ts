import ICAL from "ical.js";

import { compact, displayNameOf } from "../fields";
import type { Contact, ContactDraft } from "../types";
import { managedLines } from "../vcard-write";

export interface VCardObject {
  url: string;
  etag?: string;
  data?: unknown;
}

const MANAGED_PROPS = [
  "fn",
  "n",
  "nickname",
  "email",
  "tel",
  "adr",
  "org",
  "title",
  "bday",
  "url",
  "note",
];

function text(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (Array.isArray(value)) {
    return text(value.filter((v): v is string => typeof v === "string" && v !== "").join(" "));
  }
  return undefined;
}

function parts(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => (Array.isArray(v) ? v.join(",") : String(v ?? "")));
  }
  return typeof value === "string" ? value.split(";") : [];
}

function typeValues(prop: ICAL.Property): string[] {
  const raw: unknown = prop.getParameter("type");
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.flatMap((v) => String(v).split(",")).map((v) => v.toLowerCase());
}

function typeOf(prop: ICAL.Property): string | undefined {
  return typeValues(prop).find((v) => v !== "pref" && v !== "internet" && v !== "voice");
}

function isPref(prop: ICAL.Property): boolean {
  return typeValues(prop).includes("pref") || prop.getParameter("pref") === "1";
}

function birthdayOf(value: unknown): string | undefined {
  const raw =
    typeof value === "string"
      ? value
      : value instanceof ICAL.VCardTime || value instanceof ICAL.Time
        ? value.toString()
        : "";
  const full = raw.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (full) return `${full[1]}-${full[2]}-${full[3]}`;
  const partial = raw.match(/^--(\d{2})-?(\d{2})/);
  return partial ? `--${partial[1]}-${partial[2]}` : undefined;
}

export function parseVCard(card: VCardObject, bookId: string): Contact | null {
  if (typeof card.data !== "string" || !card.data.includes("BEGIN:VCARD")) return null;
  let vcard: ICAL.Component;
  try {
    vcard = new ICAL.Component(ICAL.parse(card.data));
  } catch {
    return null;
  }
  const n = parts(vcard.getFirstPropertyValue("n"));
  const org = parts(vcard.getFirstPropertyValue("org"));
  const name = {
    display: text(vcard.getFirstPropertyValue("fn")) ?? "",
    ...compact({
      family: n[0] || undefined,
      given: n[1] || undefined,
      middle: n[2] || undefined,
      prefix: n[3] || undefined,
      suffix: n[4] || undefined,
    }),
  };
  const emails = vcard.getAllProperties("email").flatMap((prop) => {
    const value = text(prop.getFirstValue());
    return value
      ? [
          compact({
            value: value.replace(/^mailto:/i, ""),
            label: typeOf(prop),
            primary: isPref(prop) || undefined,
          }),
        ]
      : [];
  });
  const organization = org[0] || undefined;
  return compact({
    id: card.url,
    bookId,
    etag: card.etag,
    name: { ...name, display: displayNameOf({ name, emails, organization }) },
    nickname: text(vcard.getFirstPropertyValue("nickname")),
    emails,
    phones: vcard.getAllProperties("tel").flatMap((prop) => {
      const value = text(prop.getFirstValue());
      return value ? [compact({ value: value.replace(/^tel:/i, ""), label: typeOf(prop) })] : [];
    }),
    addresses: vcard.getAllProperties("adr").map((prop) => {
      const adr = parts(prop.getFirstValue());
      return compact({
        street: [adr[1], adr[2]].filter(Boolean).join(" ") || undefined,
        city: adr[3] || undefined,
        region: adr[4] || undefined,
        postalCode: adr[5] || undefined,
        country: adr[6] || undefined,
        label: typeOf(prop),
      });
    }),
    organization,
    department: org[1] || undefined,
    title: text(vcard.getFirstPropertyValue("title")),
    birthday: birthdayOf(vcard.getFirstPropertyValue("bday")),
    urls: vcard.getAllProperties("url").flatMap((prop) => {
      const value = text(prop.getFirstValue());
      return value ? [compact({ value, label: typeOf(prop) })] : [];
    }),
    notes: text(vcard.getFirstPropertyValue("note")),
    groupIds: [],
  });
}

export function mergeVCard(existing: string, draft: ContactDraft): string {
  const vcard = new ICAL.Component(ICAL.parse(existing));
  for (const name of MANAGED_PROPS) vcard.removeAllProperties(name);
  const kept = vcard
    .toString()
    .split(/\r?\n/)
    .filter((line) => line && line !== "END:VCARD");
  return [...kept, ...managedLines(draft), "END:VCARD", ""].join("\r\n");
}
