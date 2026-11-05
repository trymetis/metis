import { createHash } from "node:crypto";
import { isIP } from "node:net";

import { z } from "zod";

import { isRecord, keysOf } from "@/lib/guards";
import { parseSize } from "@/lib/size";

const S3_PART_SIZE_MIN = 5 * 1024 ** 2;
const S3_PART_SIZE_MAX = 5 * 1024 ** 3;

const envBoolBaseSchema = z.enum(["true", "false", "0", "1"]);
export const envBoolSchema = (defaultVal?: boolean) => {
  const base = z.union([
    z.boolean(),
    envBoolBaseSchema.transform((v) => v === "true" || v === "1"),
  ]);
  return typeof defaultVal === "boolean" ? base.default(defaultVal) : base;
};

export const authConfigSchema = z
  .object({
    secret: z.string().min(32),
    url: z.url().default("http://localhost:3000"),
  })
  .transform((cfg) => ({
    ...cfg,
    secureCookies: cfg.url.startsWith("https://"),
  }));

const sqldConnection = z.object({
  url: z.string().regex(/^(https?|wss?):\/\//, "sqld needs an http(s):// or ws(s):// URL"),
  authToken: z.string().min(1),
});
const tursoConnection = z.object({
  url: z.string().regex(/^libsql:\/\//, "Turso needs a libsql:// URL"),
  authToken: z.string().min(1),
});
const localConnection = z.object({
  url: z.string().regex(/^file:/, "the local driver needs a file: URL"),
});

export const dbConfigSchema = z.discriminatedUnion("driver", [
  z.object({
    driver: z.literal("sqld"),
    app: sqldConnection,
    mastra: sqldConnection,
  }),
  z.object({
    driver: z.literal("turso"),
    app: tursoConnection,
    mastra: tursoConnection,
  }),
  z.object({
    driver: z.literal("local"),
    app: localConnection,
    mastra: localConnection,
  }),
]);

export const legalConfigSchema = z.object({
  termsUrl: z.url().optional(),
  privacyUrl: z.url().optional(),
  version: z.string().min(1).default("1"),
});

export const appConfigSchema = z.object({
  setupCode: z.string().min(8).optional(),
  ownerEmail: z.email().trim().toLowerCase().optional(),
  sourceUrl: z.url().default("https://github.com/trymetis/metis"),
});

export const auditConfigSchema = z.object({
  retentionDays: z.coerce.number().int().min(1).default(365),
});

export const signupSectionSchema = z.object({
  signupDisabled: envBoolSchema(true),
});

export const encryptionConfigSchema = z.object({
  key: z.string().refine((v) => Buffer.from(v, "base64").length === 32, {
    message: "must be 32 bytes, base64-encoded",
  }),
});

const providerCredsSchema = z.object({
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().min(1).optional(),
});

const serverNameSchema = z.string().trim().min(1).max(64);

const serverIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "A server id uses only letters, digits, - and _");

export const SERVER_LIST_PROVIDERS = [
  "imap",
  "caldav",
  "cloudflare",
  "resend",
  "s3",
  "webdav",
  "ftp",
  "sftp",
] as const;
export type ServerListProvider = (typeof SERVER_LIST_PROVIDERS)[number];

export function serverEntryId(provider: ServerListProvider, name: string): string {
  return createHash("sha256").update(`${provider}|${name}`, "utf8").digest("hex").slice(0, 16);
}

const serverHostSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(
    (value) => !/[\s/\\@]/.test(value),
    "Enter a hostname such as imap.example.com, not a URL",
  );

const serverPortSchema = z.coerce.number().int().min(1).max(65535);

const PLAIN_WITH_IMPLICIT_TLS = "Allow unencrypted applies only when implicit TLS is off";

function mailEndpointSchema(defaultPort: number) {
  return z
    .object({
      host: serverHostSchema,
      port: serverPortSchema.default(defaultPort),
      secure: z.boolean().default(true),
      plain: z.boolean().default(false),
    })
    .refine((endpoint) => !(endpoint.secure && endpoint.plain), {
      message: PLAIN_WITH_IMPLICIT_TLS,
      path: ["plain"],
    });
}

const imapServerSchema = z.object({
  id: serverIdSchema.optional(),
  name: serverNameSchema,
  imap: mailEndpointSchema(993),
  smtp: mailEndpointSchema(465),
  allowInsecureTls: z.boolean().default(false),
});

const caldavServerSchema = z.object({
  id: serverIdSchema.optional(),
  name: serverNameSchema,
  url: z
    .string()
    .trim()
    .refine((value) => /^https?:\/\//i.test(value), "Enter the full CalDAV URL, including https://")
    .refine((value) => URL.canParse(value), "That is not a valid URL"),
  allowInsecureTls: z.boolean().default(false),
});

const gatewayServerSchema = z.object({
  id: serverIdSchema.optional(),
  name: serverNameSchema,
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .refine((value) => !/[\s/\\@]/.test(value), "Enter a bare domain such as example.com"),
  endpoint: z
    .string()
    .trim()
    .refine((value) => /^https:\/\//i.test(value), "The Worker endpoint must be an https:// URL")
    .refine((value) => URL.canParse(value), "That is not a valid URL")
    .transform((value) => value.replace(/\/+$/, "")),
});

const s3ServerSchema = z
  .object({
    id: serverIdSchema.optional(),
    name: serverNameSchema,
    endpoint: z
      .string()
      .trim()
      .refine(
        (value) => /^https?:\/\//i.test(value),
        "The S3 endpoint must include http:// or https://",
      )
      .refine((value) => URL.canParse(value), "That is not a valid URL")
      .transform((value) => value.replace(/\/+$/, "")),
    region: z.string().trim().min(1).default("us-east-1"),
    accessKeyId: z.string().trim().min(1),
    secretAccessKey: z.string().min(1),
    forcePathStyle: z.boolean().default(true),
    allowInsecureTls: z.boolean().default(false),
    transfer: z.enum(["direct", "relay"]).default("direct"),
    checksums: z.enum(["required", "supported"]).default("required"),
    partSize: z.string().trim().default("32 MB"),
  })
  .superRefine((server, ctx) => {
    if (server.transfer !== "relay") return;
    const bytes = /[a-z]$/i.test(server.partSize) ? parseSize(server.partSize) : null;
    if (bytes === null) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a size with its unit, such as 32 MB",
        path: ["partSize"],
      });
    } else if (bytes < S3_PART_SIZE_MIN || bytes > S3_PART_SIZE_MAX) {
      ctx.addIssue({
        code: "custom",
        message: "The part size must be between 5 MB and 5 GB",
        path: ["partSize"],
      });
    }
  });

const webdavServerSchema = z.object({
  id: serverIdSchema.optional(),
  name: serverNameSchema,
  url: z
    .string()
    .trim()
    .refine((value) => /^https?:\/\//i.test(value), "Enter the full WebDAV URL, including https://")
    .refine((value) => URL.canParse(value), "That is not a valid URL")
    .transform((value) => (value.endsWith("/") ? value : `${value}/`)),
  allowInsecureTls: z.boolean().default(false),
});

const ftpServerSchema = z.object({
  id: serverIdSchema.optional(),
  name: serverNameSchema,
  host: serverHostSchema,
  port: serverPortSchema.default(21),
  secure: z.enum(["explicit", "implicit", "none"]).default("explicit"),
  allowInsecureTls: z.boolean().default(false),
  poolSize: z.number().int().min(1).max(10).default(2),
});

const sftpServerSchema = z.object({
  id: serverIdSchema.optional(),
  name: serverNameSchema,
  host: serverHostSchema,
  port: serverPortSchema.default(22),
  hostKeySha256: z
    .string()
    .trim()
    .transform((value) => value.replace(/^SHA256:/i, "").replace(/=+$/, ""))
    .refine(
      (value) => /^[A-Za-z0-9+/]{43}$/.test(value),
      'Enter the host key fingerprint as ssh-keygen -l prints it, e.g. "SHA256:…"',
    ),
  poolSize: z.number().int().min(1).max(10).default(3),
});

function serverListSchema<Entry extends z.ZodType<{ id?: string; name: string }>>(
  provider: ServerListProvider,
  entry: Entry,
) {
  return z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    },
    z
      .array(entry)
      .default([])
      .transform((servers) =>
        servers.map((server) => ({
          ...server,
          id: server.id ?? serverEntryId(provider, server.name),
        })),
      )
      .refine(
        (servers) => new Set(servers.map((server) => server.name)).size === servers.length,
        "Each server needs a distinct name",
      )
      .refine(
        (servers) => new Set(servers.map((server) => server.id)).size === servers.length,
        "Each server needs a distinct id",
      ),
  );
}

export const ZOHO_REGIONS = ["com", "in", "eu", "com.au", "jp"] as const;

const zohoRegionSchema = z.enum(ZOHO_REGIONS).default("com");

export const SERVER_ENTRY_SCHEMAS = {
  imapServers: imapServerSchema,
  caldavServers: caldavServerSchema,
  cloudflareServers: gatewayServerSchema,
  resendServers: gatewayServerSchema,
  s3Servers: s3ServerSchema,
  webdavServers: webdavServerSchema,
  ftpServers: ftpServerSchema,
  sftpServers: sftpServerSchema,
} as const;

export const imapServersSchema = serverListSchema("imap", imapServerSchema);
export const caldavServersSchema = serverListSchema("caldav", caldavServerSchema);
export const cloudflareServersSchema = serverListSchema("cloudflare", gatewayServerSchema);
export const resendServersSchema = serverListSchema("resend", gatewayServerSchema);
export const s3ServersSchema = serverListSchema("s3", s3ServerSchema);
export const webdavServersSchema = serverListSchema("webdav", webdavServerSchema);
export const ftpServersSchema = serverListSchema("ftp", ftpServerSchema);
export const sftpServersSchema = serverListSchema("sftp", sftpServerSchema);

export const driveConfigSchema = z.object({
  relaySecret: z.string().min(32).optional(),
});

export const relaySectionSchema = z.object({
  relayMaxMb: z.coerce.number().int().positive().default(256),
  relayConcurrency: z.coerce.number().int().positive().default(3),
});

export const updaterConfigSchema = z.object({
  socketPath: z
    .string()
    .startsWith("/", "METIS_UPDATER_SOCKET must be an absolute path")
    .optional(),
});

export const imageProxySectionSchema = z.object({
  enabled: envBoolSchema(false),
  maxMb: z.coerce.number().positive().max(100).default(10),
});

const mailerCommonSchema = z.object({
  mailFrom: z.string().optional(),
  fromAuth: z.string().optional(),
  fromInvite: z.string().optional(),
});

const mailerDriverSchema = z
  .discriminatedUnion("driver", [
    z.object({
      driver: z.literal("resend"),
      apiKey: z.string().min(1),
      from: z.string().min(1),
    }),
    z.object({
      driver: z.literal("smtp"),
      from: z.string().min(1),
      url: z.string().optional(),
      host: z.string().optional(),
      port: z.coerce.number().int().positive().optional(),
      user: z.string().optional(),
      pass: z.string().optional(),
      secure: envBoolSchema().optional(),
      plain: envBoolSchema().optional(),
    }),
    z.object({
      driver: z.literal("console"),
      endpoint: z.url(),
      token: z.string().min(1),
    }),
    z.object({ driver: z.literal("noop") }),
    z.object({ driver: z.literal("log") }),
  ])
  .superRefine((val, ctx) => {
    if (val.driver === "smtp" && !val.url && !val.host) {
      ctx.addIssue({
        code: "custom",
        message: "SMTP_URL or SMTP_HOST is required when METIS_MAIL_DRIVER=smtp",
        path: ["host"],
      });
    }
    if (val.driver === "smtp" && val.plain === true && val.secure === true) {
      ctx.addIssue({
        code: "custom",
        message: PLAIN_WITH_IMPLICIT_TLS,
        path: ["plain"],
      });
    }
  });

const DEFAULT_MAIL_FROM = "Metis Suite <noreply@localhost>";

function withDefaultDriver<Schema extends z.ZodType>(driver: string, schema: Schema) {
  return z.preprocess((value) => {
    const raw = isRecord(value) ? value : {};
    return { ...raw, driver: raw.driver ?? driver };
  }, schema);
}

export const mailerConfigSchema = z.preprocess(
  (value) => {
    const raw = isRecord(value) ? value : {};
    return {
      ...raw,
      driver: raw.driver ?? "log",
      from: raw.from ?? raw.mailFrom,
    };
  },
  z.intersection(mailerCommonSchema, mailerDriverSchema).transform((cfg) => {
    const fallback = cfg.mailFrom ?? DEFAULT_MAIL_FROM;
    return {
      ...cfg,
      fromAuth: cfg.fromAuth ?? fallback,
      fromInvite: cfg.fromInvite ?? fallback,
    };
  }),
);

const llmModelFields = {
  chatModel: z.string().min(1),
  smartReplyModel: z.string().min(1),
  classifierModel: z.string().min(1),
  summaryModel: z.string().min(1),
  summaryVision: envBoolSchema(false),
};

export const llmConfigSchema = withDefaultDriver(
  "disabled",
  z
    .discriminatedUnion("driver", [
      z.object({
        driver: z.literal("openai"),
        apiKey: z.string().min(1),
        ...llmModelFields,
      }),
      z.object({
        driver: z.literal("anthropic"),
        apiKey: z.string().min(1),
        ...llmModelFields,
      }),
      z.object({
        driver: z.literal("openai-compatible"),
        baseUrl: z.url(),
        name: z.string().optional(),
        apiKey: z.string().optional(),
        structuredOutputs: envBoolSchema(false),
        ...llmModelFields,
      }),
      z.object({ driver: z.literal("disabled") }),
    ])
    .transform((cfg) => ({ ...cfg, enabled: cfg.driver !== "disabled" })),
);

const decisionSwitchSchema = z.union([z.boolean(), envBoolSchema()]).default(false);

const decisionFeaturesSchema = z.object({
  classifier: decisionSwitchSchema,
  summaryGate: decisionSwitchSchema,
  workflowNode: decisionSwitchSchema,
});

export type DecisionFeature = keyof z.infer<typeof decisionFeaturesSchema>;

export const DEFAULT_DECISION_CLASSIFIER_BATCH = 5;

const decisionClassifierBatchSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(25)
  .default(DEFAULT_DECISION_CLASSIFIER_BATCH);

export const DEFAULT_SYSTEMONE_BASE_URL = "https://api.typesafe.ai/v1";

export const decisionConfigSchema = z
  .preprocess(
    (value) => {
      const raw = isRecord(value) ? value : {};
      return {
        ...raw,
        driver: raw.driver ?? "disabled",
        features: raw.features ?? {},
      };
    },
    z.discriminatedUnion("driver", [
      z.object({
        driver: z.literal("systemone"),
        model: z.string().min(1),
        baseURL: z
          .url()
          .default(DEFAULT_SYSTEMONE_BASE_URL)
          .transform((value) => value.replace(/\/+$/, "")),
        apiKey: z.string().min(1).optional(),
        features: decisionFeaturesSchema,
        classifierBatch: decisionClassifierBatchSchema,
      }),
      z.object({
        driver: z.literal("openai"),
        model: z.string().min(1),
        apiKey: z.string().min(1),
        features: decisionFeaturesSchema,
        classifierBatch: decisionClassifierBatchSchema,
      }),
      z.object({ driver: z.literal("disabled") }),
    ]),
  )
  .transform((cfg) => ({ ...cfg, enabled: cfg.driver !== "disabled" }));

export const cacheConfigSchema = withDefaultDriver(
  "memory",
  z.discriminatedUnion("driver", [
    z.object({ driver: z.literal("memory") }),
    z.object({ driver: z.literal("redis"), url: z.string().min(1) }),
    z.object({
      driver: z.literal("upstash"),
      url: z.string().min(1),
      token: z.string().min(1),
    }),
  ]),
);

export const CRON_TICK_ROUTE_MAX_SECONDS = 60;
const CRON_TICK_BUDGET_MAX_MS = (CRON_TICK_ROUTE_MAX_SECONDS - 5) * 1000;

export function isIpOrRange(entry: string): boolean {
  const [address = "", prefix, ...rest] = entry.split("/");
  const family = isIP(address);
  if (!family || rest.length > 0) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  return Number(prefix) <= (family === 4 ? 32 : 128);
}

const trustedProxiesSchema = z
  .union([z.array(z.string()), z.string()])
  .transform((value) =>
    (Array.isArray(value) ? value : value.split(",")).map((entry) => entry.trim()).filter(Boolean),
  )
  .pipe(z.array(z.string().refine(isIpOrRange, "must be an IP address or CIDR range")).max(50))
  .default([]);

export const mailCacheSectionSchema = z.object({
  retentionDays: z.coerce.number().int().min(1).max(3650).default(30),
});

export const proxiesSectionSchema = z.object({
  trustedProxies: trustedProxiesSchema,
});

const workflowRunnerShared = {
  cadenceSec: z.coerce.number().int().min(1).max(86_400).default(60),
  tickBudgetMs: z.coerce.number().int().min(1_000).max(600_000).default(45_000),
  batchSize: z.coerce.number().int().min(1).max(500).default(25),
  concurrency: z.coerce.number().int().min(1).max(64).default(4),
  stepDataDays: z.coerce.number().int().min(0).max(365).default(7),
  historyDays: z.coerce.number().int().min(1).max(3650).default(90),
  publicUrl: z.url().optional(),
  trustedProxies: trustedProxiesSchema,
};

export const workflowRunnerConfigSchema = withDefaultDriver(
  "internal",
  z.discriminatedUnion("driver", [
    z.object({
      driver: z.literal("bullmq"),
      redisUrl: z.string().min(1),
      queuePrefix: z.string().min(1).max(64).default("metis-workflows"),
      ...workflowRunnerShared,
    }),
    z.object({
      driver: z.literal("cron"),
      secret: z.string().min(1),
      ...workflowRunnerShared,
      tickBudgetMs: z.coerce.number().int().min(1_000).max(CRON_TICK_BUDGET_MAX_MS).default(45_000),
    }),
    z.object({
      driver: z.literal("internal"),
      ...workflowRunnerShared,
    }),
  ]),
);

export const phishingDetectionConfigSchema = withDefaultDriver(
  "disabled",
  z
    .discriminatedUnion("driver", [
      z.object({ driver: z.literal("metis"), backendUrl: z.url() }),
      z.object({ driver: z.literal("disabled") }),
    ])
    .transform((cfg) => ({ ...cfg, enabled: cfg.driver !== "disabled" })),
);

export const DECISION_FEATURE_LABELS: Record<DecisionFeature, string> = {
  classifier: "Inbox labels",
  summaryGate: "Summary gate",
  workflowNode: "Workflow Ask and Branch",
};

export interface ConfigIssue {
  path: (string | number)[];
  message: string;
}

export function crossCheckConfig(boot: BootConfig, instance: InstanceConfig): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const { drive } = boot;
  const { decision } = instance;
  if (decision.driver !== "disabled" && !instance.llm.enabled) {
    for (const feature of keysOf(DECISION_FEATURE_LABELS)) {
      if (!decision.features[feature]) {
        continue;
      }
      issues.push({
        path: ["decision", "features", feature],
        message: `The decision model's ${DECISION_FEATURE_LABELS[feature]} switch is on, but the LLM driver is disabled, which turns AI off for the whole instance. Configure an LLM driver or turn the switch off.`,
      });
    }
  }
  const relays =
    instance.webdavServers.length > 0 ||
    instance.ftpServers.length > 0 ||
    instance.sftpServers.length > 0 ||
    instance.s3Servers.some((server) => server.transfer === "relay");
  if (relays && !drive.relaySecret) {
    issues.push({
      path: ["drive", "relaySecret"],
      message:
        'METIS_DRIVE_RELAY_SECRET (32+ characters) is required when a WebDAV, FTP or SFTP server, or an S3 server with "transfer": "relay", is configured.',
    });
  }
  return issues;
}

export const bootConfigSchema = z.object({
  auth: authConfigSchema,
  db: dbConfigSchema,
  encryption: encryptionConfigSchema,
  app: appConfigSchema,
  audit: auditConfigSchema,
  drive: driveConfigSchema,
  updater: updaterConfigSchema,
});

export const oauthClientSchema = providerCredsSchema;

export const zohoClientSchema = providerCredsSchema.extend({
  region: zohoRegionSchema,
});

export const instanceConfigSchema = z.object({
  llm: llmConfigSchema,
  decision: decisionConfigSchema,
  phishingDetection: phishingDetectionConfigSchema,
  mailer: mailerConfigSchema,
  signup: signupSectionSchema,
  legal: legalConfigSchema,
  relay: relaySectionSchema,
  imageProxy: imageProxySectionSchema,
  proxies: proxiesSectionSchema,
  mailCache: mailCacheSectionSchema,
  cache: cacheConfigSchema,
  workflowRunner: workflowRunnerConfigSchema,
  google: oauthClientSchema,
  microsoft: oauthClientSchema,
  zoho: zohoClientSchema,
  imapServers: imapServersSchema,
  caldavServers: caldavServersSchema,
  cloudflareServers: cloudflareServersSchema,
  resendServers: resendServersSchema,
  s3Servers: s3ServersSchema,
  webdavServers: webdavServersSchema,
  ftpServers: ftpServersSchema,
  sftpServers: sftpServersSchema,
});

export type AuthConfig = z.infer<typeof authConfigSchema>;
export type DbConfig = z.infer<typeof dbConfigSchema>;
export type LegalConfig = z.infer<typeof legalConfigSchema>;
export type AppConfig = z.infer<typeof appConfigSchema>;
export type EncryptionConfig = z.infer<typeof encryptionConfigSchema>;
export type ProviderCreds = z.infer<typeof providerCredsSchema>;
export type ImapServerConfig = z.infer<typeof imapServerSchema>;
export type CaldavServerConfig = z.infer<typeof caldavServerSchema>;
export type GatewayServerConfig = z.infer<typeof gatewayServerSchema>;
export type S3ServerConfig = z.infer<typeof s3ServerSchema>;
export type WebdavServerConfig = z.infer<typeof webdavServerSchema>;
export type FtpServerConfig = z.infer<typeof ftpServerSchema>;
export type SftpServerConfig = z.infer<typeof sftpServerSchema>;
export type DriveConfig = z.infer<typeof driveConfigSchema>;
export type CloudflareServerConfig = GatewayServerConfig;
export type ResendServerConfig = GatewayServerConfig;

export type MailerConfig = z.infer<typeof mailerConfigSchema>;
export type ResendMailerConfig = Extract<MailerConfig, { driver: "resend" }>;
export type SmtpMailerConfig = Extract<MailerConfig, { driver: "smtp" }>;
export type ConsoleMailerConfig = Extract<MailerConfig, { driver: "console" }>;
export type NoopMailerConfig = Extract<MailerConfig, { driver: "noop" }>;
export type LogMailerConfig = Extract<MailerConfig, { driver: "log" }>;

export type LlmConfig = z.infer<typeof llmConfigSchema>;
export type OpenAILLMConfig = Extract<LlmConfig, { driver: "openai" }>;
export type AnthropicLLMConfig = Extract<LlmConfig, { driver: "anthropic" }>;
export type OpenAICompatibleLLMConfig = Extract<LlmConfig, { driver: "openai-compatible" }>;
export type DisabledLLMConfig = Extract<LlmConfig, { driver: "disabled" }>;

export type DecisionConfig = z.infer<typeof decisionConfigSchema>;
export type SystemOneDecisionConfig = Extract<DecisionConfig, { driver: "systemone" }>;
export type OpenAIDecisionConfig = Extract<DecisionConfig, { driver: "openai" }>;

export type CacheConfig = z.infer<typeof cacheConfigSchema>;
export type MemoryCacheConfig = Extract<CacheConfig, { driver: "memory" }>;
export type RedisCacheConfig = Extract<CacheConfig, { driver: "redis" }>;
export type UpstashCacheConfig = Extract<CacheConfig, { driver: "upstash" }>;

export type WorkflowRunnerConfig = z.infer<typeof workflowRunnerConfigSchema>;
export type BullmqRunnerConfig = Extract<WorkflowRunnerConfig, { driver: "bullmq" }>;
export type CronRunnerConfig = Extract<WorkflowRunnerConfig, { driver: "cron" }>;
export type InternalRunnerConfig = Extract<WorkflowRunnerConfig, { driver: "internal" }>;

export type PhishingDetectionConfig = z.infer<typeof phishingDetectionConfigSchema>;
export type MetisPhishingDetectionConfig = Extract<PhishingDetectionConfig, { driver: "metis" }>;
export type DisabledPhishingDetectionConfig = Extract<
  PhishingDetectionConfig,
  { driver: "disabled" }
>;

export type BootConfig = z.infer<typeof bootConfigSchema>;

export type InstanceConfig = z.infer<typeof instanceConfigSchema>;
export type InstanceSection = keyof InstanceConfig;
export type ZohoRegion = (typeof ZOHO_REGIONS)[number];
