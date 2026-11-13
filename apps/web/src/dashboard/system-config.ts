import "server-only";
import { ORPCError } from "@orpc/server";

import { config, instanceSeed } from "@/config";
import { formatConfigError } from "@/config/format-error";
import { type InstanceConfigRow, instanceConfigToRow, rowToInstanceConfig } from "@/config/row";
import { getConfigVersion, getInstanceConfig, loadInstanceConfig } from "@/config/runtime";
import { type InstanceConfig, type InstanceSection, instanceConfigSchema } from "@/config/schema";
import {
  formatIssues,
  hashSection,
  INSTANCE_SECTIONS,
  instanceConfigWarnings,
  validateInstanceConfig,
} from "@/config/sections";
import { seedInstanceConfig } from "@/config/seed";
import {
  ConfigVersionConflictError,
  insertConfigVersion,
  listConfigVersions,
  readConfigRow,
  readCurrentConfigRow,
} from "@/config/store";
import { quarantineImpact, reconcileQuarantine } from "@/connections/quarantine";
import { getDriver } from "@/connections/registry";
import type {
  DashboardConfigDiff,
  DashboardConfigForm,
  DashboardConfigHistory,
  DashboardConfigReset,
  DashboardConfigSave,
  DashboardConfigSectionState,
  DashboardConfigState,
  DashboardConfigUpdateInput,
} from "@/server/schema";
import { CONFIG_SECTION_LABELS } from "@/types/instance-config";

import {
  changedSecrets,
  diffSection,
  isListSection,
  sectionFields,
  sectionForm,
  sectionFromForm,
} from "./config-forms";
import { checkFailed, checkWarnings, verifySections } from "./system-checks";

const CONNECTION_SECTIONS = new Set<InstanceSection>([
  "google",
  "microsoft",
  "zoho",
  "imapServers",
  "caldavServers",
  "carddavServers",
  "cloudflareServers",
  "resendServers",
  "sesServers",
  "s3Servers",
  "webdavServers",
  "ftpServers",
  "sftpServers",
]);

function sectionState(section: InstanceSection): DashboardConfigSectionState {
  return { section, label: CONFIG_SECTION_LABELS[section] };
}

export function configState(sections: InstanceSection[]): DashboardConfigState {
  return {
    version: getConfigVersion(),
    sections: sections.map(sectionState),
  };
}

export function configWarnings(): string[] {
  return instanceConfigWarnings(getInstanceConfig());
}

export function configForm(section: InstanceSection): DashboardConfigForm {
  const instance = getInstanceConfig();
  return {
    state: sectionState(section),
    version: getConfigVersion(),
    ...sectionForm(section, instance),
    matchesEnvironment: hashSection(instance[section]) === hashSection(instanceSeed[section]),
  };
}

function conflict(currentVersion: number | null): ORPCError<"CONFLICT", unknown> {
  return new ORPCError("CONFLICT", {
    message: `The configuration changed since you opened it${currentVersion ? ` (it is now version ${currentVersion})` : ""}. Reload and try again.`,
    data: { currentVersion },
  });
}

async function peekRow(expectedVersion: number): Promise<InstanceConfigRow | null> {
  const row = await readCurrentConfigRow();
  const version = row?.version ?? 0;
  if (version !== expectedVersion) throw conflict(row ? version : null);
  return row;
}

async function currentRow(expectedVersion: number): Promise<InstanceConfigRow> {
  const row = await readCurrentConfigRow();
  if (row) {
    if (row.version !== expectedVersion) throw conflict(row.version);
    return row;
  }
  if (expectedVersion !== 0) throw conflict(null);
  await seedInstanceConfig();
  const seeded = await readCurrentConfigRow();
  if (!seeded) throw new Error("Seeding the instance configuration failed");
  return seeded;
}

function refuseInvalid(candidate: InstanceConfig): void {
  const issues = validateInstanceConfig(config, candidate);
  if (issues.length > 0) {
    throw new ORPCError("BAD_REQUEST", { message: formatIssues(issues) });
  }
}

async function store(args: {
  row: InstanceConfigRow;
  candidate: InstanceConfig;
  changed: InstanceSection[];
  kind: "edit" | "revert" | "reset";
  revertedFromVersion?: number;
  userId: string;
}): Promise<number> {
  let version: number;
  try {
    version = await insertConfigVersion({
      expectedVersion: args.row.version,
      settings: instanceConfigToRow(args.candidate),
      changedKeys: args.changed,
      kind: args.kind,
      revertedFromVersion: args.revertedFromVersion ?? null,
      createdByUserId: args.userId,
    });
  } catch (err) {
    if (err instanceof ConfigVersionConflictError) {
      throw conflict(err.currentVersion);
    }
    throw err;
  }
  console.log(`[config] ${args.kind} stored version=${version} changed=${args.changed.join(",")}`);
  await loadInstanceConfig();
  if (args.changed.some((section) => CONNECTION_SECTIONS.has(section))) {
    const result = await reconcileQuarantine(getInstanceConfig());
    console.log(
      `[config] quarantine version=${version} quarantined=${result.quarantined} restored=${result.restored} unavailable=${result.unavailable}`,
    );
  }
  return version;
}

export async function saveConfigSections(
  input: DashboardConfigUpdateInput,
  userId: string,
): Promise<DashboardConfigSave> {
  const row = await currentRow(input.expectedVersion);
  const stored = rowToInstanceConfig(row);

  const candidate = { ...stored };
  for (const edit of input.sections) {
    const parsed = instanceConfigSchema.shape[edit.section].safeParse(
      sectionFromForm(edit.section, edit, stored),
    );
    if (!parsed.success) {
      throw new ORPCError("BAD_REQUEST", {
        message: `${CONFIG_SECTION_LABELS[edit.section]}: ${formatConfigError(parsed.error)}`,
      });
    }
    Object.assign(candidate, { [edit.section]: parsed.data });
  }

  const warnings = instanceConfigWarnings(candidate);
  const changed = INSTANCE_SECTIONS.filter(
    (section) => hashSection(candidate[section]) !== hashSection(stored[section]),
  );
  if (changed.length === 0) {
    return { saved: false, version: row.version, check: null, warnings };
  }
  refuseInvalid(candidate);

  const check = await verifySections(changed, candidate, stored);
  if (checkFailed(check) && !input.force) {
    return { saved: false, version: row.version, check, warnings };
  }

  const version = await store({
    row,
    candidate,
    changed,
    kind: "edit",
    userId,
  });
  return { saved: true, version, check, warnings: [...warnings, ...checkWarnings(check)] };
}

export async function revertConfig(
  input: { version: number; expectedVersion: number; force: boolean },
  userId: string,
): Promise<DashboardConfigSave> {
  const row = await currentRow(input.expectedVersion);
  const target = await readConfigRow(input.version);
  if (!target) {
    throw new ORPCError("NOT_FOUND", { message: "No such version" });
  }

  const stored = rowToInstanceConfig(row);
  const restored = rowToInstanceConfig(target);
  const changed = INSTANCE_SECTIONS.filter(
    (section) => hashSection(stored[section]) !== hashSection(restored[section]),
  );
  const warnings = instanceConfigWarnings(restored);
  if (changed.length === 0) {
    return { saved: false, version: row.version, check: null, warnings };
  }
  refuseInvalid(restored);

  const check = await verifySections(changed, restored, stored);
  if (checkFailed(check) && !input.force) {
    return { saved: false, version: row.version, check, warnings };
  }

  const version = await store({
    row,
    candidate: restored,
    changed,
    kind: "revert",
    revertedFromVersion: target.version,
    userId,
  });
  return { saved: true, version, check, warnings: [...warnings, ...checkWarnings(check)] };
}

function sectionValues(section: InstanceSection, instance: InstanceConfig) {
  const { values, secrets, entries } = sectionForm(section, instance);
  return { values, secrets, entries };
}

async function inUseBy(candidate: InstanceConfig): Promise<DashboardConfigReset["inUse"]> {
  const impact = await quarantineImpact(candidate);
  return impact.map((entry) => ({ ...entry, label: getDriver(entry.provider).label }));
}

function inUseMessage(section: InstanceSection, inUse: DashboardConfigReset["inUse"]): string {
  const total = inUse.reduce((sum, entry) => sum + entry.connections, 0);
  const names = inUse
    .map((entry) => (entry.server ? `${entry.label} · ${entry.server}` : entry.label))
    .join(", ");
  return `Resetting ${CONFIG_SECTION_LABELS[section]} would quarantine ${total} ${total === 1 ? "connection" : "connections"} (${names}). Reset anyway to go ahead.`;
}

export async function resetConfigSection(
  input: {
    section: InstanceSection;
    expectedVersion: number;
    apply: boolean;
    force: boolean;
  },
  userId: string,
): Promise<DashboardConfigReset> {
  const { section } = input;
  const row = input.apply
    ? await currentRow(input.expectedVersion)
    : await peekRow(input.expectedVersion);
  const stored = row ? rowToInstanceConfig(row) : instanceSeed;
  const storedVersion = row?.version ?? 0;
  const candidate: InstanceConfig = { ...stored, [section]: instanceSeed[section] };
  const differs = hashSection(stored[section]) !== hashSection(candidate[section]);
  const inUse = differs ? await inUseBy(candidate) : [];
  const warnings = instanceConfigWarnings(candidate);
  const view = (current: InstanceConfig, impact: DashboardConfigReset["inUse"]) => ({
    warnings,
    list: isListSection(section),
    fields: sectionFields(section),
    current: sectionValues(section, current),
    environment: sectionValues(section, candidate),
    changedSecrets: changedSecrets(section, current, candidate),
    inUse: impact,
  });

  if (!row || !input.apply || !differs) {
    return { updated: false, version: storedVersion, check: null, ...view(stored, inUse) };
  }
  refuseInvalid(candidate);
  if (inUse.length > 0 && !input.force) {
    throw new ORPCError("PRECONDITION_FAILED", { message: inUseMessage(section, inUse) });
  }

  const check = await verifySections([section], candidate, stored);
  if (checkFailed(check)) {
    return { updated: false, version: storedVersion, check, ...view(stored, inUse) };
  }

  const version = await store({ row, candidate, changed: [section], kind: "reset", userId });
  const saved = view(candidate, []);
  return {
    updated: true,
    version,
    check,
    ...saved,
    warnings: [...saved.warnings, ...checkWarnings(check)],
  };
}

export async function configHistory(): Promise<DashboardConfigHistory> {
  const versions = await listConfigVersions();
  return {
    current: versions.find((entry) => entry.isCurrent)?.version ?? 0,
    versions: versions.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

export async function configDiff(from: number, to: number): Promise<DashboardConfigDiff> {
  const [before, after] = await Promise.all([readConfigRow(from), readConfigRow(to)]);
  if (!before || !after) {
    throw new ORPCError("NOT_FOUND", { message: "No such version" });
  }
  const a = rowToInstanceConfig(before);
  const b = rowToInstanceConfig(after);
  return {
    from,
    to,
    sections: INSTANCE_SECTIONS.map((section) => diffSection(section, a, b)).filter(
      (entry) => entry.changes.length > 0,
    ),
  };
}
