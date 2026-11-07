"use client";

import { Button } from "@metis/ui/components/button";
import { CommandItem } from "@metis/ui/components/command";
import { cn } from "@metis/ui/lib/utils";
import { format, isThisYear, isToday } from "date-fns";
import type { LucideIcon } from "lucide-react";
import {
  BookUser,
  Bookmark,
  CalendarDays,
  ChevronDown,
  Clock,
  Folder,
  HardDrive,
  History,
  Inbox,
  Link2,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Newspaper,
  Tag,
  UserRound,
  Workflow,
  X,
} from "lucide-react";
import type { ReactNode } from "react";

import { DriveIcon } from "@/components/drive-icon";
import type { SearchMatcher } from "@/search/match";

import type { SearchItem } from "./items";

export interface RowDescription {
  title: string;
  subtitle?: string;
  date?: string;
  badges?: string[];
}

function when(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  if (isToday(date)) return format(date, "HH:mm");
  return format(date, isThisYear(date) ? "MMM d" : "MMM d, yyyy");
}

export function describe(item: SearchItem): RowDescription {
  switch (item.source) {
    case "mail":
      return {
        title: item.hit.subject || "(no subject)",
        subtitle: [item.hit.fromName || item.hit.from, item.hit.snippet]
          .filter(Boolean)
          .join(" · "),
        date: when(item.hit.scheduledFor ?? item.hit.date),
        badges: item.hit.states,
      };
    case "event":
      return {
        title: item.hit.title || "(untitled event)",
        subtitle: [item.hit.calendarName, item.hit.location].filter(Boolean).join(" · "),
        date: when(item.hit.start),
      };
    case "file":
      return {
        title: item.hit.name,
        subtitle: [item.hit.parentName, item.hit.driveSlug].filter(Boolean).join(" · "),
        date: when(item.hit.modifiedAt ?? undefined),
        badges: item.hit.pinned ? ["pinned"] : undefined,
      };
    case "local":
      return {
        title: item.hit.title,
        subtitle: item.hit.subtitle,
        date: when(item.hit.date),
        badges:
          item.hit.kind === "connection" && item.hit.quarantined
            ? ["needs reconnecting"]
            : item.hit.kind === "member" && item.hit.invited
              ? ["invited"]
              : undefined,
      };
    case "client":
      return { title: item.entry.title, subtitle: item.entry.subtitle };
    case "recent":
      return { title: item.query };
    case "saved":
      return { title: item.name, subtitle: item.query };
    case "suggestion":
      return {
        title: item.suggestion.label,
        subtitle: item.suggestion.detail,
      };
    case "more":
      return { title: "Load more" };
  }
}

const LOCAL_ICONS: Record<string, LucideIcon> = {
  chat: MessageSquare,
  member: UserRound,
  contact: UserRound,
  workflow: Workflow,
  run: History,
  mailbox: Inbox,
  calendar: CalendarDays,
  drive: HardDrive,
  addressbook: BookUser,
  "mail-folder": Folder,
  label: Tag,
  connection: Link2,
  subscription: Newspaper,
};

function ItemIcon({ item }: { item: SearchItem }) {
  const className = "size-4 shrink-0 text-faint";
  switch (item.source) {
    case "mail":
      return <Mail className={className} />;
    case "event":
      return <CalendarDays className={className} />;
    case "file":
      return <DriveIcon name={item.hit.name} kind={item.hit.kind} className="size-4 shrink-0" />;
    case "local": {
      const Icon = LOCAL_ICONS[item.hit.kind] ?? Folder;
      return <Icon className={className} />;
    }
    case "client": {
      const Icon = item.entry.icon;
      return <Icon className={className} />;
    }
    case "recent":
      return <Clock className={className} />;
    case "saved":
      return <Bookmark className={className} />;
    case "more":
      return <ChevronDown className={className} />;
    case "suggestion":
      return null;
  }
}

export function Highlighted({ text, patterns }: { text: string; patterns: RegExp[] }) {
  if (!text || patterns.length === 0) return <>{text}</>;
  const ranges: [number, number][] = [];
  for (const pattern of patterns) {
    const global = new RegExp(
      pattern.source,
      pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
    );
    for (const match of text.matchAll(global)) {
      if (!match[0]) continue;
      const start = match.index ?? 0;
      ranges.push([start, start + match[0].length]);
    }
  }
  if (ranges.length === 0) return <>{text}</>;
  ranges.sort((a, b) => a[0] - b[0]);
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (end <= at) continue;
    const from = Math.max(start, at);
    if (from > at) parts.push(text.slice(at, from));
    parts.push(
      <mark key={`${from}-${end}`} className="bg-transparent font-semibold text-foreground">
        {text.slice(from, end)}
      </mark>,
    );
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

export function patternsFor(matcher: SearchMatcher | null, row: RowDescription): RegExp[] {
  if (!matcher) return [];
  const doc = {
    text: [row.title, row.subtitle ?? ""],
    title: row.title,
    subject: row.title,
    name: row.title,
    from: row.subtitle ?? "",
    email: row.subtitle ?? "",
  };
  return matcher.highlights(doc).flatMap((h) => (h.query ? [h.query] : []));
}

export function ResultRow({
  item,
  matcher,
  compact,
  onSelect,
  onActions,
  onRemove,
}: {
  item: SearchItem;
  matcher: SearchMatcher | null;
  compact: boolean;
  onSelect: () => void;
  onActions?: () => void;
  onRemove?: () => void;
}) {
  const row = describe(item);
  const patterns = patternsFor(matcher, row);
  return (
    <CommandItem
      value={item.key}
      onSelect={onSelect}
      className="group/row items-start gap-3 py-2 max-md:[&>svg:last-child]:hidden"
    >
      <span className="mt-0.5 flex size-4 items-center justify-center">
        <ItemIcon item={item} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "min-w-0 truncate text-[13px] text-foreground",
              item.source === "suggestion" && "font-mono",
            )}
          >
            <Highlighted text={row.title} patterns={patterns} />
          </span>
          {row.badges?.map((badge) => (
            <span
              key={badge}
              className="shrink-0 rounded-full bg-hover px-1.5 py-px text-[10px] text-muted-foreground"
            >
              {badge}
            </span>
          ))}
        </span>
        {row.subtitle && !compact && (
          <span className="min-w-0 truncate text-[12px] text-faint">
            <Highlighted text={row.subtitle} patterns={patterns} />
          </span>
        )}
      </span>
      {row.date && <span className="shrink-0 pt-0.5 text-[11px] text-faint">{row.date}</span>}
      {onRemove && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove ${row.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <X className="size-3" />
        </Button>
      )}
      {onActions && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Actions for ${row.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onActions();
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-3.5" />
        </Button>
      )}
    </CommandItem>
  );
}
