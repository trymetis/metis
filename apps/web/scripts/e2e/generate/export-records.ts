import { SEEDED_EXPORTS } from "@metis/e2e/lib/exports";

import { db } from "../../../src/db";
import { exportRecord } from "../../../src/db/schema";

export async function seedExportRecords(): Promise<void> {
  await db.insert(exportRecord).values(
    SEEDED_EXPORTS.map((entry) => ({
      id: crypto.randomUUID(),
      createdAt: new Date(entry.createdAt),
      appVersion: entry.appVersion,
      migration: entry.migration,
      maintenanceSince: entry.maintenanceSince ? new Date(entry.maintenanceSince) : null,
      fileName: entry.fileName,
      size: entry.size,
      sha256: entry.sha256,
      recipients: entry.recipients,
      locations: entry.locations,
      instanceUrl: entry.instanceUrl,
    })),
  );
}
