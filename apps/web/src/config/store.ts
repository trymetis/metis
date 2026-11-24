import "server-only";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { isUniqueViolation } from "@/db/errors";
import { instanceConfig, user } from "@/db/schema";
import type { InstanceConfigKind } from "@/types/instance-config";

import type { InstanceConfigRow, InstanceConfigSettings } from "./row";

export class ConfigVersionConflictError extends Error {
  readonly currentVersion: number | null;

  constructor(currentVersion: number | null) {
    super("The configuration changed since you opened it");
    this.name = "ConfigVersionConflictError";
    this.currentVersion = currentVersion;
  }
}

export async function currentConfigVersion(): Promise<number | null> {
  const [row] = await db
    .select({ version: instanceConfig.version })
    .from(instanceConfig)
    .where(eq(instanceConfig.isCurrent, true))
    .limit(1);
  return row?.version ?? null;
}

export async function readCurrentConfigRow(): Promise<InstanceConfigRow | null> {
  const [row] = await db
    .select()
    .from(instanceConfig)
    .where(eq(instanceConfig.isCurrent, true))
    .limit(1);
  return row ?? null;
}

export async function readConfigRow(version: number): Promise<InstanceConfigRow | null> {
  const [row] = await db
    .select()
    .from(instanceConfig)
    .where(eq(instanceConfig.version, version))
    .limit(1);
  return row ?? null;
}

export interface ConfigVersionSummary {
  version: number;
  isCurrent: boolean;
  kind: InstanceConfigKind;
  changedKeys: string[];
  revertedFromVersion: number | null;
  createdAt: Date;
  author: { name: string; email: string } | null;
}

export async function listConfigVersions(): Promise<ConfigVersionSummary[]> {
  const rows = await db
    .select({
      version: instanceConfig.version,
      isCurrent: instanceConfig.isCurrent,
      kind: instanceConfig.kind,
      changedKeys: instanceConfig.changedKeys,
      revertedFromVersion: instanceConfig.revertedFromVersion,
      createdAt: instanceConfig.createdAt,
      authorName: user.name,
      authorEmail: user.email,
    })
    .from(instanceConfig)
    .leftJoin(user, eq(user.id, instanceConfig.createdByUserId))
    .orderBy(desc(instanceConfig.version));
  return rows.map(({ authorName, authorEmail, ...row }) => ({
    ...row,
    author: authorEmail ? { name: authorName ?? authorEmail, email: authorEmail } : null,
  }));
}

export interface NewConfigVersion {
  expectedVersion: number | null;
  settings: InstanceConfigSettings;
  changedKeys: string[];
  kind: InstanceConfigKind;
  revertedFromVersion?: number | null;
  createdByUserId?: string | null;
}

export async function insertConfigVersion(input: NewConfigVersion): Promise<number> {
  try {
    return await db.transaction(async (tx) => {
      if (input.expectedVersion !== null) {
        const fenced = await tx
          .update(instanceConfig)
          .set({ isCurrent: false })
          .where(
            and(
              eq(instanceConfig.isCurrent, true),
              eq(instanceConfig.version, input.expectedVersion),
            ),
          )
          .returning({ version: instanceConfig.version });
        if (fenced.length === 0) {
          throw new ConfigVersionConflictError(null);
        }
      }
      const [row] = await tx
        .insert(instanceConfig)
        .values({
          ...input.settings,
          isCurrent: true,
          changedKeys: input.changedKeys,
          kind: input.kind,
          revertedFromVersion: input.revertedFromVersion ?? null,
          createdByUserId: input.createdByUserId ?? null,
          createdAt: new Date(),
        })
        .returning({ version: instanceConfig.version });
      // oxlint-disable-next-line typescript/no-non-null-assertion --insert … returning yields the row
      return row!.version;
    });
  } catch (err) {
    if (err instanceof ConfigVersionConflictError || isUniqueViolation(err)) {
      throw new ConfigVersionConflictError(await currentConfigVersion());
    }
    throw err;
  }
}
