import type { instanceConfig } from "@/db/schema";
import { isRecord } from "@/lib/guards";

import { type InstanceConfig, instanceConfigSchema, isIpOrRange } from "./schema";

export type InstanceConfigRow = typeof instanceConfig.$inferSelect;

export type InstanceConfigSettings = Omit<
  typeof instanceConfig.$inferInsert,
  | "version"
  | "isCurrent"
  | "changedKeys"
  | "kind"
  | "revertedFromVersion"
  | "createdByUserId"
  | "createdAt"
>;

interface StoredServers {
  imap: InstanceConfig["imapServers"];
  caldav: InstanceConfig["caldavServers"];
  carddav: InstanceConfig["carddavServers"];
  cloudflare: InstanceConfig["cloudflareServers"];
  resend: InstanceConfig["resendServers"];
  ses: InstanceConfig["sesServers"];
  s3: InstanceConfig["s3Servers"];
  webdav: InstanceConfig["webdavServers"];
  ftp: InstanceConfig["ftpServers"];
  sftp: InstanceConfig["sftpServers"];
}

const u = <T>(value: T | null | undefined): T | undefined => value ?? undefined;

export function instanceConfigToRow(rt: InstanceConfig): InstanceConfigSettings {
  const llm = rt.llm.driver === "disabled" ? null : rt.llm;
  const compatible = rt.llm.driver === "openai-compatible" ? rt.llm : null;
  const decision = rt.decision.driver === "disabled" ? null : rt.decision;
  const mailer = rt.mailer;
  const smtp = mailer.driver === "smtp" ? mailer : null;
  const cache = rt.cache;
  const runner = rt.workflowRunner;
  const servers: StoredServers = {
    imap: rt.imapServers,
    caldav: rt.caldavServers,
    carddav: rt.carddavServers,
    cloudflare: rt.cloudflareServers,
    resend: rt.resendServers,
    ses: rt.sesServers,
    s3: rt.s3Servers,
    webdav: rt.webdavServers,
    ftp: rt.ftpServers,
    sftp: rt.sftpServers,
  };

  return {
    llmDriver: rt.llm.driver,
    llmApiKey: llm?.apiKey ?? null,
    llmBaseUrl: compatible?.baseUrl ?? null,
    llmName: compatible?.name ?? null,
    llmStructuredOutputs: compatible ? compatible.structuredOutputs : null,
    llmChatModel: llm?.chatModel ?? null,
    llmSmartReplyModel: llm?.smartReplyModel ?? null,
    llmClassifierModel: llm?.classifierModel ?? null,
    llmSummaryModel: llm?.summaryModel ?? null,
    llmSummaryVision: llm ? llm.summaryVision : null,
    decisionDriver: rt.decision.driver,
    decisionModel: decision?.model ?? null,
    decisionBaseUrl: decision?.driver === "systemone" ? decision.baseURL : null,
    decisionApiKey: decision?.apiKey ?? null,
    decisionClassifier: decision?.features.classifier ?? false,
    decisionSummaryGate: decision?.features.summaryGate ?? false,
    decisionWorkflowNode: decision?.features.workflowNode ?? false,
    decisionClassifierBatch: decision?.classifierBatch ?? null,
    phishingDriver: rt.phishingDetection.driver,
    phishingBackendUrl:
      rt.phishingDetection.driver === "metis" ? rt.phishingDetection.backendUrl : null,
    mailDriver: mailer.driver,
    mailFrom: mailer.mailFrom ?? ("from" in mailer ? mailer.from : null),
    mailFromAuth: mailer.fromAuth,
    mailFromInvite: mailer.fromInvite,
    mailResendApiKey: mailer.driver === "resend" ? mailer.apiKey : null,
    mailSmtpUrl: smtp?.url ?? null,
    mailSmtpHost: smtp?.host ?? null,
    mailSmtpPort: smtp?.port ?? null,
    mailSmtpUser: smtp?.user ?? null,
    mailSmtpPass: smtp?.pass ?? null,
    mailSmtpSecure: smtp?.secure ?? null,
    mailSmtpPlain: smtp?.plain ?? null,
    mailConsoleUrl: mailer.driver === "console" ? mailer.endpoint : null,
    mailConsoleToken: mailer.driver === "console" ? mailer.token : null,
    signupDisabled: rt.signup.signupDisabled,
    legalTermsUrl: rt.legal.termsUrl ?? null,
    legalPrivacyUrl: rt.legal.privacyUrl ?? null,
    legalVersion: rt.legal.version,
    relayMaxMb: rt.relay.relayMaxMb,
    relayConcurrency: rt.relay.relayConcurrency,
    imageProxyEnabled: rt.imageProxy.enabled,
    imageProxyMaxMb: rt.imageProxy.maxMb,
    trustedProxies: rt.proxies.trustedProxies,
    mailCacheDays: rt.mailCache.retentionDays,
    cacheDriver: cache.driver,
    cacheUrl: cache.driver === "memory" ? null : cache.url,
    cacheToken: cache.driver === "upstash" ? cache.token : null,
    runnerDriver: runner.driver,
    runnerCadenceSec: runner.cadenceSec,
    runnerTickBudgetMs: runner.tickBudgetMs,
    runnerBatchSize: runner.batchSize,
    runnerConcurrency: runner.concurrency,
    runnerRedisUrl: runner.driver === "bullmq" ? runner.redisUrl : null,
    runnerQueuePrefix: runner.driver === "bullmq" ? runner.queuePrefix : null,
    runnerCronSecret: runner.driver === "cron" ? runner.secret : null,
    runnerStepDataDays: runner.stepDataDays,
    runnerHistoryDays: runner.historyDays,
    runnerPublicUrl: runner.publicUrl ?? null,
    runnerTrustedProxies: runner.trustedProxies,
    googleClientId: rt.google.clientId ?? null,
    googleClientSecret: rt.google.clientSecret ?? null,
    microsoftClientId: rt.microsoft.clientId ?? null,
    microsoftClientSecret: rt.microsoft.clientSecret ?? null,
    zohoClientId: rt.zoho.clientId ?? null,
    zohoClientSecret: rt.zoho.clientSecret ?? null,
    zohoRegion: rt.zoho.region,
    servers: JSON.stringify(servers),
  };
}

export function rowToInstanceConfig(row: InstanceConfigSettings): InstanceConfig {
  const parsedServers: unknown = JSON.parse(row.servers);
  const servers: Partial<Record<keyof StoredServers, unknown>> = isRecord(parsedServers)
    ? parsedServers
    : {};
  return instanceConfigSchema.parse({
    llm: {
      driver: row.llmDriver,
      apiKey: u(row.llmApiKey),
      baseUrl: u(row.llmBaseUrl),
      name: u(row.llmName),
      structuredOutputs: u(row.llmStructuredOutputs),
      chatModel: u(row.llmChatModel),
      smartReplyModel: u(row.llmSmartReplyModel),
      classifierModel: u(row.llmClassifierModel),
      summaryModel: u(row.llmSummaryModel),
      summaryVision: u(row.llmSummaryVision),
    },
    decision: {
      driver: u(row.decisionDriver),
      model: u(row.decisionModel),
      baseURL: u(row.decisionBaseUrl),
      apiKey: u(row.decisionApiKey),
      features: {
        classifier: u(row.decisionClassifier),
        summaryGate: u(row.decisionSummaryGate),
        workflowNode: u(row.decisionWorkflowNode),
      },
      classifierBatch: u(row.decisionClassifierBatch),
    },
    phishingDetection: {
      driver: row.phishingDriver,
      backendUrl: u(row.phishingBackendUrl),
    },
    mailer: {
      driver: row.mailDriver,
      mailFrom: u(row.mailFrom),
      from: u(row.mailFrom),
      fromAuth: u(row.mailFromAuth),
      fromInvite: u(row.mailFromInvite),
      apiKey: u(row.mailResendApiKey),
      url: u(row.mailSmtpUrl),
      host: u(row.mailSmtpHost),
      port: u(row.mailSmtpPort),
      user: u(row.mailSmtpUser),
      pass: u(row.mailSmtpPass),
      secure: u(row.mailSmtpSecure),
      plain: u(row.mailSmtpPlain),
      endpoint: u(row.mailConsoleUrl),
      token: u(row.mailConsoleToken),
    },
    signup: { signupDisabled: row.signupDisabled },
    legal: {
      termsUrl: u(row.legalTermsUrl),
      privacyUrl: u(row.legalPrivacyUrl),
      version: row.legalVersion,
    },
    relay: {
      relayMaxMb: row.relayMaxMb,
      relayConcurrency: row.relayConcurrency,
    },
    imageProxy: {
      enabled: u(row.imageProxyEnabled),
      maxMb: u(row.imageProxyMaxMb),
    },
    proxies: {
      trustedProxies: (row.trustedProxies ?? []).filter(isIpOrRange),
    },
    mailCache: {
      retentionDays: u(row.mailCacheDays),
    },
    cache: {
      driver: row.cacheDriver,
      url: u(row.cacheUrl),
      token: u(row.cacheToken),
    },
    workflowRunner: {
      driver: row.runnerDriver,
      cadenceSec: row.runnerCadenceSec,
      tickBudgetMs: row.runnerTickBudgetMs,
      batchSize: row.runnerBatchSize,
      concurrency: row.runnerConcurrency,
      redisUrl: u(row.runnerRedisUrl),
      queuePrefix: u(row.runnerQueuePrefix),
      secret: u(row.runnerCronSecret),
      stepDataDays: row.runnerStepDataDays,
      historyDays: row.runnerHistoryDays,
      publicUrl: u(row.runnerPublicUrl),
      trustedProxies: (row.runnerTrustedProxies ?? []).filter(isIpOrRange),
    },
    google: {
      clientId: u(row.googleClientId),
      clientSecret: u(row.googleClientSecret),
    },
    microsoft: {
      clientId: u(row.microsoftClientId),
      clientSecret: u(row.microsoftClientSecret),
    },
    zoho: {
      clientId: u(row.zohoClientId),
      clientSecret: u(row.zohoClientSecret),
      region: row.zohoRegion,
    },
    imapServers: servers.imap ?? [],
    caldavServers: servers.caldav ?? [],
    carddavServers: servers.carddav ?? [],
    cloudflareServers: servers.cloudflare ?? [],
    resendServers: servers.resend ?? [],
    sesServers: servers.ses ?? [],
    s3Servers: servers.s3 ?? [],
    webdavServers: servers.webdav ?? [],
    ftpServers: servers.ftp ?? [],
    sftpServers: servers.sftp ?? [],
  });
}
