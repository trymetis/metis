import { decisionEnabled, loadInstanceConfig } from "@/config/runtime";
import { seedInstanceConfig } from "@/config/seed";
import { backfillServerIds, reconcileQuarantine } from "@/connections/quarantine";
import {
  checkDecisionModel,
  decisionModelLabel,
  verifyConnectServers,
} from "@/connections/verify-servers";
import { recordPreflightRun } from "@/dashboard/preflight";
import { checkLlm } from "@/dashboard/system-checks";
import { db } from "@/db";
import { migrateDatabase } from "@/db/migrations";
import type { PreflightWarning, PreflightWarningKind } from "@/types/preflight";
import { ensureSystemWorkflows } from "@/workflow/builtins/system";

import { MIGRATIONS } from "../migrations";

const migrated = await migrateDatabase(db.$client, MIGRATIONS);
if (migrated.baselined) {
  console.log("[preflight] recorded 0000_baseline for a database created before migrations");
}
if (migrated.applied.length > 0) {
  console.log(`[preflight] applied ${migrated.applied.join(", ")}`);
}

const warnings: PreflightWarning[] = [];

function warn(kind: PreflightWarningKind, message: string): void {
  warnings.push({ kind, message });
  console.warn(`[preflight] ⚠ ${message}`);
}

const seeded = await seedInstanceConfig();
if (seeded.kind === "seeded") {
  console.log(`[preflight] seeded instance config version ${seeded.version}`);
  for (const warning of seeded.warnings) warn("seed", warning);
} else {
  if (seeded.filled.length > 0) {
    console.log(
      `[preflight] seeded ${seeded.filled.join(",")} into instance config version ${seeded.version}`,
    );
  }
  for (const warning of seeded.warnings) warn("seed", warning);
  console.log(`[preflight] instance config version ${seeded.version} in use`);
  for (const section of seeded.differing) {
    warn(
      "drift",
      `${section} in the environment or config file differs from the stored instance config; the stored value is used. Change it under Dashboard → System, or remove it from the environment.`,
    );
  }
}

await ensureSystemWorkflows();
console.log("[preflight] system workflows up to date");

const instance = await loadInstanceConfig();

const { misconfigured, unreachable } = await verifyConnectServers(instance);

for (const warning of [...misconfigured, ...unreachable]) {
  warn("server", warning);
}
const unverified = misconfigured.length + unreachable.length;
if (unverified > 0) {
  console.warn(
    `[preflight] ${unverified} server(s) failed verification. connecting through them will fail until they are fixed.`,
  );
}

if (instance.llm.driver !== "disabled") {
  const llm = instance.llm;
  const where =
    llm.driver === "openai-compatible"
      ? new URL(llm.baseUrl).host
      : llm.driver === "openai"
        ? "OpenAI"
        : "Anthropic";
  const label = `LLM ${llm.chatModel} (${llm.driver}, ${where})`;
  for (const result of await checkLlm(instance)) {
    if (result.status === "failed") {
      warn(
        "llm",
        `${label}: ${result.message}. agents, smart replies, labels and summaries will fail until it is fixed.`,
      );
    } else if (result.status === "warning") {
      warn("llm", `${label}: ${result.message}`);
    }
  }
}

if (instance.decision.driver === "systemone" && !instance.decision.apiKey) {
  warn(
    "decision",
    `the decision model has no API key, so ${decisionModelLabel(instance.decision)} gets a placeholder key. a server that checks keys will reject every decision call.`,
  );
}

if (
  decisionEnabled("classifier") ||
  decisionEnabled("summaryGate") ||
  decisionEnabled("workflowNode")
) {
  const decisionCheck = await checkDecisionModel(instance.decision);
  if (decisionCheck?.status === "failed") {
    warn(
      "decision",
      `${decisionModelLabel(instance.decision)}: ${decisionCheck.message}. the decision features that are switched on will fail until it is fixed.`,
    );
  } else if (decisionCheck?.status === "warning") {
    warn("decision", `${decisionModelLabel(instance.decision)}: ${decisionCheck.message}`);
  }
}

const backfill = await backfillServerIds(instance);
if (backfill.updated > 0 || backfill.unresolved > 0) {
  console.log(
    `[preflight] server ids backfilled=${backfill.updated} unresolved=${backfill.unresolved}`,
  );
}

const quarantine = await reconcileQuarantine(instance);

console.log(
  `[preflight] providers=${quarantine.providers.join(",")} missingServers=${quarantine.missingServers} quarantined=${quarantine.quarantined} restored=${quarantine.restored} unavailable=${quarantine.unavailable}`,
);
if (quarantine.quarantined > 0) {
  warn(
    "quarantine",
    `${quarantine.quarantined} connection(s) were quarantined because their provider or server is no longer configured. ${quarantine.unavailable} connection(s) are unavailable in total.`,
  );
}

try {
  await recordPreflightRun({ configVersion: seeded.version, warnings });
  console.log(`[preflight] recorded ${warnings.length} warning(s)`);
} catch (err) {
  console.warn(
    `[preflight] ⚠ could not record this run's warnings for the dashboard: ${err instanceof Error ? err.message : String(err)}`,
  );
}
process.exit(0);
