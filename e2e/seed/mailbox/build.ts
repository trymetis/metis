import { createHash } from "node:crypto";

import { address, domainOf, type Person } from "../../lib/cast";
import { base64Lines, CRLF, entity, type Header, multipartBody, type Part } from "../edge/mime";

export type Folder = "INBOX" | "Sent" | "Drafts" | "Archive" | "Junk" | "Trash";

export interface SeededMail {
  folder: Folder;
  flags: string[];
  date: Date;
  messageId: string;
  subject: string;
  raw: Buffer;
}

export interface MailSpec {
  key: string;
  from: Person;
  to: Person[];
  cc?: Person[];
  bcc?: Person[];
  replyTo?: Person;
  subject: string;
  date: string;
  folder?: Folder;
  seen?: boolean;
  starred?: boolean;
  answered?: boolean;
  inReplyTo?: SeededMail;
  headers?: Header[];
  text?: string;
  html?: string;
  inline?: Part[];
  attachments?: Part[];
}

export function at(iso: string): Date {
  return new Date(`${iso.length === 16 ? `${iso}:00` : iso}Z`);
}

function localId(key: string): string {
  const hex = createHash("sha256").update(key).digest("hex").slice(0, 20);
  return BigInt(`0x${hex}`).toString(36);
}

const NON_ASCII = /[^\x20-\x7e]/;

export function encodeWord(value: string): string {
  if (!NON_ASCII.test(value)) return value;
  return `=?utf-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function mailbox(p: Person): string {
  if (!NON_ASCII.test(p.name)) return address(p);
  return `${encodeWord(p.name)} <${p.email}>`;
}

function list(people: Person[]): string {
  return people.map(mailbox).join(", ");
}

function textBody(text: string, type: "plain" | "html"): Part {
  return {
    headers: [
      ["Content-Type", `text/${type}; charset=utf-8`],
      ["Content-Transfer-Encoding", "8bit"],
    ],
    body: text.replace(/\r?\n/g, CRLF),
  };
}

function multipart(kind: string, key: string, parts: Part[]): Part {
  const boundary = `=_${kind}_${localId(`${key}/${kind}`)}`;
  return {
    headers: [["Content-Type", `multipart/${kind}; boundary="${boundary}"`]],
    body: multipartBody(boundary, parts),
  };
}

function bodyOf(spec: MailSpec): Part {
  const views: Part[] = [];
  if (spec.text !== undefined) views.push(textBody(spec.text, "plain"));
  if (spec.html !== undefined) views.push(textBody(spec.html, "html"));
  const [only] = views;
  if (!only) throw new Error(`${spec.key} has no body`);
  let body = views.length === 1 ? only : multipart("alternative", spec.key, views);
  if (spec.inline?.length) body = multipart("related", spec.key, [body, ...spec.inline]);
  if (spec.attachments?.length) body = multipart("mixed", spec.key, [body, ...spec.attachments]);
  return body;
}

const parentReferences = new Map<string, string[]>();

export function file(name: string, mimeType: string, data: Buffer | string): Part {
  const ascii = !NON_ASCII.test(name);
  const filename = ascii
    ? `filename="${name}"`
    : `filename="${encodeWord(name)}"; filename*=utf-8''${encodeURIComponent(name)}`;
  return {
    headers: [
      ["Content-Type", `${mimeType}; name="${ascii ? name : encodeWord(name)}"`],
      ["Content-Transfer-Encoding", "base64"],
      ["Content-Disposition", `attachment; ${filename}`],
    ],
    body: base64Lines(Buffer.from(data)),
  };
}

export function inline(cid: string, mimeType: string, data: Buffer): Part {
  return {
    headers: [
      ["Content-Type", mimeType],
      ["Content-Transfer-Encoding", "base64"],
      ["Content-ID", `<${cid}>`],
      ["Content-Disposition", "inline"],
    ],
    body: base64Lines(data),
  };
}

export function mail(spec: MailSpec): SeededMail {
  const messageId = `<${localId(spec.key)}@${domainOf(spec.from.email)}>`;
  const date = at(spec.date);
  const parent = spec.inReplyTo;
  const references = parent
    ? [...(parentReferences.get(parent.messageId) ?? []), parent.messageId]
    : [];
  parentReferences.set(messageId, references);
  const body = bodyOf(spec);
  const headers: Header[] = [
    ["From", mailbox(spec.from)],
    ["To", list(spec.to)],
    ...(spec.cc?.length ? [["Cc", list(spec.cc)] satisfies Header] : []),
    ...(spec.bcc?.length ? [["Bcc", list(spec.bcc)] satisfies Header] : []),
    ...(spec.replyTo ? [["Reply-To", mailbox(spec.replyTo)] satisfies Header] : []),
    ["Subject", encodeWord(spec.subject)],
    ["Date", date.toUTCString().replace("GMT", "+0000")],
    ["Message-ID", messageId],
    ...(parent
      ? [
          ["In-Reply-To", parent.messageId] satisfies Header,
          ["References", references.join(" ")] satisfies Header,
        ]
      : []),
    ...(spec.headers ?? []),
    ["MIME-Version", "1.0"],
    ...body.headers,
  ];
  const folder = spec.folder ?? "INBOX";
  const flags = [
    ...((spec.seen ?? true) ? ["\\Seen"] : []),
    ...(spec.starred ? ["\\Flagged"] : []),
    ...(spec.answered ? ["\\Answered"] : []),
    ...(folder === "Drafts" ? ["\\Draft"] : []),
  ];
  return {
    folder,
    flags,
    date,
    messageId,
    subject: spec.subject,
    raw: entity(headers, body.body),
  };
}

export function reply(subject: string): string {
  return /^(re|aw|回复|رد):/i.test(subject) ? subject : `Re: ${subject}`;
}
