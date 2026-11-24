"use client";

import { clearPreviewCache } from "@/drive/preview-cache";
import { clearDriveRecents } from "@/drive/recents";
import { clearShellCache } from "@/lib/shell-cache";
import { clearRecentSearches } from "@/search/recent";

export async function clearLocalData(): Promise<void> {
  clearDriveRecents();
  clearRecentSearches();
  await Promise.all([clearPreviewCache(), clearShellCache()]);
}
