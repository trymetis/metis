type Env = NodeJS.ProcessEnv;

export function authConfigFromEnv(e: Env): Record<string, unknown> {
  return { secret: e.BETTER_AUTH_SECRET, url: e.BETTER_AUTH_URL };
}

export function dbConfigFromEnv(e: Env): Record<string, unknown> {
  return {
    driver: e.METIS_DB_DRIVER,
    app: { url: e.DATABASE_URL, authToken: e.DATABASE_AUTH_TOKEN },
    mastra: {
      url: e.MASTRA_DATABASE_URL,
      authToken: e.MASTRA_DATABASE_AUTH_TOKEN,
    },
  };
}

export function legalConfigFromEnv(e: Env): Record<string, unknown> {
  return {
    termsUrl: e.METIS_TERMS_URL,
    privacyUrl: e.METIS_PRIVACY_URL,
    version: e.METIS_LEGAL_VERSION,
  };
}

export function appConfigFromEnv(e: Env): Record<string, unknown> {
  return {
    signupDisabled: e.METIS_SIGNUP_DISABLED,
    setupCode: e.METIS_SETUP_CODE,
    ownerEmail: e.METIS_OWNER_EMAIL,
    sourceUrl: e.METIS_SOURCE_URL,
  };
}

export function auditConfigFromEnv(e: Env): Record<string, unknown> {
  return { retentionDays: e.METIS_AUDIT_RETENTION_DAYS };
}

export function encryptionConfigFromEnv(e: Env): Record<string, unknown> {
  return { key: e.METIS_ENCRYPTION_KEY };
}

function providerCredsFromEnv(e: Env, prefix: string): Record<string, unknown> {
  return {
    clientId: e[`${prefix}_CLIENT_ID`],
    clientSecret: e[`${prefix}_CLIENT_SECRET`],
  };
}

export function connectionsConfigFromEnv(e: Env): Record<string, unknown> {
  return {
    google: providerCredsFromEnv(e, "GOOGLE"),
    microsoft: providerCredsFromEnv(e, "MICROSOFT"),
    zoho: providerCredsFromEnv(e, "ZOHO"),
    zohoRegion: e.ZOHO_REGION,
    imapServers: e.METIS_IMAP_SERVERS,
    caldavServers: e.METIS_CALDAV_SERVERS,
    cloudflareServers: e.METIS_CLOUDFLARE_SERVERS,
    resendServers: e.METIS_RESEND_SERVERS,
    s3Servers: e.METIS_S3_SERVERS,
    webdavServers: e.METIS_WEBDAV_SERVERS,
    ftpServers: e.METIS_FTP_SERVERS,
    sftpServers: e.METIS_SFTP_SERVERS,
  };
}

export function driveConfigFromEnv(e: Env): Record<string, unknown> {
  return {
    relayMaxMb: e.METIS_DRIVE_RELAY_MAX_MB,
    relayConcurrency: e.METIS_DRIVE_RELAY_CONCURRENCY,
    relaySecret: e.METIS_DRIVE_RELAY_SECRET,
  };
}

export function updaterConfigFromEnv(e: Env): Record<string, unknown> {
  return { socketPath: e.METIS_UPDATER_SOCKET };
}

export function mailConfigFromEnv(e: Env): Record<string, unknown> {
  return {
    imageProxy: e.METIS_MAIL_IMAGE_PROXY,
    imageProxyMaxMb: e.METIS_MAIL_IMAGE_PROXY_MAX_MB,
  };
}

export function mailCacheConfigFromEnv(e: Env): Record<string, unknown> {
  return { retentionDays: e.METIS_MAIL_CACHE_DAYS };
}

export function proxiesConfigFromEnv(e: Env): Record<string, unknown> {
  return { trustedProxies: e.METIS_TRUSTED_PROXIES };
}

export function mailerConfigFromEnv(e: Env): Record<string, unknown> {
  return {
    driver: e.METIS_MAIL_DRIVER,
    mailFrom: e.MAIL_FROM,
    fromAuth: e.MAIL_FROM_AUTH,
    fromInvite: e.MAIL_FROM_INVITE,
    apiKey: e.RESEND_API_KEY,
    url: e.SMTP_URL,
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    user: e.SMTP_USER,
    pass: e.SMTP_PASS,
    secure: e.SMTP_SECURE,
    plain: e.SMTP_PLAIN,
    endpoint: e.CONSOLE_MAIL_URL,
    token: e.CONSOLE_MAIL_TOKEN,
  };
}

export function llmConfigFromEnv(e: Env): Record<string, unknown> {
  return {
    driver: e.METIS_LLM_DRIVER,
    baseUrl: e.METIS_LLM_BASE_URL,
    name: e.METIS_LLM_NAME,
    structuredOutputs: e.METIS_LLM_STRUCTURED_OUTPUTS,
    chatModel: e.METIS_LLM_CHAT_MODEL,
    smartReplyModel: e.METIS_LLM_SMART_REPLY_MODEL,
    classifierModel: e.METIS_LLM_CLASSIFIER_MODEL,
    summaryModel: e.METIS_LLM_SUMMARY_MODEL,
    summaryVision: e.METIS_LLM_SUMMARY_VISION,
  };
}

const LLM_API_KEY_ENV: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  "openai-compatible": "METIS_LLM_API_KEY",
};

export function llmApiKeyFromEnv(e: Env, driver: unknown): string | undefined {
  const name = typeof driver === "string" ? LLM_API_KEY_ENV[driver] : undefined;
  return name ? e[name] : undefined;
}

export function decisionConfigFromEnv(e: Env): Record<string, unknown> {
  return {
    driver: e.METIS_DECISION_DRIVER,
    model: e.METIS_DECISION_MODEL,
    baseURL: e.METIS_DECISION_BASE_URL,
    features: {
      classifier: e.METIS_DECISION_CLASSIFIER,
      summaryGate: e.METIS_DECISION_SUMMARY_GATE,
      workflowNode: e.METIS_DECISION_WORKFLOW_NODE,
    },
    classifierBatch: e.METIS_DECISION_CLASSIFIER_BATCH,
  };
}

const DECISION_API_KEY_ENV: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  systemone: "METIS_DECISION_API_KEY",
};

export function decisionApiKeyFromEnv(e: Env, driver: unknown): string | undefined {
  const name = typeof driver === "string" ? DECISION_API_KEY_ENV[driver] : undefined;
  return name ? e[name] : undefined;
}

export function cacheConfigFromEnv(e: Env): Record<string, unknown> {
  return {
    driver: e.METIS_CACHE_DRIVER,
    url: e.METIS_CACHE_URL,
    token: e.METIS_CACHE_TOKEN,
  };
}

export function workflowRunnerConfigFromEnv(e: Env): Record<string, unknown> {
  return {
    driver: e.METIS_WORKFLOW_RUNNER_DRIVER,
    cadenceSec: e.METIS_WORKFLOW_CADENCE_SEC,
    tickBudgetMs: e.METIS_WORKFLOW_TICK_BUDGET_MS,
    batchSize: e.METIS_WORKFLOW_BATCH_SIZE,
    concurrency: e.METIS_WORKFLOW_CONCURRENCY,
    redisUrl: e.METIS_WORKFLOW_REDIS_URL,
    queuePrefix: e.METIS_WORKFLOW_QUEUE_PREFIX,
    secret: e.CRON_SECRET,
    stepDataDays: e.METIS_WORKFLOW_STEP_DATA_DAYS,
    historyDays: e.METIS_WORKFLOW_HISTORY_DAYS,
    publicUrl: e.METIS_WORKFLOW_PUBLIC_URL,
    trustedProxies: e.METIS_WORKFLOW_TRUSTED_PROXIES,
  };
}

export function phishingDetectionConfigFromEnv(e: Env): Record<string, unknown> {
  return {
    driver: e.METIS_PHISHING_DETECTION_DRIVER,
    backendUrl: e.BACKEND_URL,
  };
}
