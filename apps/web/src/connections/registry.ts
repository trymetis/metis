import { caldavDriver } from "./drivers/caldav";
import { carddavDriver } from "./drivers/carddav";
import { cloudflareDriver } from "./drivers/cloudflare";
import { ftpDriver } from "./drivers/ftp";
import { imapDriver } from "./drivers/imap";
import { resendDriver } from "./drivers/resend";
import { s3Driver } from "./drivers/s3";
import { sesDriver } from "./drivers/ses";
import { sftpDriver } from "./drivers/sftp";
import { webdavDriver } from "./drivers/webdav";
import { OAUTH_DRIVERS } from "./oauth-drivers";
import type {
  ConnectionProvider,
  CredentialProvider,
  CredentialProviderDriver,
  OAuthProviderDriver,
  ProviderDriver,
} from "./types";

const DRIVERS: Record<ConnectionProvider, ProviderDriver> = {
  ...OAUTH_DRIVERS,
  imap: imapDriver,
  caldav: caldavDriver,
  carddav: carddavDriver,
  cloudflare: cloudflareDriver,
  resend: resendDriver,
  ses: sesDriver,
  s3: s3Driver,
  webdav: webdavDriver,
  ftp: ftpDriver,
  sftp: sftpDriver,
};

export function isConnectionProvider(value: string): value is ConnectionProvider {
  return value in DRIVERS;
}

export function getDriver(provider: ConnectionProvider): ProviderDriver {
  return DRIVERS[provider];
}

export function getOAuthDriver(provider: ConnectionProvider): OAuthProviderDriver {
  const driver = DRIVERS[provider];
  if (driver.kind !== "oauth") {
    throw new Error(`${driver.label} does not use OAuth`);
  }
  return driver;
}

export function getCredentialDriver(provider: CredentialProvider): CredentialProviderDriver {
  const driver = DRIVERS[provider];
  if (driver.kind !== "credentials") {
    throw new Error(`${driver.label} does not use stored credentials`);
  }
  return driver;
}
