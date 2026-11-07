export const REFERENCE_TYPES = [
  "mailbox",
  "calendar",
  "drive",
  "member",
  "email",
  "event",
  "label",
  "folder",
  "file",
  "addressbook",
  "contact",
] as const;

export type ReferenceType = (typeof REFERENCE_TYPES)[number];

export const REFERENCE_TYPE_NOUN: Record<ReferenceType, string> = {
  mailbox: "mailbox",
  calendar: "calendar",
  drive: "drive",
  member: "workspace member",
  email: "email",
  event: "calendar event",
  label: "label",
  folder: "folder",
  file: "file",
  addressbook: "address book",
  contact: "contact",
};

export const REFERENCE_TYPE_HEADING: Record<ReferenceType, string> = {
  mailbox: "Mailboxes",
  calendar: "Calendars",
  drive: "Drives",
  member: "People",
  email: "Emails",
  event: "Events",
  label: "Labels",
  folder: "Folders",
  file: "Files",
  addressbook: "Address books",
  contact: "Contacts",
};

export const WORKSPACE_REFERENCE_TYPES: readonly ReferenceType[] = [
  "mailbox",
  "calendar",
  "drive",
  "member",
  "email",
  "event",
  "label",
  "folder",
  "file",
  "addressbook",
  "contact",
];

export interface AgentReference {
  type: ReferenceType;
  id: string;
}

export interface ResolvedReference extends AgentReference {
  label: string;
  detail?: string;
}

export type ReferenceSegment =
  | { kind: "text"; text: string }
  | { kind: "reference"; raw: string; type: ReferenceType; id: string };

const TOKEN_SOURCE = `<@(${REFERENCE_TYPES.join("|")}):([^<>\\r\\n]+)>`;

function tokenPattern(): RegExp {
  return new RegExp(TOKEN_SOURCE, "g");
}

export function isReferenceType(value: string): value is ReferenceType {
  return (REFERENCE_TYPES as readonly string[]).includes(value);
}

export function isSerializableReferenceId(id: string): boolean {
  return id.length > 0 && !/[<>\r\n]/.test(id);
}

export function serializeReference(ref: AgentReference): string {
  return `<@${ref.type}:${ref.id}>`;
}

export function referenceKey(ref: AgentReference): string {
  return `${ref.type}:${ref.id}`;
}

const PART_SEPARATOR = "|";
const RAW_TAG = "r:";
const ENCODED_TAG = "b:";
const NEEDS_ENCODING = /[|<>\r\n]/;

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string | null {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch {
    return null;
  }
}

export function packReferenceId(...parts: string[]): string {
  return parts
    .map((part) =>
      NEEDS_ENCODING.test(part) ? `${ENCODED_TAG}${toBase64Url(part)}` : `${RAW_TAG}${part}`,
    )
    .join(PART_SEPARATOR);
}

export function unpackReferenceId(id: string, count: 2): [string, string] | null;
export function unpackReferenceId(id: string, count: 3): [string, string, string] | null;
export function unpackReferenceId(id: string, count: number): string[] | null {
  const chunks = id.split(PART_SEPARATOR);
  if (chunks.length !== count) return null;

  const parts: string[] = [];
  for (const chunk of chunks) {
    const tag = chunk.slice(0, 2);
    const payload = chunk.slice(2);
    const value = tag === RAW_TAG ? payload : tag === ENCODED_TAG ? fromBase64Url(payload) : null;
    if (!value) return null;
    parts.push(value);
  }
  return parts;
}

export function splitReferences(text: string): ReferenceSegment[] {
  const segments: ReferenceSegment[] = [];
  const pattern = tokenPattern();
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    const [raw, type, id] = match;
    if (!type || !id || !isReferenceType(type)) continue;
    const start = match.index;
    if (start > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, start) });
    }
    segments.push({ kind: "reference", raw, type, id });
    cursor = start + raw.length;
  }

  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }
  return segments;
}

export function extractReferences(text: string): AgentReference[] {
  const seen = new Set<string>();
  const refs: AgentReference[] = [];
  for (const segment of splitReferences(text)) {
    if (segment.kind !== "reference") continue;
    const key = referenceKey(segment);
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ type: segment.type, id: segment.id });
  }
  return refs;
}

export function hasReferences(text: string): boolean {
  return tokenPattern().test(text);
}
