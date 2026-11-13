import "server-only";
import type { InstanceConfig } from "@/config";
import { getInstanceConfig } from "@/config/runtime";

import { configuredOAuthProviders } from "./credentials";
import type {
  ConnectionCredentials,
  ConnectionProvider,
  ConnectServer,
  StoredConnectionCredentials,
} from "./types";

const OAUTH_NAMES = {
  google: "Google",
  microsoft: "Outlook",
  zoho: "Zoho",
} as const;

const listed = <P extends ConnectionProvider>(provider: P, entries: { name: string }[]) =>
  entries.map((server) => ({ provider, name: server.name }));

export function connectServers(c: InstanceConfig = getInstanceConfig()): ConnectServer[] {
  return [
    ...configuredOAuthProviders(c).map((provider) => ({
      provider,
      name: OAUTH_NAMES[provider],
    })),
    ...listed("imap", c.imapServers),
    ...listed("caldav", c.caldavServers),
    ...listed("carddav", c.carddavServers),
    ...listed("cloudflare", c.cloudflareServers),
    ...listed("resend", c.resendServers),
    ...listed("ses", c.sesServers),
    ...listed("s3", c.s3Servers),
    ...listed("webdav", c.webdavServers),
    ...listed("ftp", c.ftpServers),
    ...listed("sftp", c.sftpServers),
  ];
}

export function isProviderConfigured(
  provider: ConnectionProvider,
  instance: InstanceConfig = getInstanceConfig(),
): boolean {
  return connectServers(instance).some((server) => server.provider === provider);
}

function findEntry<Entry extends { id: string; name: string }>(
  entries: Entry[],
  stored: { serverId?: string; server: string },
): Entry | undefined {
  if (stored.serverId) {
    return entries.find((server) => server.id === stored.serverId);
  }
  return entries.find((server) => server.name === stored.server);
}

export function resolveServerCredentials(
  stored: StoredConnectionCredentials,
  c: InstanceConfig = getInstanceConfig(),
): ConnectionCredentials | null {
  if (stored.provider === "imap") {
    const entry = findEntry(c.imapServers, stored);
    if (!entry) return null;
    return {
      provider: "imap",
      serverId: entry.id,
      server: entry.name,
      imap: entry.imap,
      smtp: entry.smtp,
      user: stored.user,
      pass: stored.pass,
      smtpAuth: stored.smtpAuth,
      allowInsecureTls: entry.allowInsecureTls,
    };
  }

  if (stored.provider === "caldav") {
    const entry = findEntry(c.caldavServers, stored);
    if (!entry) return null;
    return {
      provider: "caldav",
      serverId: entry.id,
      server: entry.name,
      url: entry.url,
      user: stored.user,
      pass: stored.pass,
      allowInsecureTls: entry.allowInsecureTls,
    };
  }

  if (stored.provider === "carddav") {
    const entry = findEntry(c.carddavServers, stored);
    if (!entry) return null;
    return {
      provider: "carddav",
      serverId: entry.id,
      server: entry.name,
      url: entry.url,
      user: stored.user,
      pass: stored.pass,
      allowInsecureTls: entry.allowInsecureTls,
    };
  }

  if (stored.provider === "s3") {
    const entry = findEntry(c.s3Servers, stored);
    if (!entry) return null;
    return {
      provider: "s3",
      serverId: entry.id,
      server: entry.name,
      endpoint: entry.endpoint,
      bucket: stored.bucket,
      forcePathStyle: entry.forcePathStyle,
      allowInsecureTls: entry.allowInsecureTls,
      transfer: entry.transfer,
      partSize: entry.partSize,
      prefix: stored.prefix,
    };
  }

  if (stored.provider === "webdav") {
    const entry = findEntry(c.webdavServers, stored);
    if (!entry) return null;
    return {
      provider: "webdav",
      serverId: entry.id,
      server: entry.name,
      url: entry.url,
      user: stored.user,
      pass: stored.pass,
      root: stored.root,
      allowInsecureTls: entry.allowInsecureTls,
    };
  }

  if (stored.provider === "ftp") {
    const entry = findEntry(c.ftpServers, stored);
    if (!entry) return null;
    return {
      provider: "ftp",
      serverId: entry.id,
      server: entry.name,
      host: entry.host,
      port: entry.port,
      secure: entry.secure,
      allowInsecureTls: entry.allowInsecureTls,
      poolSize: entry.poolSize,
      user: stored.user,
      pass: stored.pass,
      root: stored.root,
    };
  }

  if (stored.provider === "sftp") {
    const entry = findEntry(c.sftpServers, stored);
    if (!entry) return null;
    return {
      provider: "sftp",
      serverId: entry.id,
      server: entry.name,
      host: entry.host,
      port: entry.port,
      hostKeySha256: entry.hostKeySha256,
      poolSize: entry.poolSize,
      user: stored.user,
      pass: stored.pass,
      root: stored.root,
    };
  }

  const gatewayEntries = {
    cloudflare: c.cloudflareServers,
    resend: c.resendServers,
    ses: c.sesServers,
  };
  const entries = gatewayEntries[stored.provider];
  const entry = findEntry(entries, stored);
  if (!entry) return null;
  return {
    provider: stored.provider,
    serverId: entry.id,
    server: entry.name,
    endpoint: entry.endpoint,
    domain: entry.domain,
    token: stored.token,
  };
}
