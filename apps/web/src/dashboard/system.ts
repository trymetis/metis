import "server-only";
import { count, eq, sql } from "drizzle-orm";

import { config } from "@/config";
import { decisionEnabled, getInstanceConfig } from "@/config/runtime";
import type { InstanceSection } from "@/config/schema";
import { configuredOAuthProviders, type OAuthProviderId } from "@/connections/credentials";
import { connectionsCallbackUrl } from "@/connections/oauth-state";
import { isProviderConfigured } from "@/connections/servers";
import { CONNECTION_PROVIDERS, type ConnectionProvider } from "@/connections/types";
import { db } from "@/db";
import { connection, user } from "@/db/schema";
import type {
  DashboardProviderEntry,
  DashboardSystemBadge,
  DashboardSystemCache,
  DashboardSystemDatabase,
  DashboardSystemInstance,
  DashboardSystemLlm,
  DashboardSystemMail,
  DashboardSystemOverview,
  DashboardSystemPhishing,
  DashboardSystemProvider,
  DashboardSystemRunner,
  SystemVendor,
} from "@/server/schema";

import { secretSummary } from "./config-forms";
import { dashboardRunner } from "./stats";
import { configState, configWarnings } from "./system-config";

const DAY_MS = 24 * 60 * 60 * 1000;

const PROVIDER_SECTION: Record<ConnectionProvider, InstanceSection> = {
  google: "google",
  microsoft: "microsoft",
  zoho: "zoho",
  imap: "imapServers",
  caldav: "caldavServers",
  cloudflare: "cloudflareServers",
  resend: "resendServers",
  s3: "s3Servers",
  webdav: "webdavServers",
  ftp: "ftpServers",
  sftp: "sftpServers",
};

const OAUTH_ENV_PREFIX: Record<OAuthProviderId, string> = {
  google: "GOOGLE",
  microsoft: "MICROSOFT",
  zoho: "ZOHO",
};

const SERVER_LIST_ENV: Record<Exclude<ConnectionProvider, OAuthProviderId>, string> = {
  imap: "METIS_IMAP_SERVERS",
  caldav: "METIS_CALDAV_SERVERS",
  cloudflare: "METIS_CLOUDFLARE_SERVERS",
  resend: "METIS_RESEND_SERVERS",
  s3: "METIS_S3_SERVERS",
  webdav: "METIS_WEBDAV_SERVERS",
  ftp: "METIS_FTP_SERVERS",
  sftp: "METIS_SFTP_SERVERS",
};

function isOAuthProvider(provider: ConnectionProvider): provider is OAuthProviderId {
  return provider in OAUTH_ENV_PREFIX;
}

export function publicUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "[unparseable URL]";
  }
}

function hostOf(value: string): string {
  try {
    return new URL(value).host || value;
  } catch {
    return value;
  }
}

function parsedUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function onDomain(url: URL | null, domain: string): boolean {
  const host = url?.hostname.toLowerCase() ?? "";
  return host === domain || host.endsWith(`.${domain}`);
}

function llmVendor(): SystemVendor | null {
  const llm = getInstanceConfig().llm;
  switch (llm.driver) {
    case "disabled":
      return null;
    case "openai":
      return "openai";
    case "anthropic":
      return "anthropic";
    case "openai-compatible": {
      const url = parsedUrl(llm.baseUrl);
      if (onDomain(url, "openrouter.ai")) return "openrouter";
      if (onDomain(url, "openai.com")) return "openai";
      if (onDomain(url, "anthropic.com")) return "anthropic";
      if (url?.hostname.includes("ollama") || url?.port === "11434") {
        return "ollama";
      }
      return null;
    }
  }
}

function redisVendor(value: string): SystemVendor {
  return onDomain(parsedUrl(value), "upstash.io") ? "upstash" : "redis";
}

function cacheVendor(): SystemVendor | null {
  const cache = getInstanceConfig().cache;
  if (cache.driver === "memory") return null;
  if (cache.driver === "upstash") return "upstash";
  return redisVendor(cache.url);
}

function runnerVendor(): SystemVendor | null {
  const runner = getInstanceConfig().workflowRunner;
  return runner.driver === "bullmq" ? redisVendor(runner.redisUrl) : null;
}

function databaseVendor(): SystemVendor {
  return config.db.driver === "local" ? "sqlite" : "turso";
}

function s3Vendor(endpoint: string): SystemVendor | null {
  const url = parsedUrl(endpoint);
  if (onDomain(url, "amazonaws.com")) return "aws";
  if (onDomain(url, "r2.cloudflarestorage.com")) return "cloudflare";
  return null;
}

function systemDecision(): DashboardSystemLlm["decision"] {
  const decision = getInstanceConfig().decision;
  const enabled = decision.driver !== "disabled";
  return {
    driver: decision.driver,
    vendor: decision.driver === "openai" ? "openai" : null,
    model: enabled ? decision.model : null,
    baseUrl: decision.driver === "systemone" ? publicUrl(decision.baseURL) : null,
    apiKey: enabled ? secretSummary(decision.apiKey) : null,
    classifier: decisionEnabled("classifier"),
    classifierBatch: enabled ? decision.classifierBatch : null,
    summaryGate: decisionEnabled("summaryGate"),
    workflowNode: decisionEnabled("workflowNode"),
  };
}

export function systemLlm(): DashboardSystemLlm {
  const llm = getInstanceConfig().llm;
  if (llm.driver === "disabled") {
    return {
      config: configState(["llm", "decision"]),
      driver: llm.driver,
      vendor: null,
      name: null,
      baseUrl: null,
      apiKey: null,
      chatModel: null,
      smartReplyModel: null,
      classifierModel: null,
      summaryModel: null,
      summaryVision: null,
      structuredOutputs: null,
      decision: systemDecision(),
    };
  }
  const compatible = llm.driver === "openai-compatible" ? llm : null;
  return {
    config: configState(["llm", "decision"]),
    driver: llm.driver,
    vendor: llmVendor(),
    name: compatible?.name ?? null,
    baseUrl: compatible ? publicUrl(compatible.baseUrl) : null,
    apiKey: secretSummary(llm.apiKey),
    chatModel: llm.chatModel,
    smartReplyModel: llm.smartReplyModel,
    classifierModel: llm.classifierModel,
    summaryModel: llm.summaryModel,
    summaryVision: llm.summaryVision,
    structuredOutputs: compatible?.structuredOutputs ?? null,
    decision: systemDecision(),
  };
}

export function systemPhishing(): DashboardSystemPhishing {
  const phishing = getInstanceConfig().phishingDetection;
  return {
    config: configState(["phishingDetection"]),
    driver: phishing.driver,
    backendUrl: phishing.driver === "metis" ? publicUrl(phishing.backendUrl) : null,
  };
}

function systemSmtp(): DashboardSystemMail["smtp"] {
  const mailer = getInstanceConfig().mailer;
  if (mailer.driver !== "smtp") return null;
  const plain = mailer.plain === true;
  if (mailer.url) {
    try {
      const url = new URL(mailer.url);
      const secure = url.protocol === "smtps:";
      return {
        viaUrl: true,
        host: url.hostname || null,
        port: url.port ? Number(url.port) : secure ? 465 : 587,
        secure,
        plain,
        user: url.username ? decodeURIComponent(url.username) : null,
        password: secretSummary(url.password || undefined),
      };
    } catch {
      return {
        viaUrl: true,
        host: null,
        port: null,
        secure: null,
        plain,
        user: null,
        password: { set: false, hint: null },
      };
    }
  }
  const port = mailer.port ?? 587;
  return {
    viaUrl: false,
    host: mailer.host ?? null,
    port,
    secure: mailer.secure ?? port === 465,
    plain,
    user: mailer.user ?? null,
    password: secretSummary(mailer.pass),
  };
}

export function systemMail(): DashboardSystemMail {
  const mailer = getInstanceConfig().mailer;
  return {
    config: configState(["mailer"]),
    driver: mailer.driver,
    vendor: mailer.driver === "resend" ? "resend" : null,
    fromAuth: mailer.fromAuth,
    fromInvite: mailer.fromInvite,
    apiKey: mailer.driver === "resend" ? secretSummary(mailer.apiKey) : null,
    smtp: systemSmtp(),
  };
}

export function systemCache(): DashboardSystemCache {
  const cache = getInstanceConfig().cache;
  return {
    config: configState(["cache"]),
    driver: cache.driver,
    vendor: cacheVendor(),
    url: cache.driver === "memory" ? null : publicUrl(cache.url),
  };
}

function databaseUrl(url: string): string {
  return config.db.driver === "local" ? url : publicUrl(url);
}

export function systemDatabase(): DashboardSystemDatabase {
  return {
    driver: config.db.driver,
    vendor: databaseVendor(),
    app: databaseUrl(config.db.app.url),
    mastra: databaseUrl(config.db.mastra.url),
  };
}

async function runnerStatus() {
  const now = new Date();
  return dashboardRunner(now, new Date(now.getTime() - 7 * DAY_MS));
}

export async function systemRunner(): Promise<DashboardSystemRunner> {
  const runner = getInstanceConfig().workflowRunner;
  return {
    config: configState(["workflowRunner"]),
    driver: runner.driver,
    vendor: runnerVendor(),
    cadenceSec: runner.cadenceSec,
    tickBudgetMs: runner.tickBudgetMs,
    batchSize: runner.batchSize,
    concurrency: runner.concurrency,
    queuePrefix: runner.driver === "bullmq" ? runner.queuePrefix : null,
    redisUrl: runner.driver === "bullmq" ? publicUrl(runner.redisUrl) : null,
    cronSecret: runner.driver === "cron" ? secretSummary(runner.secret) : null,
    status: await runnerStatus(),
  };
}

async function setupCodeState(): Promise<DashboardSystemInstance["setupCode"]> {
  if (!config.app.setupCode) return "unset";
  const [users] = await db.select({ total: count() }).from(user);
  return (users?.total ?? 0) === 0 ? "live" : "spent";
}

export async function systemInstance(): Promise<DashboardSystemInstance> {
  const instance = getInstanceConfig();
  return {
    config: configState(["signup", "legal", "relay", "imageProxy", "mailCache", "proxies"]),
    appUrl: config.auth.url,
    secureCookies: config.auth.secureCookies,
    signupDisabled: instance.signup.signupDisabled,
    ownerEmail: config.app.ownerEmail ?? null,
    setupCode: await setupCodeState(),
    legal: {
      version: instance.legal.version,
      termsUrl: instance.legal.termsUrl ?? null,
      privacyUrl: instance.legal.privacyUrl ?? null,
    },
    relay: {
      maxMb: instance.relay.relayMaxMb,
      concurrency: instance.relay.relayConcurrency,
    },
    imageProxy: instance.imageProxy.enabled,
  };
}

type ConnectionCount = DashboardSystemProvider["connections"];

const NO_CONNECTIONS: ConnectionCount = { active: 0, quarantined: 0 };

async function loadConnectionCounts(
  provider?: ConnectionProvider,
): Promise<Map<string, ConnectionCount>> {
  const rows = await db
    .select({
      provider: connection.provider,
      server: connection.server,
      active:
        sql<number>`sum(case when ${connection.quarantinedAt} is null then 1 else 0 end)`.mapWith(
          Number,
        ),
      quarantined:
        sql<number>`sum(case when ${connection.quarantinedAt} is not null then 1 else 0 end)`.mapWith(
          Number,
        ),
    })
    .from(connection)
    .where(provider ? eq(connection.provider, provider) : undefined)
    .groupBy(connection.provider, connection.server);

  const counts = new Map<string, ConnectionCount>();
  for (const row of rows) {
    const add = (key: string) => {
      const current = counts.get(key) ?? NO_CONNECTIONS;
      counts.set(key, {
        active: current.active + row.active,
        quarantined: current.quarantined + row.quarantined,
      });
    };
    add(row.provider);
    if (row.server) add(`${row.provider}\u0000${row.server}`);
  }
  return counts;
}

function providerEntries(
  provider: ConnectionProvider,
  counts: Map<string, ConnectionCount>,
): DashboardProviderEntry[] {
  const servers = getInstanceConfig();
  const base = (server: { id: string; name: string }) => {
    const byId = counts.get(`${provider}\u0000${server.id}`) ?? NO_CONNECTIONS;
    const byName = counts.get(`${provider}\u0000${server.name}`) ?? NO_CONNECTIONS;
    return {
      name: server.name,
      connections: {
        active: byId.active + byName.active,
        quarantined: byId.quarantined + byName.quarantined,
      },
    };
  };

  switch (provider) {
    case "google":
    case "microsoft":
    case "zoho":
      return [];
    case "imap":
      return servers.imapServers.map((server) => ({
        kind: "imap",
        ...base(server),
        imap: server.imap,
        smtp: server.smtp,
        allowInsecureTls: server.allowInsecureTls,
      }));
    case "caldav":
    case "webdav":
      return (provider === "caldav" ? servers.caldavServers : servers.webdavServers).map(
        (server) => ({
          kind: "dav",
          ...base(server),
          url: publicUrl(server.url),
          allowInsecureTls: server.allowInsecureTls,
        }),
      );
    case "cloudflare":
    case "resend":
      return (provider === "cloudflare" ? servers.cloudflareServers : servers.resendServers).map(
        (server) => ({
          kind: "gateway",
          ...base(server),
          domain: server.domain,
          endpoint: publicUrl(server.endpoint),
        }),
      );
    case "s3":
      return servers.s3Servers.map((server) => ({
        kind: "s3",
        vendor: s3Vendor(server.endpoint),
        ...base(server),
        endpoint: publicUrl(server.endpoint),
        region: server.region,
        accessKeyId: server.accessKeyId,
        secretAccessKey: secretSummary(server.secretAccessKey),
        forcePathStyle: server.forcePathStyle,
        allowInsecureTls: server.allowInsecureTls,
        transfer: server.transfer,
        checksums: server.checksums,
        partSize: server.partSize,
      }));
    case "ftp":
      return servers.ftpServers.map((server) => ({
        kind: "ftp",
        ...base(server),
        host: server.host,
        port: server.port,
        secure: server.secure,
        allowInsecureTls: server.allowInsecureTls,
        poolSize: server.poolSize,
      }));
    case "sftp":
      return servers.sftpServers.map((server) => ({
        kind: "sftp",
        ...base(server),
        host: server.host,
        port: server.port,
        hostKeySha256: `SHA256:${server.hostKeySha256}`,
        poolSize: server.poolSize,
      }));
  }
}

function providerEnvVars(provider: ConnectionProvider): string[] {
  if (isOAuthProvider(provider)) {
    const prefix = OAUTH_ENV_PREFIX[provider];
    const vars = [`${prefix}_CLIENT_ID`, `${prefix}_CLIENT_SECRET`];
    return provider === "zoho" ? [...vars, "ZOHO_REGION"] : vars;
  }
  return [SERVER_LIST_ENV[provider]];
}

export async function systemProvider(
  provider: ConnectionProvider,
): Promise<DashboardSystemProvider> {
  const counts = await loadConnectionCounts(provider);
  const instance = getInstanceConfig();
  const oauth = isOAuthProvider(provider)
    ? {
        clientId: instance[provider].clientId ?? null,
        clientSecret: secretSummary(instance[provider].clientSecret),
        redirectUri: connectionsCallbackUrl(provider),
        zohoRegion: provider === "zoho" ? instance.zoho.region : null,
      }
    : null;

  return {
    config: configState([PROVIDER_SECTION[provider]]),
    provider,
    configured: isOAuthProvider(provider)
      ? configuredOAuthProviders().includes(provider)
      : isProviderConfigured(provider),
    envVars: providerEnvVars(provider),
    connections: counts.get(provider) ?? NO_CONNECTIONS,
    oauth,
    entries: providerEntries(provider, counts),
  };
}

function badge(label: string, tone: DashboardSystemBadge["tone"]): DashboardSystemBadge {
  return { label, tone };
}

const RUNNER_BADGES: Record<DashboardSystemRunner["status"]["status"], DashboardSystemBadge> = {
  never: badge("Never ticked", "danger"),
  failing: badge("Failing", "danger"),
  delayed: badge("Delayed", "warning"),
  busy: badge("Busy", "ok"),
  idle: badge("Idle", "ok"),
};

export async function systemOverview(): Promise<DashboardSystemOverview> {
  const [counts, runner, setupCode] = await Promise.all([
    loadConnectionCounts(),
    runnerStatus(),
    setupCodeState(),
  ]);
  const instance = getInstanceConfig();
  const { llm, decision, mailer, cache } = instance;
  const phishing = instance.phishingDetection;

  const drivers: DashboardSystemOverview["drivers"] = [
    {
      driver: "llm",
      vendor: llmVendor(),
      badge: llm.driver === "disabled" ? badge("Off", "off") : badge("On", "ok"),
      detail: [
        llm.driver === "disabled" ? "disabled" : `${llm.driver} · ${llm.chatModel}`,
        decision.driver === "disabled" ? null : `decision · ${decision.model}`,
      ]
        .filter(Boolean)
        .join(" · "),
    },
    {
      driver: "phishing",
      vendor: null,
      badge: phishing.driver === "disabled" ? badge("Off", "off") : badge("On", "ok"),
      detail: phishing.driver === "metis" ? `metis · ${hostOf(phishing.backendUrl)}` : "disabled",
    },
    {
      driver: "mail",
      vendor: mailer.driver === "resend" ? "resend" : null,
      badge:
        mailer.driver === "noop"
          ? badge("Not delivered", "danger")
          : mailer.driver === "log"
            ? badge("Console only", "warning")
            : badge("Delivering", "ok"),
      detail: mailer.driver,
    },
    {
      driver: "cache",
      vendor: cacheVendor(),
      badge: cache.driver === "memory" ? badge("In process", "neutral") : badge("Shared", "ok"),
      detail: cache.driver === "memory" ? "memory" : `${cache.driver} · ${hostOf(cache.url)}`,
    },
    {
      driver: "runner",
      vendor: runnerVendor(),
      badge: RUNNER_BADGES[runner.status],
      detail: `${runner.driver} · every ${runner.cadenceSec} s`,
    },
    {
      driver: "database",
      vendor: databaseVendor(),
      badge:
        config.db.driver === "local"
          ? badge("Dev only", "warning")
          : badge(config.db.driver, "neutral"),
      detail: hostOf(config.db.app.url),
    },
  ];

  const providers = CONNECTION_PROVIDERS.map((provider) => {
    const configured = isOAuthProvider(provider)
      ? configuredOAuthProviders().includes(provider)
      : isProviderConfigured(provider);
    return {
      provider,
      configured,
      entries: isOAuthProvider(provider)
        ? configured
          ? 1
          : 0
        : providerEntries(provider, counts).length,
      connections: counts.get(provider) ?? NO_CONNECTIONS,
    };
  });

  return {
    drivers,
    providers,
    warnings: configWarnings(),
    instance: {
      badge:
        setupCode === "live"
          ? badge("Setup code live", "danger")
          : instance.signup.signupDisabled
            ? badge("Invite only", "neutral")
            : badge("Open sign-up", "warning"),
      detail: config.app.ownerEmail ?? "no owner",
    },
  };
}
