import { createHash } from "node:crypto";

import { recordOf } from "@/lib/records";
import { CONFIG_SECTIONS, type ConfigSection } from "@/types/instance-config";

import { type BootConfig, serverlessHost, suppliedByEnv, suppliedByFile } from ".";
import {
  type ConfigIssue,
  crossCheckConfig,
  type InstanceConfig,
  type InstanceSection,
} from "./schema";

export const INSTANCE_SECTIONS: readonly InstanceSection[] =
  CONFIG_SECTIONS satisfies readonly InstanceSection[];

const SECTIONS_ARE_EXHAUSTIVE: [Exclude<InstanceSection, ConfigSection>] extends [never]
  ? true
  : never = true;
void SECTIONS_ARE_EXHAUSTIVE;

export const SECTION_ENV_VARS: Record<InstanceSection, string[]> = {
  llm: [
    "METIS_LLM_DRIVER",
    "METIS_LLM_CHAT_MODEL",
    "METIS_LLM_SMART_REPLY_MODEL",
    "METIS_LLM_CLASSIFIER_MODEL",
    "METIS_LLM_SUMMARY_MODEL",
    "METIS_LLM_SUMMARY_VISION",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "METIS_LLM_BASE_URL",
    "METIS_LLM_NAME",
    "METIS_LLM_API_KEY",
    "METIS_LLM_STRUCTURED_OUTPUTS",
  ],
  decision: [
    "METIS_DECISION_DRIVER",
    "METIS_DECISION_MODEL",
    "METIS_DECISION_BASE_URL",
    "METIS_DECISION_API_KEY",
    "OPENAI_API_KEY",
    "METIS_DECISION_CLASSIFIER",
    "METIS_DECISION_SUMMARY_GATE",
    "METIS_DECISION_WORKFLOW_NODE",
    "METIS_DECISION_CLASSIFIER_BATCH",
  ],
  phishingDetection: ["METIS_PHISHING_DETECTION_DRIVER", "BACKEND_URL"],
  mailer: [
    "METIS_MAIL_DRIVER",
    "MAIL_FROM",
    "MAIL_FROM_AUTH",
    "MAIL_FROM_INVITE",
    "RESEND_API_KEY",
    "SMTP_URL",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_SECURE",
    "SMTP_PLAIN",
    "CONSOLE_MAIL_URL",
    "CONSOLE_MAIL_TOKEN",
  ],
  signup: ["METIS_SIGNUP_DISABLED"],
  legal: ["METIS_TERMS_URL", "METIS_PRIVACY_URL", "METIS_LEGAL_VERSION"],
  relay: ["METIS_DRIVE_RELAY_MAX_MB", "METIS_DRIVE_RELAY_CONCURRENCY"],
  imageProxy: ["METIS_MAIL_IMAGE_PROXY", "METIS_MAIL_IMAGE_PROXY_MAX_MB"],
  proxies: ["METIS_TRUSTED_PROXIES"],
  mailCache: ["METIS_MAIL_CACHE_DAYS"],
  cache: ["METIS_CACHE_DRIVER", "METIS_CACHE_URL", "METIS_CACHE_TOKEN"],
  workflowRunner: [
    "METIS_WORKFLOW_RUNNER_DRIVER",
    "METIS_WORKFLOW_CADENCE_SEC",
    "METIS_WORKFLOW_TICK_BUDGET_MS",
    "METIS_WORKFLOW_BATCH_SIZE",
    "METIS_WORKFLOW_CONCURRENCY",
    "METIS_WORKFLOW_REDIS_URL",
    "METIS_WORKFLOW_QUEUE_PREFIX",
    "CRON_SECRET",
    "METIS_WORKFLOW_STEP_DATA_DAYS",
    "METIS_WORKFLOW_HISTORY_DAYS",
    "METIS_WORKFLOW_PUBLIC_URL",
    "METIS_WORKFLOW_TRUSTED_PROXIES",
  ],
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  microsoft: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
  zoho: ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REGION"],
  imapServers: ["METIS_IMAP_SERVERS"],
  caldavServers: ["METIS_CALDAV_SERVERS"],
  cloudflareServers: ["METIS_CLOUDFLARE_SERVERS"],
  resendServers: ["METIS_RESEND_SERVERS"],
  s3Servers: ["METIS_S3_SERVERS"],
  webdavServers: ["METIS_WEBDAV_SERVERS"],
  ftpServers: ["METIS_FTP_SERVERS"],
  sftpServers: ["METIS_SFTP_SERVERS"],
};

function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? "null" : stableJson(item))).join(",")}]`;
  }
  const entries = Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
}

export function hashSection(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

export function hashSections(instance: InstanceConfig): Record<InstanceSection, string> {
  return recordOf(INSTANCE_SECTIONS, (section) => hashSection(instance[section]));
}

const SHARED_ENV_VARS = new Set(["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]);

const SECTION_FILE_PATHS: Record<InstanceSection, string[][]> = {
  llm: [["llm"]],
  decision: [["decision"]],
  phishingDetection: [["phishingDetection"]],
  mailer: [["mailer"]],
  signup: [["app", "signupDisabled"]],
  legal: [["legal"]],
  relay: [
    ["drive", "relayMaxMb"],
    ["drive", "relayConcurrency"],
  ],
  imageProxy: [
    ["mail", "imageProxy"],
    ["mail", "imageProxyMaxMb"],
  ],
  proxies: [["proxies"]],
  mailCache: [["mailCache"]],
  cache: [["cache"]],
  workflowRunner: [["workflowRunner"]],
  google: [["connections", "google"]],
  microsoft: [["connections", "microsoft"]],
  zoho: [
    ["connections", "zoho"],
    ["connections", "zohoRegion"],
  ],
  imapServers: [["connections", "imapServers"]],
  caldavServers: [["connections", "caldavServers"]],
  cloudflareServers: [["connections", "cloudflareServers"]],
  resendServers: [["connections", "resendServers"]],
  s3Servers: [["connections", "s3Servers"]],
  webdavServers: [["connections", "webdavServers"]],
  ftpServers: [["connections", "ftpServers"]],
  sftpServers: [["connections", "sftpServers"]],
};

export function suppliedSections(): InstanceSection[] {
  return INSTANCE_SECTIONS.filter(
    (section) =>
      suppliedByEnv(SECTION_ENV_VARS[section].filter((name) => !SHARED_ENV_VARS.has(name))) ||
      SECTION_FILE_PATHS[section].some((path) => suppliedByFile(path)),
  );
}

function oauthPairSet(creds: { clientId?: string; clientSecret?: string }): boolean {
  return Boolean(creds.clientId && creds.clientSecret);
}

function anyProviderConfigured(instance: InstanceConfig): boolean {
  return (
    oauthPairSet(instance.google) ||
    oauthPairSet(instance.microsoft) ||
    oauthPairSet(instance.zoho) ||
    instance.imapServers.length > 0 ||
    instance.caldavServers.length > 0 ||
    instance.cloudflareServers.length > 0 ||
    instance.resendServers.length > 0 ||
    instance.s3Servers.length > 0 ||
    instance.webdavServers.length > 0 ||
    instance.ftpServers.length > 0 ||
    instance.sftpServers.length > 0
  );
}

export function instanceConfigWarnings(instance: InstanceConfig): string[] {
  return anyProviderConfigured(instance)
    ? []
    : [
        "No provider is configured, so no mailbox, calendar or drive can be connected until one is added under Dashboard → System.",
      ];
}

export function validateInstanceConfig(boot: BootConfig, instance: InstanceConfig): ConfigIssue[] {
  const issues = crossCheckConfig(boot, instance);
  const host = serverlessHost();
  if (instance.workflowRunner.driver === "internal" && host) {
    issues.push({
      path: ["workflowRunner", "driver"],
      message: `The internal runner needs a continuously running Node server, and this looks like ${host.host} (${host.variable} is set), which suspends the process between requests. Use "cron" with an external scheduler, or "bullmq" with a worker.`,
    });
  }
  return issues;
}

export function formatIssues(issues: ConfigIssue[]): string {
  return issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}
