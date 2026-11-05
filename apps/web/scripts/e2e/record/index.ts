import { mkdir, readFile, rm } from "node:fs/promises";
import { parseArgs } from "node:util";

import { enrollmentSchema } from "@metis/e2e/lib/enrollment";
import { env } from "@metis/e2e/lib/env";
import { type LlmSeeds, llmSeedsSchema } from "@metis/e2e/lib/llm-key";

import { ENROLLMENT, LLM_MANIFEST, LLM_SEEDS, RECORD_JOURNAL, SEED_SQL } from "../harness-files";
import {
  copyScratchDatabase,
  createScratchDatabase,
  type ScratchDatabase,
  scratchEnv,
} from "../scratch-db";
import { catalog, matches, type Scenario } from "./catalog";
import { Journal } from "./journal";
import { manifestSchema, mergeOutputs, readJson } from "./merge";
import { preflight } from "./preflight";
import {
  DECISION_INPUT_NANO_USD_PER_TOKEN,
  DECISION_OUTPUT_NANO_USD_PER_TOKEN,
  formatUsd,
  startRecorder,
  type UpstreamTarget,
} from "./recorder";
import { type Outcome, schedule } from "./scheduler";
import { killWorkers, runWorker } from "./spawn";

const UPSTREAM_CONCURRENCY = 6;

const { values: flags } = parseArgs({
  options: {
    plan: { type: "boolean", default: false },
    only: { type: "string" },
    force: { type: "string" },
    "max-new": { type: "string" },
    jobs: { type: "string", default: "5" },
  },
});
const list = (value: string | undefined) =>
  value
    ?.split(",")
    .map((p) => p.trim())
    .filter(Boolean) ?? [];
const plan = flags.plan ?? false;
const only = list(flags.only);
const force = env.llm.force ? ["*"] : list(flags.force);
const maxNew = flags["max-new"] ? Number(flags["max-new"]) : null;
const jobs = Number(flags.jobs);
if (!Number.isInteger(jobs) || jobs < 1) throw new Error("--jobs must be ≥ 1");
if (maxNew !== null && (!Number.isInteger(maxNew) || maxNew < 0)) {
  throw new Error("--max-new must be a whole number");
}

function withSources(all: Scenario[], patterns: string[]): Scenario[] {
  if (patterns.length === 0) return all;
  const byId = new Map(all.map((s) => [s.id, s]));
  const wanted = new Set<string>();
  for (const scenario of all) {
    if (!matches(scenario.id, patterns)) continue;
    for (let at: Scenario | undefined = scenario; at;) {
      wanted.add(at.id);
      at = at.from ? byId.get(at.from) : undefined;
    }
  }
  if (wanted.size === 0) throw new Error(`--only ${patterns.join(",")} matches nothing`);
  return all.filter((s) => wanted.has(s.id));
}

function upstream(
  name: string,
  url: string | undefined,
  key: string | undefined,
): UpstreamTarget | null {
  return url && key ? { name, url, key, concurrency: UPSTREAM_CONCURRENCY } : null;
}

await preflight({ plan });
const enrollment = enrollmentSchema.parse(JSON.parse(await readFile(ENROLLMENT, "utf8")));
const scenarios = catalog(Object.keys(enrollment.driveSlugs));
const selected = withSources(scenarios, only);
const previous = (await readJson(LLM_SEEDS, llmSeedsSchema)) ?? ({} satisfies LlmSeeds);
const previousManifest = await readJson(LLM_MANIFEST, manifestSchema);

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const runDir = `${env.generateDir}/record`;
await rm(runDir, { recursive: true, force: true });
await mkdir(`${runDir}/logs`, { recursive: true });
const worldPath = `${runDir}/world.json`;

const journal = new Journal(RECORD_JOURNAL);
const recorder = await startRecorder({
  runId,
  plan,
  forced: (id) => matches(id, force),
  maxNew,
  llm: upstream("OpenRouter", env.llm.upstreamUrl, env.llm.upstreamKey),
  decision: upstream("TypeSafe", env.typesafe.upstreamUrl, env.typesafe.upstreamKey),
  journal,
  previous,
});

let stopping = false;
process.on("SIGINT", () => {
  if (stopping) process.exit(130);
  stopping = true;
  console.log(
    "[record] stopping: workers killed, saving what was recorded (Ctrl-C again to quit now)",
  );
  killWorkers();
});

const databases = new Map<string, ScratchDatabase>();

async function runScenario(scenario: Scenario): Promise<Outcome> {
  const started = Date.now();
  const dir = `${runDir}/${scenario.id.replaceAll(":", "-")}`;
  const source = scenario.from ? databases.get(scenario.from) : undefined;
  const paths = source
    ? await copyScratchDatabase(source, dir)
    : await createScratchDatabase(dir, SEED_SQL);
  databases.set(scenario.id, paths);

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...scratchEnv(paths),
    ...scenario.env,
    METIS_LLM_BASE_URL: recorder.urlFor(scenario.id),
    METIS_DECISION_BASE_URL: recorder.urlFor(scenario.id),
    RECORD_SCENARIO: JSON.stringify(scenario),
    RECORD_WORLD: worldPath,
  };

  const logPath = `${runDir}/logs/${scenario.id.replaceAll(":", "-")}.log`;
  console.log(`[record] ▶ ${scenario.id}`);
  const result = await runWorker({
    env: childEnv,
    logPath,
    timeoutMs: scenario.timeoutMs,
    settle: () => recorder.settle(scenario.id),
  });
  const used = recorder.usage(scenario.id);
  const ms = Date.now() - started;
  let outcome: Outcome;
  if (plan && used.misses > 0) {
    outcome = {
      status: "needs recording",
      error: `${used.misses} request(s) have no recording`,
      ms,
    };
  } else if (!result.ok) {
    outcome = {
      status: result.timedOut ? "timed out" : stopping ? "interrupted" : "failed",
      error: result.error,
      ms,
    };
  } else if (used.failures.length > 0) {
    outcome = {
      status: "failed",
      error: `${used.failures.length} upstream request(s) failed:\n${used.failures.join("\n")}`,
      ms,
    };
  } else {
    outcome = { status: "ok", ms };
  }
  const counts = `${used.reused} reused, ${used.recorded} recorded`;
  console.log(
    `[record] ${outcome.status === "ok" ? "✓" : "✗"} ${scenario.id} ${outcome.status} in ${Math.round(ms / 1000)}s (${counts})${outcome.status === "ok" ? "" : `; log: ${logPath}`}`,
  );
  if (outcome.error) {
    console.log(
      outcome.error
        .split("\n")
        .slice(0, 12)
        .map((line) => `    ${line.slice(0, 400)}`)
        .join("\n"),
    );
  }
  return outcome;
}

console.log(
  `[record] ${selected.length} scenario(s), ${jobs} at a time${plan ? ", replay only (--plan)" : ""}${force.length ? `, forced: ${force.join(",")}` : ""}${maxNew !== null ? `, at most ${maxNew} new upstream calls` : ""}`,
);
const outcomes = await schedule(selected, {
  jobs,
  stopped: () => stopping,
  run: runScenario,
});
await recorder.close();

if (!plan) {
  await mergeOutputs({
    scenarios,
    outcomes,
    databases,
    recorder,
    journal,
    previous,
    previousManifest,
  });
}
journal.close();

const rows = selected.map((scenario) => {
  const outcome = outcomes.get(scenario.id);
  const used = recorder.usage(scenario.id);
  return `  ${(outcome?.status ?? "not run").padEnd(16)} ${scenario.id.padEnd(28)} ${String(used.reused).padStart(4)} reused ${String(used.recorded).padStart(4)} recorded${plan ? ` ${String(used.misses).padStart(4)} missing` : ` ${formatUsd(used.costNanoUsd)}`}`;
});
console.log(`[record] summary:\n${rows.join("\n")}`);

if (!plan) {
  const used = selected.map((scenario) => recorder.usage(scenario.id));
  const cost = used.reduce((sum, u) => sum + u.costNanoUsd, 0);
  const uncosted = used.reduce((sum, u) => sum + u.uncosted, 0);
  console.log(
    `[record] cost this run: ${formatUsd(cost)} (OpenRouter from each response's cost field, TypeSafe at ${DECISION_INPUT_NANO_USD_PER_TOKEN} n$ per input token and ${DECISION_OUTPUT_NANO_USD_PER_TOKEN} n$ per output token)${uncosted > 0 ? `; ${uncosted} recorded response(s) carry no cost or usage and are not in it` : ""}`,
  );
}

const unfinished = selected.filter((scenario) => outcomes.get(scenario.id)?.status !== "ok");
if (unfinished.length > 0) {
  console.log(
    `[record] ${unfinished.length} scenario(s) did not finish; their previous recordings and fragments were kept. Rerun them with:\n  bun run generate:record --only '${unfinished.map((s) => s.id).join(",")}'`,
  );
}
process.exit(unfinished.length === 0 ? 0 : 1);
