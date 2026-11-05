import "server-only";
import { createHash, randomBytes } from "node:crypto";

import { z } from "zod";

import type { InstanceConfig, InstanceSection } from "@/config/schema";
import {
  DECISION_FEATURE_LABELS,
  DEFAULT_SYSTEMONE_BASE_URL,
  SERVER_ENTRY_SCHEMAS,
  ZOHO_REGIONS,
} from "@/config/schema";
import { isRecord } from "@/lib/guards";
import type { DashboardConfigField, DashboardConfigValue, DashboardSecret } from "@/server/schema";
import type { ConfigFieldKind } from "@/types/instance-config";
import { CONFIG_SECTION_LABELS } from "@/types/instance-config";

const SECRET_HINT_MIN_LENGTH = 16;

type Values = Record<string, DashboardConfigValue>;
type Secrets = Record<string, DashboardSecret>;

function field(
  key: string,
  label: string,
  kind: ConfigFieldKind,
  extra: Partial<DashboardConfigField> = {},
): DashboardConfigField {
  return {
    key,
    label,
    kind,
    options: null,
    when: null,
    description: null,
    optional: false,
    ...extra,
  };
}

const when = (key: string, ...values: string[]) => ({ when: { key, values } });

const LLM_KEYED = ["openai", "anthropic", "openai-compatible"];

const DECISION_KEYED = ["systemone", "openai"];

const PLAIN_DESCRIPTION =
  "Without implicit TLS, the connection must upgrade with STARTTLS or it fails. Turn this on only for a local server that has no TLS.";

const SCALAR_FIELDS: Partial<Record<InstanceSection, DashboardConfigField[]>> = {
  llm: [
    field("driver", "Driver", "select", {
      options: ["openai", "anthropic", "openai-compatible", "disabled"],
    }),
    field("apiKey", "API key", "secret", {
      ...when("driver", ...LLM_KEYED),
      optional: true,
      description: "Optional only for openai-compatible.",
    }),
    field("baseUrl", "Base URL", "url", when("driver", "openai-compatible")),
    field("name", "Provider name", "text", {
      ...when("driver", "openai-compatible"),
      optional: true,
    }),
    field(
      "structuredOutputs",
      "Structured outputs",
      "boolean",
      when("driver", "openai-compatible"),
    ),
    field("chatModel", "Chat and agents model", "text", {
      ...when("driver", ...LLM_KEYED),
    }),
    field("smartReplyModel", "Smart replies model", "text", {
      ...when("driver", ...LLM_KEYED),
    }),
    field("classifierModel", "Classifier model", "text", {
      ...when("driver", ...LLM_KEYED),
    }),
    field("summaryModel", "Summaries model", "text", {
      ...when("driver", ...LLM_KEYED),
    }),
    field("summaryVision", "Images in summaries", "boolean", when("driver", ...LLM_KEYED)),
  ],
  decision: [
    field("driver", "Driver", "select", { options: ["systemone", "openai", "disabled"] }),
    field("model", "Model", "text", when("driver", ...DECISION_KEYED)),
    field("baseURL", "Base URL", "url", {
      ...when("driver", "systemone"),
      optional: true,
      description: `Defaults to ${DEFAULT_SYSTEMONE_BASE_URL}.`,
    }),
    field("apiKey", "API key", "secret", {
      ...when("driver", ...DECISION_KEYED),
      optional: true,
      description: "Optional only for systemone.",
    }),
    field(
      "features.classifier",
      DECISION_FEATURE_LABELS.classifier,
      "boolean",
      when("driver", ...DECISION_KEYED),
    ),
    field(
      "features.summaryGate",
      DECISION_FEATURE_LABELS.summaryGate,
      "boolean",
      when("driver", ...DECISION_KEYED),
    ),
    field(
      "features.workflowNode",
      DECISION_FEATURE_LABELS.workflowNode,
      "boolean",
      when("driver", ...DECISION_KEYED),
    ),
    field(
      "classifierBatch",
      "Inbox label calls at a time",
      "number",
      when("driver", ...DECISION_KEYED),
    ),
  ],
  phishingDetection: [
    field("driver", "Driver", "select", { options: ["metis", "disabled"] }),
    field("backendUrl", "Backend URL", "url", when("driver", "metis")),
  ],
  mailer: [
    field("driver", "Driver", "select", {
      options: ["resend", "smtp", "console", "noop", "log"],
    }),
    field("mailFrom", "From", "text", {
      optional: true,
      description: "Required for resend and smtp.",
    }),
    field("fromAuth", "From, for sign-in mail", "text", { optional: true }),
    field("fromInvite", "From, for invites", "text", { optional: true }),
    field("apiKey", "Resend API key", "secret", when("driver", "resend")),
    field("url", "SMTP URL", "secret", {
      ...when("driver", "smtp"),
      optional: true,
      description: "Set either the URL or the host.",
    }),
    field("host", "SMTP host", "text", {
      ...when("driver", "smtp"),
      optional: true,
    }),
    field("port", "SMTP port", "number", {
      ...when("driver", "smtp"),
      optional: true,
    }),
    field("user", "SMTP user", "text", {
      ...when("driver", "smtp"),
      optional: true,
    }),
    field("pass", "SMTP password", "secret", {
      ...when("driver", "smtp"),
      optional: true,
    }),
    field("secure", "Implicit TLS", "boolean", when("driver", "smtp")),
    field("plain", "Allow unencrypted", "boolean", {
      ...when("driver", "smtp"),
      description: PLAIN_DESCRIPTION,
    }),
    field("endpoint", "Console endpoint", "url", when("driver", "console")),
    field("token", "Console token", "secret", when("driver", "console")),
  ],
  signup: [
    field("signupDisabled", "Invite only", "boolean", {
      description:
        "When on, accounts are created only through invites, never through open email/password sign-up.",
    }),
  ],
  legal: [
    field("termsUrl", "Terms URL", "url", { optional: true }),
    field("privacyUrl", "Privacy policy URL", "url", { optional: true }),
    field("version", "Version", "text", {
      description:
        "Changing it asks every new sign-up to agree again; existing consents keep the version they agreed to.",
    }),
  ],
  relay: [
    field("relayMaxMb", "Max transfer size (MB)", "number"),
    field("relayConcurrency", "Transfers per user, per process", "number"),
  ],
  imageProxy: [
    field("enabled", "Proxy remote images", "boolean", {
      description: "When on, users can load remote mail images through this server.",
    }),
    field("maxMb", "Max image size (MB)", "number"),
  ],
  mailCache: [
    field("retentionDays", "Keep message bodies (days)", "number", {
      description:
        "Days a message's body stays stored after it was last opened. Subjects, senders, AI labels, summaries and phishing checks are kept; an older message's body is fetched again when it is opened.",
    }),
  ],
  proxies: [
    field("trustedProxies", "Trusted proxies", "text", {
      optional: true,
      description:
        "IP addresses or CIDR ranges, comma separated, of the proxies in front of this instance. Their X-Forwarded-For hops are skipped when finding a visitor's address for rate limits, sign-in limits and the audit log.",
    }),
  ],
  cache: [
    field("driver", "Driver", "select", {
      options: ["memory", "redis", "upstash"],
    }),
    field("url", "URL", "secret", when("driver", "redis", "upstash")),
    field("token", "Token", "secret", when("driver", "upstash")),
  ],
  workflowRunner: [
    field("driver", "Driver", "select", {
      options: ["internal", "cron", "bullmq"],
    }),
    field("cadenceSec", "Cadence (seconds)", "number"),
    field("tickBudgetMs", "Tick budget (ms)", "number"),
    field("batchSize", "Batch size", "number"),
    field("concurrency", "Concurrency", "number"),
    field("redisUrl", "Redis URL", "secret", when("driver", "bullmq")),
    field("queuePrefix", "Queue prefix", "text", when("driver", "bullmq")),
    field("secret", "Cron secret", "secret", when("driver", "cron")),
    field("stepDataDays", "Keep step data (days)", "number", {
      description:
        "How long a finished run keeps each step's input and output. 0 clears them when the run ends.",
    }),
    field("historyDays", "Keep run history (days)", "number"),
    field("publicUrl", "Public URL for webhooks and push", "url", {
      optional: true,
      description:
        "The HTTPS address providers and webhooks reach this instance at. Without it, triggers poll.",
    }),
    field("trustedProxies", "Trusted proxies", "text", {
      optional: true,
      description:
        "IP addresses or CIDR ranges, comma separated, whose X-Forwarded-For is believed by the Only from these IPs check of webhook triggers. Rate limits and sign-in use the Proxies setting instead.",
    }),
  ],
  google: [
    field("clientId", "Client ID", "text", { optional: true }),
    field("clientSecret", "Client secret", "secret", { optional: true }),
  ],
  microsoft: [
    field("clientId", "Client ID", "text", { optional: true }),
    field("clientSecret", "Client secret", "secret", { optional: true }),
  ],
  zoho: [
    field("clientId", "Client ID", "text", { optional: true }),
    field("clientSecret", "Client secret", "secret", { optional: true }),
    field("region", "Region", "select", { options: [...ZOHO_REGIONS] }),
  ],
};

const ALLOW_INSECURE_TLS = field("allowInsecureTls", "Accept invalid TLS certificates", "boolean");

type ListSection = {
  [K in InstanceSection]: InstanceConfig[K] extends { id: string; name: string }[] ? K : never;
}[InstanceSection];

const LIST_FIELDS: Partial<Record<ListSection, DashboardConfigField[]>> = {
  imapServers: [
    field("name", "Name", "text"),
    field("imap.host", "IMAP host", "text"),
    field("imap.port", "IMAP port", "number"),
    field("imap.secure", "IMAP implicit TLS", "boolean"),
    field("imap.plain", "Allow unencrypted IMAP", "boolean", { description: PLAIN_DESCRIPTION }),
    field("smtp.host", "SMTP host", "text"),
    field("smtp.port", "SMTP port", "number"),
    field("smtp.secure", "SMTP implicit TLS", "boolean"),
    field("smtp.plain", "Allow unencrypted SMTP", "boolean", { description: PLAIN_DESCRIPTION }),
    ALLOW_INSECURE_TLS,
  ],
  caldavServers: [
    field("name", "Name", "text"),
    field("url", "CalDAV URL", "url"),
    ALLOW_INSECURE_TLS,
  ],
  cloudflareServers: [
    field("name", "Name", "text"),
    field("domain", "Domain", "text"),
    field("endpoint", "Worker endpoint", "url"),
  ],
  resendServers: [
    field("name", "Name", "text"),
    field("domain", "Domain", "text"),
    field("endpoint", "Gateway endpoint", "url"),
  ],
  s3Servers: [
    field("name", "Name", "text"),
    field("endpoint", "Endpoint", "url"),
    field("region", "Region", "text"),
    field("accessKeyId", "Access key ID", "text"),
    field("secretAccessKey", "Secret access key", "secret"),
    field("forcePathStyle", "Path-style addressing", "boolean"),
    ALLOW_INSECURE_TLS,
    field("transfer", "Transfers", "select", { options: ["direct", "relay"] }),
    field("partSize", "Part size", "text", {
      ...when("transfer", "relay"),
      description:
        "Relayed uploads go to the bucket in parts of this size, such as 32 MB. Larger parts mean fewer requests per file and more memory per running upload. Between 5 MB and 5 GB.",
    }),
    field("checksums", "Checksums", "select", {
      options: ["required", "supported"],
    }),
  ],
  webdavServers: [
    field("name", "Name", "text"),
    field("url", "WebDAV URL", "url"),
    ALLOW_INSECURE_TLS,
  ],
  ftpServers: [
    field("name", "Name", "text"),
    field("host", "Host", "text"),
    field("port", "Port", "number"),
    field("secure", "TLS", "select", {
      options: ["explicit", "implicit", "none"],
    }),
    ALLOW_INSECURE_TLS,
    field("poolSize", "Pool size", "number"),
  ],
  sftpServers: [
    field("name", "Name", "text"),
    field("host", "Host", "text"),
    field("port", "Port", "number"),
    field("hostKeySha256", "Host key (SHA256)", "text", {
      description: 'As ssh-keygen -l prints it, e.g. "SHA256:…".',
    }),
    field("poolSize", "Pool size", "number"),
  ],
};

export function isListSection(section: InstanceSection): section is ListSection {
  return section in LIST_FIELDS;
}

export function sectionFields(section: InstanceSection): DashboardConfigField[] {
  return (isListSection(section) ? LIST_FIELDS[section] : SCALAR_FIELDS[section]) ?? [];
}

function read(source: unknown, key: string): unknown {
  let current: unknown = source;
  for (const part of key.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = Reflect.get(current, part);
  }
  return current;
}

function write(target: Record<string, unknown>, key: string, value: unknown) {
  const parts = key.split(".");
  let current = target;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    const child: Record<string, unknown> = isRecord(next) ? next : {};
    current[part] = child;
    current = child;
  }
  // oxlint-disable-next-line typescript/no-non-null-assertion --split always yields one part
  current[parts.at(-1)!] = value;
}

export function secretSummary(value: unknown): DashboardSecret {
  if (typeof value !== "string" || !value) return { set: false, hint: null };
  return {
    set: true,
    hint: value.length >= SECRET_HINT_MIN_LENGTH ? value.slice(-4) : null,
  };
}

function formValue(value: unknown): DashboardConfigValue {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return value.join(", ");
  }
  return null;
}

function toForm(
  fields: DashboardConfigField[],
  source: unknown,
): { values: Values; secrets: Secrets } {
  const values: Values = {};
  const secrets: Secrets = {};
  for (const item of fields) {
    const value = read(source, item.key);
    if (item.kind === "secret") secrets[item.key] = secretSummary(value);
    else values[item.key] = formValue(value);
  }
  return { values, secrets };
}

function schemaDefault(schema: z.ZodType, key: string): unknown {
  let current: unknown = schema;
  for (const part of key.split(".")) {
    if (!(current instanceof z.ZodObject)) return undefined;
    current = Reflect.get(current.shape, part);
  }
  return current instanceof z.ZodDefault ? current.def.defaultValue : undefined;
}

function blankEntry(section: ListSection, fields: DashboardConfigField[]): Values {
  const schema = SERVER_ENTRY_SCHEMAS[section];
  const values: Values = {};
  for (const item of fields) {
    if (item.kind === "secret") continue;
    const value = schemaDefault(schema, item.key);
    if (value !== undefined) values[item.key] = formValue(value);
  }
  return values;
}

export function sectionForm(section: InstanceSection, rt: InstanceConfig) {
  const fields = sectionFields(section);
  if (!isListSection(section)) {
    return { list: false, fields, ...toForm(fields, rt[section]), blank: {}, entries: [] };
  }
  const entries = rt[section].map((entry) => ({
    id: entry.id,
    ...toForm(fields, entry),
  }));
  return {
    list: true,
    fields,
    values: {},
    secrets: {},
    blank: blankEntry(section, fields),
    entries,
  };
}

function fromForm(
  fields: DashboardConfigField[],
  values: Values,
  current: unknown,
): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const item of fields) {
    const input = values[item.key];
    if (item.kind === "secret") {
      if (input === null) continue;
      if (typeof input === "string" && input !== "") {
        write(raw, item.key, input);
        continue;
      }
      const kept = read(current, item.key);
      if (kept !== undefined) write(raw, item.key, kept);
      continue;
    }
    if (input === undefined || input === null || input === "") continue;
    if (item.kind === "number" && typeof input === "string") {
      write(raw, item.key, Number(input));
      continue;
    }
    write(raw, item.key, typeof input === "string" ? input.trim() : input);
  }
  return raw;
}

export function newServerId(): string {
  return randomBytes(8).toString("hex");
}

export function sectionFromForm(
  section: InstanceSection,
  input: {
    values: Values;
    entries: { id: string | null; values: Values }[] | null;
  },
  current: InstanceConfig,
): unknown {
  const fields = sectionFields(section);
  if (!isListSection(section)) {
    const raw = fromForm(fields, input.values, current[section]);
    if (section === "mailer") raw.from = raw.mailFrom;
    return raw;
  }
  const existing = new Map(current[section].map((entry) => [entry.id, entry]));
  return (input.entries ?? []).map((entry) => {
    const previous = entry.id ? existing.get(entry.id) : undefined;
    const raw = fromForm(fields, entry.values, previous);
    raw.id = previous?.id ?? newServerId();
    return raw;
  });
}

function display(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function fingerprint(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return createHash("sha256").update(value, "utf8").digest("hex");
}

interface FlatField {
  key: string;
  label: string;
  secret: boolean;
  value: string | null;
}

function flatten(section: InstanceSection, config: InstanceConfig): FlatField[] {
  const fields = sectionFields(section);
  const flat = (source: unknown, prefix: string, labelPrefix: string) =>
    fields.map((item) => {
      const raw = read(source, item.key);
      const secret = item.kind === "secret";
      return {
        key: `${prefix}${item.key}`,
        label: `${labelPrefix}${item.label}`,
        secret,
        value: secret ? fingerprint(raw) : display(raw),
      };
    });
  if (!isListSection(section)) return flat(config[section], "", "");
  return config[section].flatMap((entry) => flat(entry, `${entry.id}.`, `${entry.name} · `));
}

export function changedSecrets(
  section: InstanceSection,
  from: InstanceConfig,
  to: InstanceConfig,
): string[] {
  const before = new Map(flatten(section, from).map((f) => [f.key, f.value]));
  return flatten(section, to)
    .filter((f) => f.secret && before.get(f.key) !== f.value)
    .map((f) => f.key);
}

export function diffSection(section: InstanceSection, from: InstanceConfig, to: InstanceConfig) {
  const before = new Map(flatten(section, from).map((f) => [f.key, f]));
  const after = new Map(flatten(section, to).map((f) => [f.key, f]));
  const keys = [...new Set([...before.keys(), ...after.keys()])];
  const changes = keys.flatMap((key) => {
    const a = before.get(key);
    const b = after.get(key);
    const was = a?.value ?? null;
    const now = b?.value ?? null;
    if (was === now) return [];
    // oxlint-disable-next-line typescript/no-non-null-assertion --the key came from one of the maps
    const meta = (b ?? a)!;
    return [
      {
        key,
        label: meta.label,
        secret: meta.secret,
        from: meta.secret ? null : was,
        to: meta.secret ? null : now,
      },
    ];
  });
  return { section, label: CONFIG_SECTION_LABELS[section], changes };
}
