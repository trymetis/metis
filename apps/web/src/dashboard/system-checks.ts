import "server-only";
import { randomUUID } from "node:crypto";

import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import { Redis } from "ioredis";
import { z } from "zod";

import { config, type InstanceConfig } from "@/config";
import { rowToInstanceConfig } from "@/config/row";
import { getInstanceConfig } from "@/config/runtime";
import type { InstanceSection, LlmConfig } from "@/config/schema";
import { hashSection } from "@/config/sections";
import { readConfigRow } from "@/config/store";
import type { ConnectionProvider } from "@/connections/types";
import {
  checkDecisionModel,
  runServerCheck,
  type ServerCheck,
  serverChecks,
} from "@/connections/verify-servers";
import { db } from "@/db";
import type {
  DashboardSystemCheck,
  DashboardSystemCheckInput,
  SystemCheckStatus,
  SystemDriver,
} from "@/server/schema";
import { buildCacheDriver, getCache } from "@/services/cache";
import { createSmtpTransport } from "@/services/mailer/drivers/smtp";

import { latestPreflightRun } from "./preflight";
import { dashboardRunner } from "./stats";

const modelListSchema = z.object({
  data: z.array(z.object({ id: z.unknown() })).optional(),
});

const resendErrorSchema = z.object({ name: z.unknown() });

const CHECK_TIMEOUT_MS = 10_000;
const MESSAGE_MAX = 240;
const DAY_MS = 24 * 60 * 60 * 1000;

type CheckResult = DashboardSystemCheck["results"][number];
type Outcome = { status: SystemCheckStatus; message?: string | null };

function describeError(err: unknown): string {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && code) return code;
    current = (current as { cause?: unknown }).cause;
  }
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, MESSAGE_MAX);
}

async function timed(
  label: string,
  run: () => Promise<Outcome>,
  server: string | null = null,
): Promise<CheckResult> {
  const started = performance.now();
  try {
    const outcome = await run();
    return {
      server,
      label,
      status: outcome.status,
      message: outcome.message ?? null,
      latencyMs: outcome.status === "skipped" ? null : Math.round(performance.now() - started),
    };
  } catch (err) {
    return {
      server,
      label,
      status: "failed",
      message: describeError(err),
      latencyMs: Math.round(performance.now() - started),
    };
  }
}

function skipped(label: string, message: string): CheckResult {
  return { server: null, label, status: "skipped", message, latencyMs: null };
}

async function getJson(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function llmModelsRequest(llm: LlmConfig): {
  url: string;
  headers: Record<string, string>;
} | null {
  switch (llm.driver) {
    case "disabled":
      return null;
    case "openai":
      return {
        url: "https://api.openai.com/v1/models",
        headers: { Authorization: `Bearer ${llm.apiKey}` },
      };
    case "anthropic":
      return {
        url: "https://api.anthropic.com/v1/models?limit=1000",
        headers: { "x-api-key": llm.apiKey, "anthropic-version": "2023-06-01" },
      };
    case "openai-compatible":
      return {
        url: `${llm.baseUrl.replace(/\/+$/, "")}/models`,
        headers: llm.apiKey ? { Authorization: `Bearer ${llm.apiKey}` } : {},
      };
  }
}

export async function checkLlm(cfg: InstanceConfig): Promise<CheckResult[]> {
  const llm = cfg.llm;
  const request = llmModelsRequest(llm);
  if (!request || llm.driver === "disabled") {
    return [skipped("Models endpoint", "AI is disabled.")];
  }

  return [
    await timed("Models endpoint", async () => {
      const { status, body } = await getJson(request.url, request.headers);
      if (status === 401 || status === 403) {
        return {
          status: "failed",
          message: `the API key was rejected (${status})`,
        };
      }
      if (status < 200 || status >= 300) {
        return { status: "failed", message: `responded ${status}` };
      }
      const listed = new Set(
        (modelListSchema.safeParse(body).data?.data ?? [])
          .map((model) => model.id)
          .filter((id): id is string => typeof id === "string"),
      );
      const configured = [
        ...new Set([llm.chatModel, llm.smartReplyModel, llm.classifierModel, llm.summaryModel]),
      ];
      if (listed.size === 0) {
        return { status: "ok", message: "reachable; no model list returned" };
      }
      const missing = configured.filter((model) => !listed.has(model));
      if (missing.length > 0) {
        return {
          status: "warning",
          message: `not in the provider's model list: ${missing.join(", ")}`,
        };
      }
      return {
        status: "ok",
        message: `all ${configured.length} configured model${configured.length === 1 ? "" : "s"} listed`,
      };
    }),
  ];
}

async function checkDecision(cfg: InstanceConfig): Promise<CheckResult[]> {
  if (cfg.decision.driver === "disabled") return [];
  return [
    await timed(
      "Decision models endpoint",
      async () => (await checkDecisionModel(cfg.decision)) ?? { status: "skipped" },
    ),
  ];
}

async function checkAi(cfg: InstanceConfig): Promise<CheckResult[]> {
  const [llm, decision] = await Promise.all([checkLlm(cfg), checkDecision(cfg)]);
  return [...llm, ...decision];
}

async function checkPhishing(cfg: InstanceConfig): Promise<CheckResult[]> {
  const phishing = cfg.phishingDetection;
  if (phishing.driver === "disabled") {
    return [skipped("Backend", "Phishing detection is disabled.")];
  }
  const url = `${phishing.backendUrl.replace(/\/+$/, "")}/health`;
  return [
    await timed("Backend", async () => {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
      if (res.ok) return { status: "ok" };
      if (res.status < 500) {
        return {
          status: "warning",
          message: `reachable, but /health answered ${res.status}`,
        };
      }
      return { status: "failed", message: `responded ${res.status}` };
    }),
  ];
}

async function checkMail(cfg: InstanceConfig): Promise<CheckResult[]> {
  const mailer = cfg.mailer;
  switch (mailer.driver) {
    case "noop":
    case "log":
      return [skipped("Delivery", `The ${mailer.driver} driver sends nothing.`)];
    case "console":
      return [
        skipped(
          "Delivery",
          "The console accepts mail only by delivery; there is nothing to check without sending.",
        ),
      ];
    case "smtp":
      return [
        await timed("SMTP login", async () => {
          const transport = createSmtpTransport(mailer);
          try {
            await transport.verify();
            return { status: "ok" };
          } finally {
            transport.close();
          }
        }),
      ];
    case "resend":
      return [
        await timed("API key", async () => {
          const { status, body } = await getJson("https://api.resend.com/domains", {
            Authorization: `Bearer ${mailer.apiKey}`,
          });
          if (status >= 200 && status < 300) return { status: "ok" };
          const name = resendErrorSchema.safeParse(body).data?.name;
          if (status === 401 && name === "restricted_api_key") {
            return { status: "ok", message: "sending-only key" };
          }
          if (status === 401 || status === 403) {
            return {
              status: "failed",
              message: `the API key was rejected (${status})`,
            };
          }
          return { status: "failed", message: `responded ${status}` };
        }),
      ];
  }
}

function isLive(cfg: InstanceConfig, section: "cache" | "workflowRunner"): boolean {
  return hashSection(cfg[section]) === hashSection(getInstanceConfig()[section]);
}

async function checkCache(cfg: InstanceConfig): Promise<CheckResult[]> {
  const live = isLive(cfg, "cache");
  const cache = live ? getCache() : buildCacheDriver(cfg.cache);
  try {
    return [
      await timed("Write, read, delete", async () => {
        const key = `metis:dashboard-probe:${randomUUID()}`;
        await cache.set(key, "1", 30);
        const value = await cache.get(key);
        await cache.del(key);
        if (value !== "1") {
          return { status: "failed", message: "the value did not round-trip" };
        }
        return { status: "ok" };
      }),
    ];
  } finally {
    if (!live) await cache.close().catch(() => {});
  }
}

async function checkRunnerTransport(cfg: InstanceConfig): Promise<CheckResult[]> {
  const runner = cfg.workflowRunner;
  if (runner.driver !== "bullmq") {
    return [
      skipped(
        "Transport",
        runner.driver === "cron"
          ? "An external scheduler calls the tick route; nothing to reach from here."
          : "Ticks run inside each web process.",
      ),
    ];
  }
  return [
    await timed("Redis", async () => {
      const redis = new Redis(runner.redisUrl, {
        lazyConnect: true,
        connectTimeout: CHECK_TIMEOUT_MS,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
      });
      redis.on("error", () => {});
      try {
        await redis.connect();
        await redis.ping();
        return { status: "ok" };
      } finally {
        redis.disconnect();
      }
    }),
  ];
}

const RUNNER_OUTCOMES = {
  idle: { status: "ok", message: "nothing due" },
  busy: { status: "ok", message: "working through due runs" },
  delayed: {
    status: "warning",
    message: "the last success or the oldest due work is overdue",
  },
  failing: { status: "failed", message: null },
  never: { status: "failed", message: "no tick has ever completed" },
} as const satisfies Record<string, Outcome>;

async function checkRunner(cfg: InstanceConfig): Promise<CheckResult[]> {
  if (!isLive(cfg, "workflowRunner")) return checkRunnerTransport(cfg);
  return [
    await timed("Tick health", async () => {
      const now = new Date();
      const runner = await dashboardRunner(now, new Date(now.getTime() - 7 * DAY_MS));
      const outcome = RUNNER_OUTCOMES[runner.status];
      return {
        status: outcome.status,
        message: outcome.message ?? runner.lastError,
      };
    }),
  ];
}

async function checkDatabase(): Promise<CheckResult[]> {
  return Promise.all([
    timed("App database", async () => {
      await db.run(sql`select 1`);
      return { status: "ok" };
    }),
    timed("Mastra database", async () => {
      const client = createClient(config.db.mastra);
      try {
        await client.execute("select 1");
        return { status: "ok" };
      } finally {
        client.close();
      }
    }),
  ]);
}

const DRIVER_CHECKS: Record<SystemDriver, (cfg: InstanceConfig) => Promise<CheckResult[]>> = {
  llm: checkAi,
  phishing: checkPhishing,
  mail: checkMail,
  cache: checkCache,
  runner: checkRunner,
  database: checkDatabase,
};

interface LastDeploy {
  warnings: string[];
  checked: Set<string>;
}

interface Baseline {
  stored: InstanceConfig;
  lastDeploy: LastDeploy;
}

function checkKey(check: ServerCheck): string {
  return hashSection([check.provider, check.server, check.part, check.probe]);
}

function unchangedResult(check: ServerCheck, lastDeploy: LastDeploy): CheckResult {
  const prefix = `${check.label}: `;
  const reported = lastDeploy.checked.has(checkKey(check))
    ? lastDeploy.warnings.find((line) => line.startsWith(prefix))
    : undefined;
  return {
    server: check.server,
    label: check.part,
    status: reported ? "warning" : "skipped",
    message: reported
      ? `Unchanged. The last deploy check reported: ${reported.slice(prefix.length)}`
      : "Unchanged, so not checked again.",
    latencyMs: null,
  };
}

async function checkProvider(
  provider: ConnectionProvider,
  cfg: InstanceConfig,
  baseline?: Baseline,
): Promise<CheckResult[]> {
  const ofProvider = (check: ServerCheck) => check.provider === provider;
  const checks = serverChecks(cfg).filter(ofProvider);
  if (checks.length === 0) {
    return [skipped("Configuration", "This provider is not configured.")];
  }
  const unchanged = new Set(
    baseline ? serverChecks(baseline.stored).filter(ofProvider).map(checkKey) : [],
  );
  return Promise.all(
    checks.map((check) =>
      baseline && unchanged.has(checkKey(check))
        ? Promise.resolve(unchangedResult(check, baseline.lastDeploy))
        : timed(
            check.part,
            async () => {
              const outcome = await runServerCheck(check);
              if (outcome.ok) return { status: "ok" };
              return {
                status: "failed",
                message: `${outcome.misconfigured ? "Misconfigured" : "Unreachable"}: ${outcome.message}`,
              };
            },
            check.server,
          ),
    ),
  );
}

const SECTION_PROVIDERS: Partial<Record<InstanceSection, ConnectionProvider>> = {
  google: "google",
  microsoft: "microsoft",
  zoho: "zoho",
  imapServers: "imap",
  caldavServers: "caldav",
  carddavServers: "carddav",
  cloudflareServers: "cloudflare",
  resendServers: "resend",
  s3Servers: "s3",
  webdavServers: "webdav",
  ftpServers: "ftp",
  sftpServers: "sftp",
};

const SECTION_CHECKS: Partial<
  Record<InstanceSection, (cfg: InstanceConfig) => Promise<CheckResult[]>>
> = {
  llm: checkLlm,
  decision: checkDecision,
  phishingDetection: checkPhishing,
  mailer: checkMail,
  cache: checkCache,
  workflowRunner: checkRunnerTransport,
};

async function readLastDeploy(): Promise<LastDeploy> {
  const { run } = await latestPreflightRun();
  const row = run ? await readConfigRow(run.configVersion) : null;
  if (!run || !row) return { warnings: [], checked: new Set() };
  return {
    warnings: run.warnings
      .filter((warning) => warning.kind === "server")
      .map((warning) => warning.message),
    checked: new Set(serverChecks(rowToInstanceConfig(row)).map(checkKey)),
  };
}

export async function verifySections(
  sections: InstanceSection[],
  cfg: InstanceConfig,
  stored: InstanceConfig,
): Promise<DashboardSystemCheck | null> {
  const providerSections = sections.some((section) => SECTION_PROVIDERS[section]);
  const baseline = providerSections ? { stored, lastDeploy: await readLastDeploy() } : undefined;
  const runs = sections.flatMap((section) => {
    const provider = SECTION_PROVIDERS[section];
    if (provider) return [checkProvider(provider, cfg, baseline)];
    const check = SECTION_CHECKS[section];
    return check ? [check(cfg)] : [];
  });
  if (runs.length === 0) return null;
  const results = (await Promise.all(runs)).flat();
  return { checkedAt: new Date().toISOString(), results };
}

export function checkWarnings(check: DashboardSystemCheck | null): string[] {
  return (check?.results ?? [])
    .filter((result) => result.status === "warning")
    .map(
      (result) =>
        `${result.server ? `${result.server} · ` : ""}${result.label}: ${result.message ?? ""}`,
    );
}

export function checkFailed(check: DashboardSystemCheck | null): boolean {
  return check?.results.some((result) => result.status === "failed") ?? false;
}

export async function runSystemCheck(
  input: DashboardSystemCheckInput,
  cfg: InstanceConfig = getInstanceConfig(),
): Promise<DashboardSystemCheck> {
  const results =
    input.kind === "driver"
      ? await DRIVER_CHECKS[input.driver](cfg)
      : await checkProvider(input.provider, cfg);
  return { checkedAt: new Date().toISOString(), results };
}
