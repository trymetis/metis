import "server-only";
import net from "node:net";
import tls from "node:tls";

import { ListBucketsCommand, S3ServiceException } from "@aws-sdk/client-s3";
import { Client as SshClient } from "ssh2";
import { Agent } from "undici";
import { z } from "zod";

import type { InstanceConfig } from "@/config";
import { getInstanceConfig } from "@/config/runtime";
import type {
  DecisionConfig,
  FtpServerConfig,
  S3ServerConfig,
  SftpServerConfig,
} from "@/config/schema";
import { createS3Client, s3ErrorStatus } from "@/drive/providers/s3/client";
import { hostKeyFingerprint } from "@/drive/providers/sftp/client";
import { isRecord } from "@/lib/guards";

import { configuredOAuthProviders, type OAuthProviderId, providerCredentials } from "./credentials";
import { OAUTH_DRIVERS } from "./oauth-drivers";
import type { ConnectionProvider } from "./types";

const PROBE_TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [100, 200, 400];

const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

const tokenErrorSchema = z.object({
  error: z.string().optional(),
  error_description: z.string().optional(),
});

const modelListSchema = z.object({
  data: z.array(z.object({ id: z.unknown() })).optional(),
  models: z.array(z.object({ name: z.unknown() })).optional(),
});

class ServerConfigError extends Error {}

const TLS_FAILURE_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries(run: () => Promise<unknown>): Promise<void> {
  /* oxlint-disable eslint/no-await-in-loop -- each retry runs only after the previous attempt failed and its backoff elapsed */
  for (let attempt = 0; ; attempt++) {
    try {
      await run();
      return;
    } catch (err) {
      if (err instanceof ServerConfigError) throw err;
      if (attempt >= RETRY_DELAYS_MS.length) throw err;
      // oxlint-disable-next-line typescript/no-non-null-assertion --bounded by the loop guard
      await sleep(RETRY_DELAYS_MS[attempt]!);
    }
  }
  /* oxlint-enable eslint/no-await-in-loop */
}

function asProbeError(err: unknown): Error {
  const code = isRecord(err) && typeof err.code === "string" ? err.code : undefined;
  if (code && TLS_FAILURE_CODES.has(code)) {
    return new ServerConfigError(
      `TLS certificate rejected (${code}) — fix the certificate or set "allowInsecureTls": true on this entry`,
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/WRONG_VERSION_NUMBER/i.test(`${code ?? ""} ${message}`)) {
    return new ServerConfigError(
      "the server did not answer with TLS — check this entry's TLS setting (secure / port)",
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}

function probeSocket(args: {
  host: string;
  port: number;
  secure: boolean;
  allowInsecureTls: boolean;
  greeting: RegExp;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = args.secure
      ? tls.connect({
          host: args.host,
          port: args.port,
          servername: args.host,
          rejectUnauthorized: !args.allowInsecureTls,
        })
      : net.connect({ host: args.host, port: args.port });

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`timed out after ${PROBE_TIMEOUT_MS / 1000}s`));
    }, PROBE_TIMEOUT_MS);

    socket.once("error", (err) => {
      clearTimeout(timer);
      socket.destroy();
      reject(asProbeError(err));
    });

    socket.once("data", (chunk: Buffer) => {
      clearTimeout(timer);
      const greeting = chunk.toString("utf8");
      socket.end();
      if (args.greeting.test(greeting)) {
        resolve();
      } else {
        reject(
          new ServerConfigError(
            `unexpected greeting: ${greeting.slice(0, 80)} — is that the right host and port?`,
          ),
        );
      }
    });
  });
}

function probeFtp(server: FtpServerConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    const tlsOptions = {
      ...(net.isIP(server.host) ? {} : { servername: server.host }),
      rejectUnauthorized: !server.allowInsecureTls,
    };
    let socket: net.Socket =
      server.secure === "implicit"
        ? tls.connect({ host: server.host, port: server.port, ...tlsOptions })
        : net.connect({ host: server.host, port: server.port });
    let stage: "greeting" | "auth" = "greeting";

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`timed out after ${PROBE_TIMEOUT_MS / 1000}s`));
    }, PROBE_TIMEOUT_MS);

    const fail = (err: unknown) => {
      clearTimeout(timer);
      socket.destroy();
      reject(asProbeError(err));
    };
    const done = () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    };

    const onData = (chunk: Buffer) => {
      const reply = chunk.toString("utf8");
      if (stage === "greeting") {
        if (!/^220[ -]/.test(reply)) {
          fail(
            new ServerConfigError(
              `unexpected greeting: ${reply.slice(0, 80)} — is that an FTP server?`,
            ),
          );
          return;
        }
        if (server.secure !== "explicit") {
          done();
          return;
        }
        stage = "auth";
        socket.write("AUTH TLS\r\n");
        return;
      }
      if (!/^234[ -]/.test(reply)) {
        fail(
          new ServerConfigError(
            `the server refused AUTH TLS (${reply.slice(0, 60).trim()}) — set "secure" to match the server`,
          ),
        );
        return;
      }
      socket.removeListener("data", onData);
      socket = tls.connect({ socket, ...tlsOptions }, done);
      socket.once("error", fail);
    };

    socket.on("data", onData);
    socket.once("error", fail);
  });
}

function probeSftp(server: SftpServerConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = new SshClient();
    let presented: string | null = null;
    const finish = (err?: Error) => {
      client.end();
      if (err) reject(err);
      else resolve();
    };

    client.once("ready", () => finish());
    client.once("error", (err: Error & { level?: string }) => {
      if (presented && presented !== server.hostKeySha256) {
        finish(
          new ServerConfigError(
            `the server presented host key SHA256:${presented}, not the configured hostKeySha256`,
          ),
        );
        return;
      }
      if (presented && err.level === "client-authentication") {
        finish();
        return;
      }
      finish(asProbeError(err));
    });

    client.connect({
      host: server.host,
      port: server.port,
      username: "metis-preflight",
      readyTimeout: PROBE_TIMEOUT_MS,
      authHandler: ["none"],
      hostVerifier: (key: Buffer) => {
        presented = hostKeyFingerprint(key);
        return presented === server.hostKeySha256;
      },
    });
  });
}

async function probeHttp(
  url: string,
  allowInsecureTls: boolean,
  init: { method?: string; headers?: Record<string, string> } = {},
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      ...(allowInsecureTls ? { dispatcher: insecureAgent } : {}),
    });
  } catch (err) {
    throw asProbeError((isRecord(err) ? err.cause : undefined) ?? err);
  }
}

function oauthTokenEndpoint(provider: OAuthProviderId, cfg: InstanceConfig): string {
  if (provider === "zoho") {
    return `https://accounts.zoho.${cfg.zoho.region}/oauth/v2/token`;
  }
  return OAUTH_DRIVERS[provider].tokenEndpoint;
}

async function probeOAuthClient(provider: OAuthProviderId, cfg: InstanceConfig): Promise<void> {
  const { clientId, clientSecret } = providerCredentials(provider, cfg);
  const res = await fetch(oauthTokenEndpoint(provider, cfg), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: "metis-boot-probe",
      redirect_uri: "https://localhost/metis-boot-probe",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });

  if (res.status >= 500) {
    throw new Error(
      `the token endpoint returned ${res.status} — could not verify the client id/secret`,
    );
  }

  const parsed = tokenErrorSchema.safeParse(await res.json().catch(() => ({})));
  const body = parsed.success ? parsed.data : {};
  const error = body.error ?? "";

  if (/invalid_client|unauthorized_client/i.test(error) || res.status === 401) {
    throw new ServerConfigError(
      `the token endpoint rejected the client id/secret (${error || res.status}${
        body.error_description ? `: ${body.error_description}` : ""
      })`,
    );
  }
}

async function s3ProbeCredentials(
  server: S3ServerConfig,
): Promise<{ ok: boolean; status: number; code: string }> {
  const client = createS3Client(server);
  try {
    await client.send(new ListBucketsCommand({}), {
      abortSignal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return { ok: true, status: 200, code: "" };
  } catch (err) {
    if (err instanceof S3ServiceException) {
      return { ok: false, status: s3ErrorStatus(err) ?? 0, code: err.name };
    }
    throw asProbeError(err);
  } finally {
    client.destroy();
  }
}

export interface ServerVerification {
  misconfigured: string[];
  unreachable: string[];
}

export interface ServerCheck {
  provider: ConnectionProvider;
  server: string | null;
  part: string;
  label: string;
  probe: unknown;
  run: () => Promise<unknown>;
}

export type ServerCheckOutcome =
  | { ok: true }
  | { ok: false; misconfigured: boolean; message: string };

export function serverChecks(cfg: InstanceConfig = getInstanceConfig()): ServerCheck[] {
  const checks: ServerCheck[] = [];

  for (const provider of configuredOAuthProviders(cfg)) {
    checks.push({
      provider,
      server: null,
      part: "Token endpoint",
      label: `oauth ${provider}`,
      probe: { ...providerCredentials(provider, cfg), endpoint: oauthTokenEndpoint(provider, cfg) },
      run: () => probeOAuthClient(provider, cfg),
    });
  }

  for (const server of cfg.imapServers) {
    checks.push({
      provider: "imap",
      server: server.name,
      part: "IMAP",
      label: `imap "${server.name}" (${server.imap.host}:${server.imap.port})`,
      probe: { endpoint: server.imap, allowInsecureTls: server.allowInsecureTls },
      run: () =>
        probeSocket({
          ...server.imap,
          allowInsecureTls: server.allowInsecureTls,
          greeting: /^\* (OK|PREAUTH)/,
        }),
    });
    checks.push({
      provider: "imap",
      server: server.name,
      part: "SMTP",
      label: `smtp "${server.name}" (${server.smtp.host}:${server.smtp.port})`,
      probe: { endpoint: server.smtp, allowInsecureTls: server.allowInsecureTls },
      run: () =>
        probeSocket({
          ...server.smtp,
          allowInsecureTls: server.allowInsecureTls,
          greeting: /^220[ -]/,
        }),
    });
  }

  for (const server of cfg.caldavServers) {
    checks.push({
      provider: "caldav",
      server: server.name,
      part: "CalDAV endpoint",
      label: `caldav "${server.name}" (${server.url})`,
      probe: { url: server.url, allowInsecureTls: server.allowInsecureTls },
      run: async () => {
        const res = await probeHttp(server.url, server.allowInsecureTls);
        if (res.status === 401 || res.status === 403) return;
        if (res.status >= 500) throw new Error(`responded ${res.status}`);
        if (res.ok && res.headers.has("dav")) return;
        throw new ServerConfigError(
          `expected 401/403 or a DAV-capable response, got ${res.status}${
            res.ok ? " with no DAV header" : ""
          } — is that the CalDAV URL?`,
        );
      },
    });
  }

  const gateways = [
    ...cfg.cloudflareServers.map((server) => ({
      kind: "cloudflare" as const,
      server,
    })),
    ...cfg.resendServers.map((server) => ({
      kind: "resend" as const,
      server,
    })),
  ];

  for (const { kind, server } of gateways) {
    checks.push({
      provider: kind,
      server: server.name,
      part: "Gateway health",
      label: `${kind} "${server.name}" (${server.endpoint})`,
      probe: { endpoint: server.endpoint },
      run: async () => {
        const res = await probeHttp(`${server.endpoint}/v1/health`, false);
        if (res.status === 401) return;
        if (res.status >= 500) {
          throw new Error(`responded ${res.status}`);
        }
        throw new ServerConfigError(
          `expected 401 from unauthenticated /v1/health, got ${res.status} — is that the gateway URL?`,
        );
      },
    });
  }

  for (const server of cfg.s3Servers) {
    checks.push({
      provider: "s3",
      server: server.name,
      part: "Access key",
      label: `s3 "${server.name}" (${server.endpoint})`,
      probe: server,
      run: async () => {
        const res = await s3ProbeCredentials(server);
        if (res.ok || res.code === "AccessDenied") return;
        if (res.status >= 500) throw new Error(`responded ${res.status}`);
        throw new ServerConfigError(
          `the endpoint rejected the access key (${res.code || res.status}) — check accessKeyId, secretAccessKey and region`,
        );
      },
    });
  }

  for (const server of cfg.webdavServers) {
    checks.push({
      provider: "webdav",
      server: server.name,
      part: "WebDAV endpoint",
      label: `webdav "${server.name}" (${server.url})`,
      probe: { url: server.url, allowInsecureTls: server.allowInsecureTls },
      run: async () => {
        const res = await probeHttp(server.url, server.allowInsecureTls, {
          method: "PROPFIND",
          headers: { depth: "0" },
        });
        if (res.status === 401 || res.status === 403) return;
        if (res.status >= 500) throw new Error(`responded ${res.status}`);
        if (res.ok && res.headers.has("dav")) return;
        if (res.status === 207) return;
        throw new ServerConfigError(
          `expected 401/403 or a WebDAV response to PROPFIND, got ${res.status} — is that the WebDAV URL?`,
        );
      },
    });
  }

  for (const server of cfg.ftpServers) {
    checks.push({
      provider: "ftp",
      server: server.name,
      part: server.secure === "none" ? "Greeting" : "Greeting and TLS",
      label: `ftp "${server.name}" (${server.host}:${server.port}, ${server.secure})`,
      probe: server,
      run: () => probeFtp(server),
    });
  }

  for (const server of cfg.sftpServers) {
    checks.push({
      provider: "sftp",
      server: server.name,
      part: "Handshake and host key",
      label: `sftp "${server.name}" (${server.host}:${server.port})`,
      probe: server,
      run: () => probeSftp(server),
    });
  }

  return checks;
}

export async function runServerCheck(check: ServerCheck): Promise<ServerCheckOutcome> {
  try {
    await withRetries(check.run);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      misconfigured: err instanceof ServerConfigError,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export type DecisionModelCheck =
  | { status: "ok"; message?: string }
  | { status: "warning" | "failed"; message: string };

export async function checkDecisionModel(
  decision: DecisionConfig,
): Promise<DecisionModelCheck | null> {
  if (decision.driver === "disabled") return null;
  const base = decision.driver === "systemone" ? decision.baseURL : "https://api.openai.com/v1";

  let res: Response;
  try {
    res = await fetch(`${base}/models`, {
      headers: decision.apiKey ? { Authorization: `Bearer ${decision.apiKey}` } : {},
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch (err) {
    return {
      status: "failed",
      message: `unreachable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      status: "failed",
      message: `the API key was rejected (${res.status})`,
    };
  }
  if (!res.ok) return { status: "failed", message: `responded ${res.status}` };

  const parsed = modelListSchema.safeParse(await res.json().catch(() => null));
  const body = parsed.success ? parsed.data : null;
  const listed = new Set(
    [
      ...(body?.data ?? []).map((model) => model.id),
      ...(body?.models ?? []).map((model) => model.name),
    ].filter((id): id is string => typeof id === "string"),
  );
  if (listed.size === 0) {
    return { status: "ok", message: "reachable; no model list returned" };
  }
  if (!listed.has(decision.model) && !listed.has(`${decision.model}:latest`)) {
    return {
      status: "warning",
      message: `${decision.model} is not in the provider's model list`,
    };
  }
  return { status: "ok" };
}

export function decisionModelLabel(decision: DecisionConfig): string | null {
  if (decision.driver === "disabled") return null;
  const where = decision.driver === "systemone" ? new URL(decision.baseURL).host : "OpenAI";
  return `decision model ${decision.model} (${decision.driver}, ${where})`;
}

export async function verifyConnectServers(
  cfg: InstanceConfig = getInstanceConfig(),
): Promise<ServerVerification> {
  const checks = serverChecks(cfg);
  const outcomes = await Promise.all(checks.map(runServerCheck));
  const verification: ServerVerification = {
    misconfigured: [],
    unreachable: [],
  };

  for (const [index, outcome] of outcomes.entries()) {
    if (outcome.ok) continue;
    // oxlint-disable-next-line typescript/no-non-null-assertion --same length as checks
    const line = `${checks[index]!.label}: ${outcome.message}`;
    if (outcome.misconfigured) {
      verification.misconfigured.push(line);
    } else {
      verification.unreachable.push(line);
    }
  }

  return verification;
}
