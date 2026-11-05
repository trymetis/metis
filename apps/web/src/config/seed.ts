import "server-only";
import { config, instanceSeed } from ".";
import { type InstanceConfigRow, instanceConfigToRow, rowToInstanceConfig } from "./row";
import type { InstanceConfig, InstanceSection } from "./schema";
import {
  formatIssues,
  hashSection,
  INSTANCE_SECTIONS,
  instanceConfigWarnings,
  suppliedSections,
  validateInstanceConfig,
} from "./sections";
import { ConfigVersionConflictError, insertConfigVersion, readCurrentConfigRow } from "./store";

export type SeedResult =
  | { kind: "seeded"; version: number; warnings: string[] }
  | {
      kind: "existing";
      version: number;
      filled: InstanceSection[];
      warnings: string[];
      differing: InstanceSection[];
    };

function seedWarnings(instance: InstanceConfig): string[] {
  return [
    ...validateInstanceConfig(config, instance).map((issue) => formatIssues([issue])),
    ...instanceConfigWarnings(instance),
  ];
}

function unstoredSections(row: InstanceConfigRow): InstanceSection[] {
  return [
    ...(row.decisionDriver === null ? (["decision"] as const) : []),
    ...(row.imageProxyEnabled === null ? (["imageProxy"] as const) : []),
    ...(row.trustedProxies === null ? (["proxies"] as const) : []),
    ...(row.mailCacheDays === null ? (["mailCache"] as const) : []),
  ];
}

async function fillUnstoredSections(
  row: InstanceConfigRow,
): Promise<{ row: InstanceConfigRow; filled: InstanceSection[]; warnings: string[] } | null> {
  const filled = unstoredSections(row);
  if (filled.length === 0) return { row, filled, warnings: [] };
  const candidate = { ...rowToInstanceConfig(row) };
  for (const section of filled) {
    Object.assign(candidate, { [section]: instanceSeed[section] });
  }
  try {
    await insertConfigVersion({
      expectedVersion: row.version,
      settings: instanceConfigToRow(candidate),
      changedKeys: filled,
      kind: "seed",
    });
  } catch (err) {
    if (!(err instanceof ConfigVersionConflictError)) throw err;
    return null;
  }
  const current = await readCurrentConfigRow();
  if (!current) throw new Error("Seeding the new instance config sections failed");
  return { row: current, filled, warnings: seedWarnings(candidate) };
}

export async function seedInstanceConfig(): Promise<SeedResult> {
  const current = await readCurrentConfigRow();

  if (current) {
    const result = await fillUnstoredSections(current);
    if (!result) return seedInstanceConfig();
    const stored = rowToInstanceConfig(result.row);
    const differing = suppliedSections().filter(
      (section) => hashSection(instanceSeed[section]) !== hashSection(stored[section]),
    );
    return {
      kind: "existing",
      version: result.row.version,
      filled: result.filled,
      warnings: result.warnings,
      differing,
    };
  }

  const warnings = seedWarnings(instanceSeed);
  try {
    const version = await insertConfigVersion({
      expectedVersion: null,
      settings: instanceConfigToRow(instanceSeed),
      changedKeys: [...INSTANCE_SECTIONS],
      kind: "seed",
    });
    return { kind: "seeded", version, warnings };
  } catch (err) {
    if (!(err instanceof ConfigVersionConflictError)) throw err;
    return seedInstanceConfig();
  }
}
