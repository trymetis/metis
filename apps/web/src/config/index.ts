import "server-only";
import { defu } from "defu";

import { isRecord } from "@/lib/guards";

import { formatConfigError } from "./format-error";
import {
  appConfigFromEnv,
  auditConfigFromEnv,
  authConfigFromEnv,
  cacheConfigFromEnv,
  connectionsConfigFromEnv,
  dbConfigFromEnv,
  decisionApiKeyFromEnv,
  decisionConfigFromEnv,
  driveConfigFromEnv,
  encryptionConfigFromEnv,
  legalConfigFromEnv,
  llmApiKeyFromEnv,
  llmConfigFromEnv,
  mailCacheConfigFromEnv,
  mailConfigFromEnv,
  mailerConfigFromEnv,
  maintenanceConfigFromEnv,
  phishingDetectionConfigFromEnv,
  proxiesConfigFromEnv,
  updaterConfigFromEnv,
  workflowRunnerConfigFromEnv,
} from "./from-env";
import { loadConfigFile } from "./from-file";
import {
  type BootConfig,
  bootConfigSchema,
  type InstanceConfig,
  instanceConfigSchema,
} from "./schema";

const env = new Proxy(process.env, {
  get(target, prop) {
    const value = Reflect.get(target, prop);
    return value === "" ? undefined : value;
  },
});

const skipValidation =
  !!process.env.SKIP_ENV_VALIDATION ||
  process.env.npm_lifecycle_event === "lint" ||
  process.env.npm_lifecycle_event === "typecheck";

const loadedFile = skipValidation ? undefined : loadConfigFile();
const file = isRecord(loadedFile) ? loadedFile : undefined;

export function suppliedByEnv(variables: string[]): boolean {
  return variables.some((name) => env[name] !== undefined);
}

export function suppliedByFile(path: string[]): boolean {
  let current: unknown = file;
  for (const key of path) {
    if (!isRecord(current)) return false;
    current = current[key];
  }
  return current !== undefined;
}

function buildRaw() {
  const envRaw = {
    auth: authConfigFromEnv(env),
    db: dbConfigFromEnv(env),
    legal: legalConfigFromEnv(env),
    app: appConfigFromEnv(env),
    audit: auditConfigFromEnv(env),
    encryption: encryptionConfigFromEnv(env),
    connections: connectionsConfigFromEnv(env),
    drive: driveConfigFromEnv(env),
    mail: mailConfigFromEnv(env),
    proxies: proxiesConfigFromEnv(env),
    mailCache: mailCacheConfigFromEnv(env),
    mailer: mailerConfigFromEnv(env),
    llm: llmConfigFromEnv(env),
    decision: decisionConfigFromEnv(env),
    cache: cacheConfigFromEnv(env),
    workflowRunner: workflowRunnerConfigFromEnv(env),
    phishingDetection: phishingDetectionConfigFromEnv(env),
    updater: updaterConfigFromEnv(env),
    maintenance: maintenanceConfigFromEnv(env),
  };

  const merged = defu(envRaw, file ?? {});

  const llmKey = llmApiKeyFromEnv(env, merged.llm.driver);
  if (llmKey !== undefined) merged.llm.apiKey = llmKey;
  const decisionKey = decisionApiKeyFromEnv(env, merged.decision.driver);
  if (decisionKey !== undefined) merged.decision.apiKey = decisionKey;

  return merged;
}

const SERVERLESS_HOSTS: [variable: string, host: string][] = [
  ["VERCEL", "Vercel"],
  ["NETLIFY", "Netlify"],
  ["AWS_LAMBDA_FUNCTION_NAME", "AWS Lambda"],
  ["FUNCTIONS_WORKER_RUNTIME", "Azure Functions"],
  ["FUNCTION_TARGET", "Google Cloud Functions"],
];

export function serverlessHost(): { variable: string; host: string } | null {
  const found = SERVERLESS_HOSTS.find(([variable]) => process.env[variable]);
  return found ? { variable: found[0], host: found[1] } : null;
}

type Raw = ReturnType<typeof buildRaw>;

function seedRaw(raw: Raw): Record<string, unknown> {
  const { app, drive, mail, connections } = raw;
  return {
    llm: raw.llm,
    decision: raw.decision,
    phishingDetection: raw.phishingDetection,
    mailer: raw.mailer,
    signup: { signupDisabled: app.signupDisabled },
    legal: raw.legal,
    relay: {
      relayMaxMb: drive.relayMaxMb,
      relayConcurrency: drive.relayConcurrency,
    },
    imageProxy: {
      enabled: mail.imageProxy,
      maxMb: mail.imageProxyMaxMb,
    },
    proxies: raw.proxies,
    mailCache: raw.mailCache,
    cache: raw.cache,
    workflowRunner: raw.workflowRunner,
    google: connections.google,
    microsoft: connections.microsoft,
    zoho: {
      ...(isRecord(connections.zoho) ? connections.zoho : {}),
      region: connections.zohoRegion,
    },
    imapServers: connections.imapServers,
    caldavServers: connections.caldavServers,
    carddavServers: connections.carddavServers,
    cloudflareServers: connections.cloudflareServers,
    resendServers: connections.resendServers,
    sesServers: connections.sesServers,
    s3Servers: connections.s3Servers,
    webdavServers: connections.webdavServers,
    ftpServers: connections.ftpServers,
    sftpServers: connections.sftpServers,
  };
}

function resolveConfig(): { boot: BootConfig; seed: InstanceConfig } {
  const raw = buildRaw();
  if (skipValidation) {
    /* oxlint-disable typescript/no-unsafe-type-assertion -- lint, typecheck and SKIP_ENV_VALIDATION builds run without the environment; the unvalidated raw stands in so imports load */
    return {
      boot: raw as unknown as BootConfig,
      seed: seedRaw(raw) as unknown as InstanceConfig,
    };
    /* oxlint-enable typescript/no-unsafe-type-assertion */
  }
  const boot = bootConfigSchema.safeParse(raw);
  const seed = instanceConfigSchema.safeParse(seedRaw(raw));
  const errors = [boot, seed].flatMap((result) =>
    result.success ? [] : [formatConfigError(result.error)],
  );
  if (!boot.success || !seed.success) throw new Error(errors.join("\n"));
  return { boot: boot.data, seed: seed.data };
}

const resolved = resolveConfig();

export const config: BootConfig = resolved.boot;

export const instanceSeed: InstanceConfig = resolved.seed;

export type { BootConfig, InstanceConfig, InstanceSection } from "./schema";
