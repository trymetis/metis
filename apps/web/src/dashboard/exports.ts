import "server-only";
import { desc } from "drizzle-orm";

import { db } from "@/db";
import { exportRecord } from "@/db/schema";
import type { DashboardExports } from "@/server/schema";

export async function listExports(): Promise<DashboardExports> {
  const rows = await db.select().from(exportRecord).orderBy(desc(exportRecord.createdAt));
  return {
    exports: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      appVersion: row.appVersion,
      migration: row.migration,
      maintenanceSince: row.maintenanceSince?.toISOString() ?? null,
      fileName: row.fileName,
      size: row.size,
      sha256: row.sha256,
      recipients: row.recipients,
      locations: row.locations,
      instanceUrl: row.instanceUrl,
    })),
  };
}
