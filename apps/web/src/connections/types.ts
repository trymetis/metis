export const CONNECTION_PROVIDERS = [
  "google",
  "microsoft",
  "zoho",
  "imap",
  "caldav",
  "carddav",
  "cloudflare",
  "resend",
  "s3",
  "webdav",
  "ftp",
  "sftp",
] as const;
export type ConnectionProvider = (typeof CONNECTION_PROVIDERS)[number];

const CREDENTIAL_PROVIDERS = [
  "imap",
  "caldav",
  "carddav",
  "cloudflare",
  "resend",
  "s3",
  "webdav",
  "ftp",
  "sftp",
] as const;
export type CredentialProvider = (typeof CREDENTIAL_PROVIDERS)[number];

export const GATEWAY_PROVIDERS = ["cloudflare", "resend"] as const;
export type GatewayProvider = (typeof GATEWAY_PROVIDERS)[number];

export function isGatewayProvider(provider: ConnectionProvider): provider is GatewayProvider {
  return (GATEWAY_PROVIDERS as readonly string[]).includes(provider);
}

export function isCredentialProvider(provider: ConnectionProvider): provider is CredentialProvider {
  return (CREDENTIAL_PROVIDERS as readonly string[]).includes(provider);
}

export const CONNECTION_RESOURCES = ["mailbox", "calendar", "drive", "addressbook"] as const;
export type ConnectionResource = (typeof CONNECTION_RESOURCES)[number];

export function isConnectionResource(value: string): value is ConnectionResource {
  return (CONNECTION_RESOURCES as readonly string[]).includes(value);
}

export const PROVIDER_RESOURCES = {
  google: ["mailbox", "calendar", "drive", "addressbook"],
  microsoft: ["mailbox", "calendar", "drive", "addressbook"],
  zoho: ["mailbox", "calendar", "addressbook"],
  imap: ["mailbox"],
  caldav: ["calendar"],
  carddav: ["addressbook"],
  cloudflare: ["mailbox"],
  resend: ["mailbox"],
  s3: ["drive"],
  webdav: ["drive"],
  ftp: ["drive"],
  sftp: ["drive"],
} as const satisfies Record<ConnectionProvider, readonly ConnectionResource[]>;

export type ProvidersFor<R extends ConnectionResource> = {
  [P in ConnectionProvider]: R extends (typeof PROVIDER_RESOURCES)[P][number] ? P : never;
}[ConnectionProvider];

export type MailProvider = ProvidersFor<"mailbox">;
export type CalendarProvider = ProvidersFor<"calendar">;
export type DriveProvider = ProvidersFor<"drive">;
export type AddressBookProvider = ProvidersFor<"addressbook">;

function providersFor<R extends ConnectionResource>(resource: R): readonly ProvidersFor<R>[] {
  return CONNECTION_PROVIDERS.filter((provider): provider is ProvidersFor<R> =>
    providerSupportsResource(provider, resource),
  );
}

export const MAIL_PROVIDERS = providersFor("mailbox");
export const CALENDAR_PROVIDERS = providersFor("calendar");
export const DRIVE_PROVIDERS = providersFor("drive");
export const ADDRESS_BOOK_PROVIDERS = providersFor("addressbook");

export function providerSupportsResource<R extends ConnectionResource>(
  provider: ConnectionProvider,
  resource: R,
): provider is ProvidersFor<R> {
  return (PROVIDER_RESOURCES[provider] as readonly ConnectionResource[]).includes(resource);
}

export function hasProvider<
  P extends ConnectionProvider,
  T extends { provider: ConnectionProvider },
>(row: T, isProvider: (provider: ConnectionProvider) => provider is P): row is T & { provider: P } {
  return isProvider(row.provider);
}

export function isMailProvider(provider: ConnectionProvider): provider is MailProvider {
  return providerSupportsResource(provider, "mailbox");
}

export function isCalendarProvider(provider: ConnectionProvider): provider is CalendarProvider {
  return providerSupportsResource(provider, "calendar");
}

export function isDriveProvider(provider: ConnectionProvider): provider is DriveProvider {
  return providerSupportsResource(provider, "drive");
}

export function isAddressBookProvider(
  provider: ConnectionProvider,
): provider is AddressBookProvider {
  return providerSupportsResource(provider, "addressbook");
}

export function credentialResourceFor(provider: CredentialProvider): ConnectionResource {
  return PROVIDER_RESOURCES[provider][0];
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string | null;
  expiresInSec?: number | null;
  scope?: string | null;
  meta?: Record<string, string>;
}

export interface OAuthProfile {
  providerAccountId: string;
  email: string;
  name?: string;
  image?: string | null;
}

export interface ProviderCalendar {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  timeZone: string | null;
  primary: boolean;
  readOnly: boolean;
}

export interface AuthUrlContext {
  state: string;
  redirectUri: string;
  resources: ConnectionResource[];
  loginHint?: string;
}

export interface CallbackParams {
  code: string;
  redirectUri: string;
  query: URLSearchParams;
  resources: ConnectionResource[];
}

export interface StoredImapCredentials {
  serverId?: string;
  server: string;
  user: string;
  pass: string;
  smtpAuth: { user: string; pass: string } | null;
}

export interface StoredCaldavCredentials {
  serverId?: string;
  server: string;
  user: string;
  pass: string;
}

export interface StoredGatewayCredentials {
  serverId?: string;
  server: string;
  token: string;
}

export interface StoredS3Credentials {
  serverId?: string;
  server: string;
  bucket: string;
  prefix: string | null;
}

export interface StoredFileServerCredentials {
  serverId?: string;
  server: string;
  user: string;
  pass: string;
  root: string | null;
}

export type StoredConnectionCredentials =
  | ({ provider: "imap" } & StoredImapCredentials)
  | ({ provider: "caldav" } & StoredCaldavCredentials)
  | ({ provider: "carddav" } & StoredCaldavCredentials)
  | ({ provider: "cloudflare" } & StoredGatewayCredentials)
  | ({ provider: "resend" } & StoredGatewayCredentials)
  | ({ provider: "s3" } & StoredS3Credentials)
  | ({ provider: "webdav" } & StoredFileServerCredentials)
  | ({ provider: "ftp" } & StoredFileServerCredentials)
  | ({ provider: "sftp" } & StoredFileServerCredentials);

export interface MailEndpoint {
  host: string;
  port: number;
  secure: boolean;
  plain: boolean;
}

export interface ImapCredentials {
  serverId: string;
  server: string;
  imap: MailEndpoint;
  smtp: MailEndpoint;
  user: string;
  pass: string;
  smtpAuth: { user: string; pass: string } | null;
  allowInsecureTls: boolean;
}

export interface CaldavCredentials {
  serverId: string;
  server: string;
  url: string;
  user: string;
  pass: string;
  allowInsecureTls: boolean;
}

export interface GatewayCredentials {
  serverId: string;
  server: string;
  endpoint: string;
  domain: string;
  token: string;
}

export interface ConnectServer {
  provider: ConnectionProvider;
  name: string;
}

export function smtpLogin(credentials: ImapCredentials): {
  user: string;
  pass: string;
} {
  return credentials.smtpAuth ?? { user: credentials.user, pass: credentials.pass };
}

export interface S3Credentials {
  serverId: string;
  server: string;
  endpoint: string;
  bucket: string;
  forcePathStyle: boolean;
  allowInsecureTls: boolean;
  transfer: "direct" | "relay";
  partSize: string;
  prefix: string | null;
}

export interface WebdavCredentials {
  serverId: string;
  server: string;
  url: string;
  user: string;
  pass: string;
  root: string | null;
  allowInsecureTls: boolean;
}

export interface FtpCredentials {
  serverId: string;
  server: string;
  host: string;
  port: number;
  secure: "explicit" | "implicit" | "none";
  allowInsecureTls: boolean;
  poolSize: number;
  user: string;
  pass: string;
  root: string | null;
}

export interface SftpCredentials {
  serverId: string;
  server: string;
  host: string;
  port: number;
  hostKeySha256: string;
  poolSize: number;
  user: string;
  pass: string;
  root: string | null;
}

export type ConnectionCredentials =
  | ({ provider: "imap" } & ImapCredentials)
  | ({ provider: "caldav" } & CaldavCredentials)
  | ({ provider: "carddav" } & CaldavCredentials)
  | ({ provider: "cloudflare" } & GatewayCredentials)
  | ({ provider: "resend" } & GatewayCredentials)
  | ({ provider: "s3" } & S3Credentials)
  | ({ provider: "webdav" } & WebdavCredentials)
  | ({ provider: "ftp" } & FtpCredentials)
  | ({ provider: "sftp" } & SftpCredentials);

export type GatewayConnectionCredentials = Extract<
  ConnectionCredentials,
  { provider: GatewayProvider }
>;

export type ConnectionAuth =
  | { kind: "oauth"; accessToken: string; email: string }
  | {
      kind: "credentials";
      credentials: ConnectionCredentials;
      email: string;
    };

export function oauthToken(auth: ConnectionAuth): string {
  if (auth.kind !== "oauth") {
    throw new Error("This account does not use an OAuth access token");
  }
  return auth.accessToken;
}

export function imapCredentials(auth: ConnectionAuth): ImapCredentials {
  if (auth.kind !== "credentials" || auth.credentials.provider !== "imap") {
    throw new Error("This account has no IMAP credentials");
  }
  return auth.credentials;
}

export function caldavCredentials(auth: ConnectionAuth): CaldavCredentials {
  if (auth.kind !== "credentials" || auth.credentials.provider !== "caldav") {
    throw new Error("This account has no CalDAV credentials");
  }
  return auth.credentials;
}

export function carddavCredentials(auth: ConnectionAuth): CaldavCredentials {
  if (auth.kind !== "credentials" || auth.credentials.provider !== "carddav") {
    throw new Error("This account has no CardDAV credentials");
  }
  return auth.credentials;
}

export function s3Credentials(auth: ConnectionAuth): S3Credentials {
  if (auth.kind !== "credentials" || auth.credentials.provider !== "s3") {
    throw new Error("This account has no S3 credentials");
  }
  return auth.credentials;
}

export function webdavCredentials(auth: ConnectionAuth): WebdavCredentials {
  if (auth.kind !== "credentials" || auth.credentials.provider !== "webdav") {
    throw new Error("This account has no WebDAV credentials");
  }
  return auth.credentials;
}

export function ftpCredentials(auth: ConnectionAuth): FtpCredentials {
  if (auth.kind !== "credentials" || auth.credentials.provider !== "ftp") {
    throw new Error("This account has no FTP credentials");
  }
  return auth.credentials;
}

export function sftpCredentials(auth: ConnectionAuth): SftpCredentials {
  if (auth.kind !== "credentials" || auth.credentials.provider !== "sftp") {
    throw new Error("This account has no SFTP credentials");
  }
  return auth.credentials;
}

export function gatewayCredentials(auth: ConnectionAuth): GatewayConnectionCredentials {
  if (auth.kind !== "credentials" || !isGatewayCredentials(auth.credentials)) {
    throw new Error("This account has no mail gateway credentials");
  }
  return auth.credentials;
}

function isGatewayCredentials(
  credentials: ConnectionCredentials,
): credentials is GatewayConnectionCredentials {
  return isGatewayProvider(credentials.provider);
}

export interface RevokableToken {
  accessToken?: string | null;
  refreshToken?: string | null;
}

interface ProviderDriverBase {
  provider: ConnectionProvider;
  label: string;
  resources: ConnectionResource[];
  grantedResources(scope: string | null): ConnectionResource[];
  revoke?(token: RevokableToken): Promise<void>;
}

export interface OAuthProviderDriver extends ProviderDriverBase {
  kind: "oauth";
  mergesGrantedScopes: boolean;
  tokenEndpoint: string;
  buildAuthUrl(ctx: AuthUrlContext): string;
  exchangeCode(params: CallbackParams): Promise<TokenSet>;
  getProfile(token: TokenSet): Promise<OAuthProfile>;
  refresh(refreshToken: string): Promise<TokenSet | null>;
}

export interface CredentialProviderDriver extends ProviderDriverBase {
  kind: "credentials";
  provider: CredentialProvider;
  verify(credentials: ConnectionCredentials, email: string): Promise<OAuthProfile>;
}

export type ProviderDriver = OAuthProviderDriver | CredentialProviderDriver;
