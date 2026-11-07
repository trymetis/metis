import { z } from "zod";

import { isRecord } from "@/lib/guards";

export const SCALAR_KINDS = ["text", "number", "integer", "boolean", "date", "json"] as const;
export type ScalarKind = (typeof SCALAR_KINDS)[number];

export const RECORD_KINDS = [
  "mail",
  "attachment",
  "thread",
  "draft",
  "event",
  "attendee",
  "file",
  "folder",
  "person",
  "contact",
  "blob",
  "answer",
] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export type ValueType =
  | { kind: ScalarKind }
  | { kind: RecordKind }
  | { kind: "list"; of: ValueType }
  | { kind: "object"; fields: Record<string, ValueType> };

export const T = {
  text: { kind: "text" },
  number: { kind: "number" },
  integer: { kind: "integer" },
  boolean: { kind: "boolean" },
  date: { kind: "date" },
  json: { kind: "json" },
  mail: { kind: "mail" },
  attachment: { kind: "attachment" },
  thread: { kind: "thread" },
  draft: { kind: "draft" },
  event: { kind: "event" },
  attendee: { kind: "attendee" },
  file: { kind: "file" },
  folder: { kind: "folder" },
  person: { kind: "person" },
  contact: { kind: "contact" },
  blob: { kind: "blob" },
  answer: { kind: "answer" },
  list: (of: ValueType): ValueType => ({ kind: "list", of }),
  object: (fields: Record<string, ValueType>): ValueType => ({ kind: "object", fields }),
} as const satisfies Record<string, ValueType | ((...args: never[]) => ValueType)>;

export const RECORD_FIELDS: Record<RecordKind, Record<string, ValueType>> = {
  mail: {
    id: T.text,
    mailboxId: T.text,
    mailbox: T.text,
    threadId: T.text,
    from: T.text,
    fromName: T.text,
    to: T.list(T.text),
    cc: T.list(T.text),
    subject: T.text,
    snippet: T.text,
    body: T.text,
    date: T.date,
    isRead: T.boolean,
    isStarred: T.boolean,
    labels: T.list(T.text),
    folder: T.text,
    hasAttachments: T.boolean,
    attachments: T.list(T.attachment),
  },
  attachment: {
    id: T.text,
    mailboxId: T.text,
    messageId: T.text,
    name: T.text,
    mimeType: T.text,
    size: T.integer,
  },
  thread: {
    id: T.text,
    mailboxId: T.text,
    subject: T.text,
    count: T.integer,
    participants: T.list(T.text),
    lastDate: T.date,
    messages: T.list(T.mail),
  },
  draft: {
    id: T.text,
    mailboxId: T.text,
    to: T.list(T.text),
    cc: T.list(T.text),
    bcc: T.list(T.text),
    subject: T.text,
    body: T.text,
    html: T.text,
    replyToMessageId: T.text,
    attachments: T.list(T.blob),
  },
  event: {
    id: T.text,
    accountId: T.text,
    calendarId: T.text,
    calendar: T.text,
    title: T.text,
    description: T.text,
    location: T.text,
    start: T.date,
    end: T.date,
    allDay: T.boolean,
    status: T.text,
    organizer: T.text,
    attendees: T.list(T.attendee),
    myResponse: T.text,
    meetingUrl: T.text,
    recurring: T.boolean,
  },
  attendee: { email: T.text, name: T.text, response: T.text },
  file: {
    id: T.text,
    driveId: T.text,
    name: T.text,
    kind: T.text,
    mimeType: T.text,
    size: T.integer,
    modifiedAt: T.date,
    parentId: T.text,
    url: T.text,
  },
  folder: { id: T.text, driveId: T.text, name: T.text, url: T.text },
  person: { email: T.text, name: T.text },
  contact: {
    id: T.text,
    addressBookId: T.text,
    bookId: T.text,
    name: T.text,
    email: T.text,
    emails: T.list(T.text),
    phones: T.list(T.text),
    organization: T.text,
    title: T.text,
    notes: T.text,
  },
  blob: { id: T.text, name: T.text, mimeType: T.text, size: T.integer },
  answer: {
    value: T.text,
    label: T.text,
    probability: T.number,
    score: T.number,
    model: T.text,
  },
};

export const RECORD_LABELS: Record<RecordKind, string> = {
  mail: "Mail",
  attachment: "Attachment",
  thread: "Thread",
  draft: "Draft",
  event: "Event",
  attendee: "Attendee",
  file: "File",
  folder: "Folder",
  person: "Person",
  contact: "Contact",
  blob: "File contents",
  answer: "Answer",
};

const SCALAR_LABELS: Record<ScalarKind, string> = {
  text: "Text",
  number: "Number",
  integer: "Whole number",
  boolean: "Yes / no",
  date: "Date",
  json: "Any value",
};

export function isRecordKind(kind: string): kind is RecordKind {
  return (RECORD_KINDS as readonly string[]).includes(kind);
}

export function typeLabel(type: ValueType): string {
  if (type.kind === "list") return `List of ${typeLabel(type.of).toLowerCase()}`;
  if (type.kind === "object") return "Fields";
  if (isRecordKind(type.kind)) return RECORD_LABELS[type.kind];
  return SCALAR_LABELS[type.kind];
}

export function fieldsOf(type: ValueType): Record<string, ValueType> | null {
  if (type.kind === "object") return type.fields;
  if (isRecordKind(type.kind)) return RECORD_FIELDS[type.kind];
  return null;
}

export function sameType(a: ValueType, b: ValueType): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function isAssignable(from: ValueType, to: ValueType): boolean {
  if (to.kind === "json" || from.kind === "json") return true;
  if (to.kind === "text") return from.kind !== "list" && from.kind !== "object";
  if (to.kind === "number") return from.kind === "number" || from.kind === "integer";
  if (to.kind === "folder") return from.kind === "folder" || from.kind === "file";
  if (to.kind === "list") return from.kind === "list" && isAssignable(from.of, to.of);
  if (to.kind === "object") {
    if (from.kind !== "object") return false;
    return Object.entries(to.fields).every(([name, type]) => {
      const own = from.fields[name];
      return !!own && isAssignable(own, type);
    });
  }
  return from.kind === to.kind;
}

const timestamp = z.union([z.string(), z.date()]).transform((v) => new Date(v).toISOString());

const recordSchemas: Record<RecordKind, z.ZodType> = {
  mail: z.object({
    id: z.string(),
    mailboxId: z.string(),
    mailbox: z.string().default(""),
    threadId: z.string().default(""),
    from: z.string().default(""),
    fromName: z.string().default(""),
    to: z.array(z.string()).default([]),
    cc: z.array(z.string()).default([]),
    subject: z.string().default(""),
    snippet: z.string().default(""),
    body: z.string().default(""),
    date: timestamp.optional(),
    isRead: z.boolean().default(false),
    isStarred: z.boolean().default(false),
    labels: z.array(z.string()).default([]),
    folder: z.string().default(""),
    hasAttachments: z.boolean().default(false),
    attachments: z.array(z.lazy(() => recordSchemas.attachment)).default([]),
  }),
  attachment: z.object({
    id: z.string(),
    mailboxId: z.string(),
    messageId: z.string(),
    name: z.string(),
    mimeType: z.string().default("application/octet-stream"),
    size: z.number().default(0),
  }),
  thread: z.object({
    id: z.string(),
    mailboxId: z.string(),
    subject: z.string().default(""),
    count: z.number().default(0),
    participants: z.array(z.string()).default([]),
    lastDate: timestamp.optional(),
    messages: z.array(z.lazy(() => recordSchemas.mail)).default([]),
  }),
  draft: z.object({
    id: z.string().default(""),
    mailboxId: z.string(),
    to: z.array(z.string()).default([]),
    cc: z.array(z.string()).default([]),
    bcc: z.array(z.string()).default([]),
    subject: z.string().default(""),
    body: z.string().default(""),
    html: z.string().default(""),
    replyToMessageId: z.string().default(""),
    attachments: z.array(z.lazy(() => recordSchemas.blob)).default([]),
  }),
  event: z.object({
    id: z.string(),
    accountId: z.string(),
    calendarId: z.string(),
    calendar: z.string().default(""),
    title: z.string().default(""),
    description: z.string().default(""),
    location: z.string().default(""),
    start: timestamp,
    end: timestamp,
    allDay: z.boolean().default(false),
    status: z.string().default("confirmed"),
    organizer: z.string().default(""),
    attendees: z.array(z.lazy(() => recordSchemas.attendee)).default([]),
    myResponse: z.string().default(""),
    meetingUrl: z.string().default(""),
    recurring: z.boolean().default(false),
  }),
  attendee: z.object({
    email: z.string(),
    name: z.string().default(""),
    response: z.string().default("needsAction"),
  }),
  file: z.object({
    id: z.string(),
    driveId: z.string(),
    name: z.string(),
    kind: z.string().default("file"),
    mimeType: z.string().default(""),
    size: z.number().default(0),
    modifiedAt: timestamp.optional(),
    parentId: z.string().default(""),
    url: z.string().default(""),
  }),
  folder: z.object({
    id: z.string(),
    driveId: z.string(),
    name: z.string().default(""),
    url: z.string().default(""),
  }),
  person: z.object({ email: z.string(), name: z.string().default("") }),
  contact: z.object({
    id: z.string(),
    addressBookId: z.string(),
    bookId: z.string(),
    name: z.string().default(""),
    email: z.string().default(""),
    emails: z.array(z.string()).default([]),
    phones: z.array(z.string()).default([]),
    organization: z.string().default(""),
    title: z.string().default(""),
    notes: z.string().default(""),
  }),
  blob: z.object({
    id: z.string(),
    name: z.string(),
    mimeType: z.string().default("application/octet-stream"),
    size: z.number().default(0),
  }),
  answer: z.object({
    value: z.string(),
    label: z.string().default(""),
    probability: z.number().default(0),
    score: z.number().default(0),
    model: z.string().default(""),
  }),
};

export function valueSchema(type: ValueType): z.ZodType {
  switch (type.kind) {
    case "text":
      return z.string();
    case "number":
    case "integer":
      return z.number();
    case "boolean":
      return z.boolean();
    case "date":
      return timestamp;
    case "json":
      return z.unknown();
    case "list":
      return z.array(valueSchema(type.of));
    case "object":
      return z.object(
        Object.fromEntries(
          Object.entries(type.fields).map(([name, field]) => [name, valueSchema(field).optional()]),
        ),
      );
    default:
      return recordSchemas[type.kind];
  }
}

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export function emptyValue(type: ValueType): Json {
  switch (type.kind) {
    case "text":
      return "";
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    case "date":
      return new Date(0).toISOString();
    case "json":
      return null;
    case "list":
      return [];
    default: {
      const fields = fieldsOf(type) ?? {};
      return Object.fromEntries(
        Object.entries(fields).map(([name, field]) => [name, emptyValue(field)]),
      );
    }
  }
}

export function identityOf(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const record = value;
  const id = typeof record.id === "string" ? record.id : null;
  if (!id) return null;
  const scope = [
    record.mailboxId,
    record.accountId,
    record.calendarId,
    record.driveId,
    record.addressBookId,
  ].find((part): part is string => typeof part === "string" && part.length > 0);
  return scope ? `${scope}:${id}` : id;
}
