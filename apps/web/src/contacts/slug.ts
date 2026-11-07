import { eq } from "drizzle-orm";

import { db } from "@/db";
import { addressBookWorkspace } from "@/db/schema";
import { uniqueSlug } from "@/lib/slug-ladder";
import { RESERVED_ADDRESS_BOOK_SLUGS } from "@/workspace/path";

export async function uniqueAddressBookSlug(workspaceId: string, email: string): Promise<string> {
  const rows = await db
    .select({ slug: addressBookWorkspace.slug })
    .from(addressBookWorkspace)
    .where(eq(addressBookWorkspace.workspaceId, workspaceId));

  return uniqueSlug({
    taken: new Set(rows.map((r) => r.slug)),
    reserved: RESERVED_ADDRESS_BOOK_SLUGS,
    email,
    fallback: "contacts",
  });
}
