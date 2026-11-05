import "server-only";
import { z } from "zod";

import { driveEntrySchema } from "@/server/schema";
import { cachedField, forgetHash } from "@/services/cache";
import type { DriveListing } from "@/types/drive";

const SEARCH_CACHE_TTL_SEC = 30;
const TAG = "[drive] search";

const folderListingSchema = z.object({
  entries: z.array(driveEntrySchema.omit({ driveId: true, driveSlug: true })),
  cursor: z.string().nullable(),
});

function scopeKey(scope: string): string {
  return `drive-search:${scope}`;
}

export function cachedSearchListing<T>(
  scope: string,
  field: unknown[],
  schema: z.ZodType<T>,
  load: () => Promise<T>,
): Promise<T> {
  return cachedField({
    key: scopeKey(scope),
    field: JSON.stringify(field),
    ttlSec: SEARCH_CACHE_TTL_SEC,
    schema,
    tag: TAG,
    load,
  });
}

export function cachedFolderListing(
  login: { serverId: string; user: string; root: string | null },
  folderId: string | null,
  load: () => Promise<DriveListing>,
): Promise<DriveListing> {
  return cachedSearchListing(
    login.serverId,
    [login.user, login.root, folderId],
    folderListingSchema,
    load,
  );
}

export async function afterSearchChange<T>(scope: string, work: Promise<T>): Promise<T> {
  try {
    return await work;
  } finally {
    await forgetHash(scopeKey(scope), TAG);
  }
}
