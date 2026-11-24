import { writeStoredItem } from "@/hooks/use-stored-item";

const PREFIX = "metis:drive-recents:";

export function driveRecentsKey(workspaceSlug: string, driveSlug: string): string {
  return `${PREFIX}${workspaceSlug}:${driveSlug}`;
}

export function clearDriveRecents(): void {
  let keys: string[] = [];
  try {
    keys = Object.keys(window.localStorage).filter((key) => key.startsWith(PREFIX));
  } catch {
    return;
  }
  for (const key of keys) writeStoredItem(key, null);
}
