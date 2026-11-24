"use client";

import { clearPreviewCache } from "@/drive/preview-cache";
import { clearShellCache } from "@/lib/shell-cache";

export async function clearLocalData(): Promise<void> {
  await Promise.all([clearPreviewCache(), clearShellCache()]);
}
