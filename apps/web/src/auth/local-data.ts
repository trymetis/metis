"use client";

import { clearPreviewCache } from "@/drive/preview-cache";
import { clearDriveRecents } from "@/drive/recents";
import { clearShellCache } from "@/lib/shell-cache";

export async function clearLocalData(): Promise<void> {
  clearDriveRecents();
  await Promise.all([clearPreviewCache(), clearShellCache()]);
}
