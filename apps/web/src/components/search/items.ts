import type { SearchKind } from "@/search/fields";
import type {
  EventSearchHitDto,
  FileSearchHitDto,
  LocalSearchHit,
  MailSearchHitDto,
} from "@/server/schema";

import type { ClientEntry } from "./entries";

export interface Suggestion {
  value: string;
  label: string;
  detail?: string;
  start: number;
  end: number;
  complete: boolean;
}

export type SearchItem =
  | { key: string; source: "mail"; hit: MailSearchHitDto }
  | { key: string; source: "event"; hit: EventSearchHitDto }
  | { key: string; source: "file"; hit: FileSearchHitDto }
  | { key: string; source: "local"; hit: LocalSearchHit }
  | { key: string; source: "client"; entry: ClientEntry }
  | { key: string; source: "recent"; query: string }
  | { key: string; source: "saved"; id: string; name: string; query: string }
  | { key: string; source: "suggestion"; suggestion: Suggestion }
  | { key: string; source: "more"; kind: "mail" | "file" };

export type GroupKind = SearchKind | "recent" | "saved" | "suggestion";

export function kindOf(item: SearchItem): GroupKind {
  switch (item.source) {
    case "mail":
    case "event":
    case "file":
      return item.source;
    case "local":
      return item.hit.kind;
    case "client":
      return item.entry.kind;
    case "recent":
    case "saved":
    case "suggestion":
      return item.source;
    case "more":
      return item.kind;
  }
}

export const GROUP_LABELS: Record<GroupKind, string> = {
  suggestion: "Suggestions",
  saved: "Saved searches",
  recent: "Recent searches",
  mail: "Mail",
  event: "Events",
  file: "Files",
  chat: "Chats",
  member: "Members",
  contact: "Contacts",
  workflow: "Workflows",
  run: "Workflow runs",
  mailbox: "Mailboxes",
  calendar: "Calendars",
  drive: "Drives",
  addressbook: "Address books",
  "mail-folder": "Mail folders",
  label: "Labels",
  connection: "Connections",
  subscription: "Subscriptions",
  command: "Commands",
  setting: "Settings",
  workspace: "Workspaces",
};

export const GROUP_ORDER: GroupKind[] = [
  "suggestion",
  "saved",
  "recent",
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
];

export interface ItemGroup {
  kind: GroupKind;
  label: string;
  items: SearchItem[];
}

export function groupItems(items: SearchItem[]): ItemGroup[] {
  const by = new Map<GroupKind, SearchItem[]>();
  for (const item of items) {
    const kind = kindOf(item);
    by.set(kind, [...(by.get(kind) ?? []), item]);
  }
  return GROUP_ORDER.flatMap((kind) => {
    const list = by.get(kind);
    return list?.length ? [{ kind, label: GROUP_LABELS[kind], items: list }] : [];
  });
}

export function mailKey(hit: MailSearchHitDto) {
  return `mail:${hit.id}`;
}

export function eventKey(hit: EventSearchHitDto) {
  return `event:${hit.accountId}:${hit.calendarId}:${hit.id}`;
}

export function fileKey(hit: FileSearchHitDto) {
  return `file:${hit.driveId}:${hit.id}`;
}
