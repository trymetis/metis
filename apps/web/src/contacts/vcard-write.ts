import { displayNameOf } from "./fields";
import type { ContactDraft } from "./types";

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,");
}

function escapePart(value: string | undefined): string {
  return escapeText(value ?? "").replace(/;/g, "\\;");
}

function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

function typed(name: string, label: string | undefined): string {
  const type = label?.trim().replace(/[^A-Za-z0-9-]/g, "");
  return type ? `${name};TYPE=${type.toUpperCase()}` : name;
}

export function managedLines(draft: ContactDraft): string[] {
  const display = displayNameOf(draft) || "Unnamed";
  const name = [
    draft.name.family,
    draft.name.given,
    draft.name.middle,
    draft.name.prefix,
    draft.name.suffix,
  ];
  const lines = [`FN:${escapeText(display)}`, `N:${name.map(escapePart).join(";")}`];
  if (draft.nickname) lines.push(`NICKNAME:${escapeText(draft.nickname)}`);
  for (const email of draft.emails) {
    const type = email.primary ? [email.label, "pref"].filter(Boolean).join(",") : email.label;
    lines.push(`${typed("EMAIL", type)}:${escapeText(email.value)}`);
  }
  for (const phone of draft.phones) {
    lines.push(`${typed("TEL", phone.label)}:${escapeText(phone.value)}`);
  }
  for (const a of draft.addresses) {
    const adr = ["", "", a.street, a.city, a.region, a.postalCode, a.country];
    lines.push(`${typed("ADR", a.label)}:${adr.map(escapePart).join(";")}`);
  }
  if (draft.organization || draft.department) {
    lines.push(`ORG:${escapePart(draft.organization)};${escapePart(draft.department)}`);
  }
  if (draft.title) lines.push(`TITLE:${escapeText(draft.title)}`);
  if (draft.birthday) lines.push(`BDAY:${draft.birthday.replace(/[^0-9-]/g, "")}`);
  for (const url of draft.urls) lines.push(`${typed("URL", url.label)}:${url.value}`);
  if (draft.notes) lines.push(`NOTE:${escapeText(draft.notes)}`);
  return lines.map(fold);
}

export function buildVCard(draft: ContactDraft, uid: string): string {
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "PRODID:-//Metis Suite//Contacts//EN",
    `UID:${uid}`,
    ...managedLines(draft),
    "END:VCARD",
    "",
  ].join("\r\n");
}
