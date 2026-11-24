"use client";

import { useCallback, useMemo } from "react";

import { useStoredItem, writeStoredItem } from "@/hooks/use-stored-item";
import { isRecord } from "@/lib/guards";

export interface DriveRecent {
  id: string;
  name: string;
}

const LIMIT = 8;

function storageKey(workspaceSlug: string, driveSlug: string): string {
  return `metis:drive-recents:${workspaceSlug}:${driveSlug}`;
}

function parse(raw: string | null): DriveRecent[] {
  try {
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is DriveRecent =>
        isRecord(item) && typeof item.id === "string" && typeof item.name === "string",
    );
  } catch {
    return [];
  }
}

export function useDriveRecents(workspaceSlug: string, driveSlug: string) {
  const key = storageKey(workspaceSlug, driveSlug);
  const raw = useStoredItem(key);
  const recents = useMemo(() => parse(raw), [raw]);

  const remember = useCallback(
    (entry: DriveRecent) => {
      const next = [entry, ...recents.filter((item) => item.id !== entry.id)].slice(0, LIMIT);
      writeStoredItem(key, JSON.stringify(next));
    },
    [key, recents],
  );

  return { recents, remember };
}
