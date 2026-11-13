import "server-only";
import { CONFIG_SECTION_LABELS } from "@/types/instance-config";

import { config, instanceSeed } from ".";
import { formatConfigError } from "./format-error";
import { type InstanceConfigRow, instanceConfigToRow, rowToInstanceConfig } from "./row";
import { type InstanceConfig, type InstanceSection, instanceConfigSchema } from "./schema";
import {
  formatIssues,
  hashSection,
  INSTANCE_SECTIONS,
  instanceConfigWarnings,
  SECTION_ENV_VARS,
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

export const FORCE_KEYS_VARIABLE = "METIS__UPDATER__FORCE_UPDATE_CONFIG_KEYS";

const CLI_SERVER_PREFIX = "metis-";

type ServerSection = Extract<InstanceSection, `${string}Servers`>;

export class ForcedConfigError extends Error {}

export type ForceResult = { version: number; sections: InstanceSection[]; warnings: string[] };

function isServerSection(section: InstanceSection): section is ServerSection {
  return section.endsWith("Servers");
}

export function mergeCliServers<Entry extends { id: string }>(
  stored: readonly Entry[],
  seeded: readonly Entry[],
): Entry[] {
  return [
    ...stored.filter((entry) => !entry.id.startsWith(CLI_SERVER_PREFIX)),
    ...seeded.filter((entry) => entry.id.startsWith(CLI_SERVER_PREFIX)),
  ];
}

export function forcedSections(keys: readonly string[]): InstanceSection[] {
  const unknown = keys.filter(
    (key) => !INSTANCE_SECTIONS.some((section) => SECTION_ENV_VARS[section].includes(key)),
  );
  if (unknown.length > 0) {
    throw new ForcedConfigError(
      `${FORCE_KEYS_VARIABLE} names ${unknown.join(", ")}, which ${unknown.length === 1 ? "is not an instance setting" : "are not instance settings"}`,
    );
  }
  return INSTANCE_SECTIONS.filter((section) =>
    SECTION_ENV_VARS[section].some((name) => keys.includes(name)),
  );
}

function forcedCandidate(stored: InstanceConfig, sections: InstanceSection[]): InstanceConfig {
  const candidate = { ...stored };
  for (const section of sections) {
    if (isServerSection(section)) {
      const storedList: readonly { id: string }[] = stored[section];
      const seededList: readonly { id: string }[] = instanceSeed[section];
      Object.assign(candidate, { [section]: mergeCliServers(storedList, seededList) });
    } else {
      Object.assign(candidate, { [section]: instanceSeed[section] });
    }
  }
  return candidate;
}

function refuseInvalidForced(candidate: InstanceConfig, sections: InstanceSection[]): void {
  const errors = sections.flatMap((section) => {
    const parsed = instanceConfigSchema.shape[section].safeParse(candidate[section]);
    return parsed.success
      ? []
      : [`${CONFIG_SECTION_LABELS[section]}: ${formatConfigError(parsed.error)}`];
  });
  const issues = validateInstanceConfig(config, candidate);
  if (issues.length > 0) errors.push(formatIssues(issues));
  if (errors.length > 0) throw new ForcedConfigError(errors.join("\n"));
}

export async function forceInstanceConfigKeys(keys: readonly string[]): Promise<ForceResult> {
  const sections = forcedSections(keys);
  const current = await readCurrentConfigRow();
  if (!current) throw new Error("There is no stored instance config to force settings into");
  const candidate = forcedCandidate(rowToInstanceConfig(current), sections);
  refuseInvalidForced(candidate, sections);
  try {
    await insertConfigVersion({
      expectedVersion: current.version,
      settings: instanceConfigToRow(candidate),
      changedKeys: sections,
      kind: "forced",
    });
  } catch (err) {
    if (!(err instanceof ConfigVersionConflictError)) throw err;
    return forceInstanceConfigKeys(keys);
  }
  const stored = await readCurrentConfigRow();
  if (!stored) throw new Error("Storing the forced instance config sections failed");
  return { version: stored.version, sections, warnings: instanceConfigWarnings(candidate) };
}
