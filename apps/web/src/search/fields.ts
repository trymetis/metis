import { CONNECTION_PROVIDERS } from "@/connections/types";
import { MAIL_FOLDERS } from "@/types/mail";
import { WORKSPACE_ROLES } from "@/types/workspace";
import { RUN_STATUSES } from "@/workflow/schema";

export const SEARCH_KINDS = [
  "mail",
  "event",
  "file",
  "chat",
  "member",
  "contact",
  "workflow",
  "run",
  "mailbox",
  "calendar",
  "drive",
  "addressbook",
  "mail-folder",
  "label",
  "connection",
  "subscription",
  "command",
  "setting",
  "workspace",
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export const REMOTE_KINDS = ["mail", "event", "file"] as const;
export type RemoteKind = (typeof REMOTE_KINDS)[number];

export const CLIENT_KINDS = ["command", "setting", "workspace"] as const;

export const EXPLICIT_KINDS: readonly SearchKind[] = ["subscription"];

export const LOCAL_MAIL_STATES = ["scheduled", "snoozed", "readlater", "muted"] as const;
export type LocalMailState = (typeof LOCAL_MAIL_STATES)[number];

export const FILE_KINDS = [
  "folder",
  "file",
  "image",
  "pdf",
  "document",
  "spreadsheet",
  "presentation",
  "video",
  "audio",
  "archive",
  "text",
] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export type FieldValueType = "text" | "enum" | "date" | "size" | "slug";

export interface SearchField {
  key: string;
  type: FieldValueType;
  kinds: readonly SearchKind[];
  values?: Partial<Record<SearchKind, readonly string[]>>;
  description: string;
}

const DATED: readonly SearchKind[] = [
  "mail",
  "event",
  "file",
  "chat",
  "member",
  "workflow",
  "run",
  "subscription",
];

export const SEARCH_FIELDS: readonly SearchField[] = [
  {
    key: "type",
    type: "enum",
    kinds: SEARCH_KINDS,
    values: Object.fromEntries(SEARCH_KINDS.map((k) => [k, [k]])),
    description: "What to search for",
  },
  {
    key: "after",
    type: "date",
    kinds: DATED,
    description: "On or after a date",
  },
  { key: "before", type: "date", kinds: DATED, description: "Before a date" },
  { key: "on", type: "date", kinds: DATED, description: "On one day" },
  {
    key: "mailbox",
    type: "slug",
    kinds: ["mail", "mail-folder", "label", "mailbox"],
    description: "In one mailbox",
  },
  {
    key: "calendar",
    type: "slug",
    kinds: ["event", "calendar"],
    description: "In one calendar account",
  },
  {
    key: "drive",
    type: "slug",
    kinds: ["file", "drive"],
    description: "In one drive",
  },
  {
    key: "addressbook",
    type: "slug",
    kinds: ["contact", "addressbook"],
    description: "In one address book",
  },
  {
    key: "book",
    type: "text",
    kinds: ["contact", "addressbook"],
    description: "A book inside an address book",
  },
  {
    key: "from",
    type: "text",
    kinds: ["mail", "subscription"],
    description: "Sent by",
  },
  { key: "to", type: "text", kinds: ["mail"], description: "Sent to" },
  { key: "cc", type: "text", kinds: ["mail"], description: "Copied to" },
  {
    key: "subject",
    type: "text",
    kinds: ["mail"],
    description: "Subject line",
  },
  {
    key: "filename",
    type: "text",
    kinds: ["mail"],
    description: "Attachment file name",
  },
  {
    key: "has",
    type: "enum",
    kinds: ["mail"],
    values: { mail: ["attachment"] },
    description: "Has an attachment",
  },
  {
    key: "mail-folder",
    type: "enum",
    kinds: ["mail"],
    values: { mail: MAIL_FOLDERS },
    description: "In a mail folder",
  },
  { key: "label", type: "text", kinds: ["mail"], description: "Has a label" },
  {
    key: "attendee",
    type: "text",
    kinds: ["event"],
    description: "Invited guest",
  },
  {
    key: "organizer",
    type: "text",
    kinds: ["event"],
    description: "Who organized it",
  },
  {
    key: "location",
    type: "text",
    kinds: ["event"],
    description: "Where it happens",
  },
  {
    key: "title",
    type: "text",
    kinds: ["event", "chat", "contact"],
    description: "Title",
  },
  {
    key: "sub-calendar",
    type: "text",
    kinds: ["event", "calendar"],
    description: "A calendar inside an account",
  },
  {
    key: "name",
    type: "text",
    kinds: [
      "file",
      "member",
      "contact",
      "workflow",
      "mailbox",
      "calendar",
      "drive",
      "addressbook",
      "mail-folder",
      "label",
      "subscription",
    ],
    description: "Name",
  },
  { key: "ext", type: "text", kinds: ["file"], description: "File extension" },
  {
    key: "kind",
    type: "enum",
    kinds: ["file"],
    values: { file: FILE_KINDS },
    description: "Kind of file",
  },
  { key: "size", type: "size", kinds: ["file"], description: "File size" },
  {
    key: "modified",
    type: "date",
    kinds: ["file"],
    description: "Last changed",
  },
  {
    key: "drive-folder",
    type: "text",
    kinds: ["file"],
    description: "In a drive folder",
  },
  {
    key: "email",
    type: "text",
    kinds: ["member", "contact", "connection"],
    description: "Email address",
  },
  { key: "phone", type: "text", kinds: ["contact"], description: "Phone number" },
  {
    key: "organization",
    type: "text",
    kinds: ["contact"],
    description: "Company or organization",
  },
  {
    key: "role",
    type: "enum",
    kinds: ["member"],
    values: { member: WORKSPACE_ROLES },
    description: "Workspace role",
  },
  {
    key: "workflow",
    type: "text",
    kinds: ["run"],
    description: "Workflow name",
  },
  {
    key: "status",
    type: "enum",
    kinds: ["run"],
    values: { run: RUN_STATUSES },
    description: "Run status",
  },
  {
    key: "provider",
    type: "enum",
    kinds: ["mailbox", "calendar", "drive", "addressbook", "connection"],
    values: {
      mailbox: CONNECTION_PROVIDERS,
      calendar: CONNECTION_PROVIDERS,
      drive: CONNECTION_PROVIDERS,
      addressbook: CONNECTION_PROVIDERS,
      connection: CONNECTION_PROVIDERS,
    },
    description: "Provider",
  },
  {
    key: "is",
    type: "enum",
    kinds: ["mail", "event", "file", "member", "workflow", "connection"],
    values: {
      mail: ["unread", "read", "starred", ...LOCAL_MAIL_STATES],
      event: ["accepted", "declined", "tentative"],
      file: ["pinned"],
      member: ["invited"],
      workflow: ["enabled", "disabled"],
      connection: ["quarantined"],
    },
    description: "State",
  },
];

export const RETIRED_KEYS: Record<string, string> = {
  in: "Use mail-folder: or drive-folder:",
  folder: "Use mail-folder: or drive-folder:",
};

const BY_KEY = new Map(SEARCH_FIELDS.map((f) => [f.key, f]));

export function searchField(key: string): SearchField | undefined {
  return BY_KEY.get(key.toLowerCase());
}

export function fieldValues(field: SearchField): string[] {
  if (!field.values) return [];
  return [...new Set(Object.values(field.values).flat())];
}

export function kindsForValue(field: SearchField, value: string | null): SearchKind[] {
  if (!field.values || value === null) return [...field.kinds];
  const lower = value.toLowerCase();
  return field.kinds.filter((kind) =>
    (field.values?.[kind] ?? []).some((v) => v.toLowerCase() === lower),
  );
}

export function isSearchKind(value: string): value is SearchKind {
  return (SEARCH_KINDS as readonly string[]).includes(value);
}
