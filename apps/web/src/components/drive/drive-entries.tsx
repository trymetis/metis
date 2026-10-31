"use client";

import { Button } from "@metis/ui/components/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@metis/ui/components/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import { cn } from "@metis/ui/lib/utils";
import { cva } from "class-variance-authority";
import {
  Download,
  ExternalLink,
  type LucideIcon,
  MoreHorizontal,
  Pencil,
  Pin,
  Trash2,
} from "lucide-react";
import { type ComponentType, Fragment, type KeyboardEvent, type ReactNode, useRef } from "react";

import { DriveIcon } from "@/components/drive-icon";
import { formatBytes } from "@/lib/utils";
import type { DriveEntryRow } from "@/server/schema";

export type DriveView = "list" | "grid";

function formatDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatSize(entry: DriveEntryRow): string {
  if (entry.kind === "folder") return "Folder";
  return entry.size === null ? "" : formatBytes(entry.size);
}

interface EntryActions {
  onOpen: (entry: DriveEntryRow) => void;
  onDownload: (entry: DriveEntryRow) => void;
  onRename: (entry: DriveEntryRow) => void;
  onDelete: (entry: DriveEntryRow) => void;
  onPin: (entry: DriveEntryRow) => void;
}

interface EntryMenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  separated?: boolean;
}

function entryMenuItems(entry: DriveEntryRow, actions: EntryActions): EntryMenuItem[] {
  const items: EntryMenuItem[] = [
    entry.kind === "folder"
      ? {
          key: "pin",
          label: "Pin to sidebar",
          icon: Pin,
          onSelect: () => actions.onPin(entry),
        }
      : {
          key: "download",
          label: "Download",
          icon: Download,
          onSelect: () => actions.onDownload(entry),
        },
  ];
  if (entry.webUrl) {
    const url = entry.webUrl;
    items.push({
      key: "provider",
      label: "Open at provider",
      icon: ExternalLink,
      onSelect: () => window.open(url, "_blank"),
    });
  }
  items.push(
    {
      key: "rename",
      label: "Rename",
      icon: Pencil,
      onSelect: () => actions.onRename(entry),
      separated: true,
    },
    {
      key: "delete",
      label: "Delete",
      icon: Trash2,
      onSelect: () => actions.onDelete(entry),
      destructive: true,
    },
  );
  return items;
}

function EntryMenuItems({
  entry,
  actions,
  Item,
  Separator,
}: {
  entry: DriveEntryRow;
  actions: EntryActions;
  Item: ComponentType<{
    onClick: () => void;
    variant: "default" | "destructive";
    children: ReactNode;
  }>;
  Separator: ComponentType;
}) {
  return entryMenuItems(entry, actions).map(
    ({ key, label, icon: Icon, onSelect, destructive, separated }) => (
      <Fragment key={key}>
        {separated && <Separator />}
        <Item onClick={onSelect} variant={destructive ? "destructive" : "default"}>
          <Icon className="size-3.5" />
          {label}
        </Item>
      </Fragment>
    ),
  );
}

const entryVariants = cva(
  "group relative transition-colors hover:bg-hover data-selected:bg-selected has-[[data-entry-open]:focus-visible]:ring-2 has-[[data-entry-open]:focus-visible]:ring-ring/50",
  {
    variants: {
      view: {
        list: "flex items-center gap-3 border-b border-border/60 px-4 py-2 has-[[data-entry-open]:focus-visible]:ring-inset",
        grid: "flex h-44 w-38 flex-col rounded-lg border border-border bg-surface hover:border-ring/40 data-selected:border-ring/60",
      },
    },
  },
);

const openButtonVariants = cva("outline-none", {
  variants: {
    view: {
      list: "flex min-w-0 flex-1 items-center gap-3 text-left",
      grid: "flex min-h-0 w-full flex-1 flex-col items-center gap-2 px-3 pt-5 pb-3 text-center",
    },
  },
});

const iconFrameVariants = cva("flex shrink-0 items-center justify-center", {
  variants: { view: { list: "", grid: "h-14" } },
});

const iconVariants = cva("", {
  variants: { view: { list: "", grid: "size-12" } },
});

const nameVariants = cva("min-w-0 text-foreground", {
  variants: {
    view: {
      list: "flex-1 truncate text-[13px]",
      grid: "line-clamp-2 h-8 w-full text-[12px] leading-4 wrap-anywhere",
    },
  },
});

const metaVariants = cva("text-[11px] text-faint", {
  variants: {
    view: {
      list: "contents",
      grid: "mt-auto flex w-full justify-center gap-1",
    },
  },
});

const sizeVariants = cva("shrink-0", {
  variants: {
    view: { list: "w-24 text-right max-md:hidden", grid: "" },
    folder: { true: "", false: "" },
  },
  compoundVariants: [{ view: "list", folder: true, className: "opacity-0" }],
});

const metaSeparatorVariants = cva("", {
  variants: { view: { list: "hidden", grid: "" } },
});

const dateVariants = cva("", {
  variants: {
    view: { list: "shrink-0 text-right md:w-28", grid: "min-w-0 truncate" },
  },
});

const menuButtonVariants = cva("", {
  variants: {
    view: {
      list: "",
      grid: "absolute top-1 right-1 opacity-0 group-hover:opacity-100 group-has-focus-visible:opacity-100 group-data-selected:opacity-100 pointer-coarse:opacity-100",
    },
  },
});

function EntryItem({
  entry,
  view,
  actions,
  selected,
  onSelect,
}: {
  entry: DriveEntryRow;
  view: DriveView;
  actions: EntryActions;
  selected: boolean;
  onSelect: () => void;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    actions.onOpen(entry);
  };
  const selectOnOpen = (open: boolean) => {
    if (open) onSelect();
  };
  const touchTap = useRef(false);
  const size = formatSize(entry);
  const modified = formatDate(entry.modifiedAt);

  return (
    <ContextMenu onOpenChange={selectOnOpen}>
      <ContextMenuTrigger
        data-selected={selected ? "" : undefined}
        className={entryVariants({ view })}
      >
        <button
          type="button"
          data-entry-open=""
          title={entry.name}
          aria-pressed={selected}
          onPointerDown={(event) => {
            touchTap.current = event.pointerType === "touch";
          }}
          onClick={() => {
            if (touchTap.current) {
              touchTap.current = false;
              actions.onOpen(entry);
              return;
            }
            onSelect();
          }}
          onDoubleClick={() => actions.onOpen(entry)}
          onKeyDown={onKeyDown}
          className={openButtonVariants({ view })}
        >
          <span className={iconFrameVariants({ view })}>
            <DriveIcon name={entry.name} kind={entry.kind} className={iconVariants({ view })} />
          </span>
          <span className={nameVariants({ view })}>{entry.name}</span>
          <span className={metaVariants({ view })}>
            <span
              className={sizeVariants({
                view,
                folder: entry.kind === "folder",
              })}
            >
              {size}
            </span>
            {size && modified && (
              <span aria-hidden className={metaSeparatorVariants({ view })}>
                ·
              </span>
            )}
            <span className={dateVariants({ view })}>{modified}</span>
          </span>
        </button>
        <DropdownMenu onOpenChange={selectOnOpen}>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${entry.name}`}
                className={menuButtonVariants({ view })}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-44">
            <EntryMenuItems
              entry={entry}
              actions={actions}
              Item={DropdownMenuItem}
              Separator={DropdownMenuSeparator}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <EntryMenuItems
          entry={entry}
          actions={actions}
          Item={ContextMenuItem}
          Separator={ContextMenuSeparator}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function DriveEntries({
  entries,
  view,
  selectedId,
  onSelectedChange,
  actions,
}: {
  entries: DriveEntryRow[];
  view: DriveView;
  selectedId: string | null;
  onSelectedChange: (id: string | null) => void;
  actions: EntryActions;
}) {
  const selected = entries.some((entry) => entry.id === selectedId) ? selectedId : null;

  return (
    <div
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onSelectedChange(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && selected) {
          event.stopPropagation();
          onSelectedChange(null);
        }
      }}
      className={cn(
        view === "grid"
          ? "grid grid-cols-[repeat(auto-fill,--spacing(38))] justify-between gap-3 p-4"
          : "flex flex-col",
      )}
    >
      {entries.map((entry) => (
        <EntryItem
          key={entry.id}
          entry={entry}
          view={view}
          actions={actions}
          selected={entry.id === selected}
          onSelect={() => onSelectedChange(entry.id)}
        />
      ))}
    </div>
  );
}
