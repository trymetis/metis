"use client";

import { useCallback, useMemo } from "react";

import { driveRecentsKey } from "@/drive/recents";
import { readStoredItem, useStoredItem, writeStoredItem } from "@/hooks/use-stored-item";
import { isRecord } from "@/lib/guards";
import { type DriveEntryRow, driveEntrySchema } from "@/server/schema";

export type DriveRecent =
  | { kind: "folder"; id: string; name: string }
  | { kind: "file"; id: string; name: string; entry: DriveEntryRow };

const LIMIT = 8;

function parseItem(item: unknown): DriveRecent | null {
  if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") return null;
  if (item.kind === "file") {
    const entry = driveEntrySchema.safeParse(item.entry);
    return entry.success ? { kind: "file", id: item.id, name: item.name, entry: entry.data } : null;
  }
  return { kind: "folder", id: item.id, name: item.name };
}

function parse(raw: string | null): DriveRecent[] {
  try {
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => parseItem(item) ?? []);
  } catch {
    return [];
  }
}

export function useDriveRecents(workspaceSlug: string, driveSlug: string) {
  const key = driveRecentsKey(workspaceSlug, driveSlug);
  const raw = useStoredItem(key);
  const recents = useMemo(() => parse(raw), [raw]);

  const remember = useCallback(
    (recent: DriveRecent) => {
      const current = parse(readStoredItem(key));
      if (current[0]?.id === recent.id && current[0].name === recent.name) return;
      const next = [recent, ...current.filter((item) => item.id !== recent.id)].slice(0, LIMIT);
      writeStoredItem(key, JSON.stringify(next));
    },
    [key],
  );

  const forget = useCallback(
    (id: string) => {
      const current = parse(readStoredItem(key));
      if (!current.some((item) => item.id === id)) return;
      writeStoredItem(key, JSON.stringify(current.filter((item) => item.id !== id)));
    },
    [key],
  );

  return { recents, remember, forget };
}
