import { writeFile } from "node:fs/promises";

import type { Enrollment } from "@metis/e2e/lib/enrollment";
import type { OwnerClient, SeededMcpClient } from "@metis/e2e/lib/mcp-clients";

import { dumpRows } from "../dump";
import { ENROLLMENT, SEED_SQL } from "../harness-files";
import { stableIds } from "../stable-ids";
import type { Account } from "./account";
import type { Resources } from "./connections";

const SKIPPED_TABLES = new Set(["session", "verification", "theme"]);

export async function writeSeed(
  appDb: string,
  account: Account,
  resources: Resources,
  member: Account,
  mcp: {
    clients: Record<OwnerClient, SeededMcpClient>;
    member: SeededMcpClient;
  },
): Promise<void> {
  const sql = stableIds(appDb, dumpRows(appDb, SKIPPED_TABLES));
  await writeFile(SEED_SQL, sql);
  const enrollment: Enrollment = {
    name: account.name,
    email: account.email,
    password: account.password,
    workspaceSlug: account.workspaceSlug,
    ...resources,
    totpURI: account.totpURI,
    backupCodes: account.backupCodes,
    mcpClients: mcp.clients,
    member: {
      name: member.name,
      email: member.email,
      password: member.password,
      workspaceSlug: member.workspaceSlug,
      totpURI: member.totpURI,
      mcpClient: mcp.member,
    },
  };
  await writeFile(ENROLLMENT, `${JSON.stringify(enrollment, null, 2)}\n`);
  console.log(
    `[generate] wrote harness/seed.sql (${(sql.length / 1024).toFixed(1)} KB) and harness/enrollment.json`,
  );
}
