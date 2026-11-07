import {
  type BrandMark,
  CaldavServer,
  CarddavServer,
  FtpServer,
  ImapServer,
  ObjectStorage,
  OutlookCalendar,
  ResendMail,
  SftpServer,
  WebdavServer,
  ZohoCalendar,
  ZohoMail,
} from "@metis/ui/components/brand-marks";
import { Cloudflare } from "@metis/ui/components/svgs/cloudflare";
import { Drive } from "@metis/ui/components/svgs/drive";
import { Gmail } from "@metis/ui/components/svgs/gmail";
import { GoogleCalendar } from "@metis/ui/components/svgs/googleCalendar";
import { MicrosoftOutlook } from "@metis/ui/components/svgs/microsoft-outlook";
import { MicrosoftOnedrive } from "@metis/ui/components/svgs/microsoftOnedrive";

import { ADDRESS_BOOK_PROVIDER_LABELS } from "@/connections/address-book-name";
import { CALENDAR_PROVIDER_LABELS } from "@/connections/calendar-name";
import {
  type ConnectionProvider,
  type ConnectionResource,
  type ConnectServer,
  type ProvidersFor,
  providerSupportsResource,
} from "@/connections/types";
import { DRIVE_PROVIDER_LABELS } from "@/drive/name";

export { providerSupportsResource };

export interface ProviderMeta {
  label: string;
  Mark: BrandMark;
}

export const ACCOUNT_PROVIDER_META: Record<ConnectionProvider, ProviderMeta> = {
  google: { label: "Google", Mark: Gmail },
  microsoft: { label: "Outlook", Mark: MicrosoftOutlook },
  zoho: { label: "Zoho", Mark: ZohoMail },
  imap: { label: "IMAP", Mark: ImapServer },
  caldav: { label: "CalDAV", Mark: CaldavServer },
  carddav: { label: "CardDAV", Mark: CarddavServer },
  cloudflare: { label: "Cloudflare", Mark: Cloudflare },
  resend: { label: "Resend", Mark: ResendMail },
  s3: { label: "S3", Mark: ObjectStorage },
  webdav: { label: "WebDAV", Mark: WebdavServer },
  ftp: { label: "FTP", Mark: FtpServer },
  sftp: { label: "SFTP", Mark: SftpServer },
};

export const RESOURCE_PROVIDER_META: {
  [R in ConnectionResource]: Record<ProvidersFor<R>, ProviderMeta>;
} = {
  mailbox: {
    google: { label: "Gmail", Mark: Gmail },
    microsoft: { label: "Outlook", Mark: MicrosoftOutlook },
    zoho: { label: "Zoho Mail", Mark: ZohoMail },
    imap: { label: "IMAP", Mark: ImapServer },
    cloudflare: { label: "Cloudflare Email", Mark: Cloudflare },
    resend: { label: "Resend", Mark: ResendMail },
  },
  calendar: {
    google: { label: CALENDAR_PROVIDER_LABELS.google, Mark: GoogleCalendar },
    microsoft: { label: CALENDAR_PROVIDER_LABELS.microsoft, Mark: OutlookCalendar },
    zoho: { label: CALENDAR_PROVIDER_LABELS.zoho, Mark: ZohoCalendar },
    caldav: { label: CALENDAR_PROVIDER_LABELS.caldav, Mark: CaldavServer },
  },
  drive: {
    google: { label: DRIVE_PROVIDER_LABELS.google, Mark: Drive },
    microsoft: { label: DRIVE_PROVIDER_LABELS.microsoft, Mark: MicrosoftOnedrive },
    s3: { label: DRIVE_PROVIDER_LABELS.s3, Mark: ObjectStorage },
    webdav: { label: DRIVE_PROVIDER_LABELS.webdav, Mark: WebdavServer },
    ftp: { label: DRIVE_PROVIDER_LABELS.ftp, Mark: FtpServer },
    sftp: { label: DRIVE_PROVIDER_LABELS.sftp, Mark: SftpServer },
  },
  addressbook: {
    google: { label: ADDRESS_BOOK_PROVIDER_LABELS.google, Mark: Gmail },
    microsoft: { label: ADDRESS_BOOK_PROVIDER_LABELS.microsoft, Mark: MicrosoftOutlook },
    zoho: { label: ADDRESS_BOOK_PROVIDER_LABELS.zoho, Mark: ZohoMail },
    carddav: { label: ADDRESS_BOOK_PROVIDER_LABELS.carddav, Mark: CarddavServer },
  },
};

export function resourceProviderMeta<R extends ConnectionResource>(
  resource: R,
  provider: ProvidersFor<R>,
): ProviderMeta {
  return RESOURCE_PROVIDER_META[resource][provider];
}

export function providerLine(label: string, server: string | null): string {
  return server ? `${label} · ${server}` : label;
}

export function providerNames(
  providers: readonly ConnectionProvider[],
  label: "mail" | "account",
  conjunction: "or" | "and" = "or",
): string {
  const names = providers.map((provider) =>
    label === "mail" && providerSupportsResource(provider, "mailbox")
      ? RESOURCE_PROVIDER_META.mailbox[provider].label
      : ACCOUNT_PROVIDER_META[provider].label,
  );
  const [first, second] = names;
  if (!first) return "";
  if (!second) return first;
  if (names.length === 2) return `${first} ${conjunction} ${second}`;
  return `${names.slice(0, -1).join(", ")}, ${conjunction} ${names.at(-1)}`;
}

export type ResourceServer<R extends ConnectionResource> = ConnectServer & {
  provider: ProvidersFor<R>;
};

export function serversForResource<R extends ConnectionResource>(
  servers: readonly ConnectServer[],
  resource: R,
): ResourceServer<R>[] {
  return servers.filter((server): server is ResourceServer<R> =>
    providerSupportsResource(server.provider, resource),
  );
}

export function serverProviders(servers: readonly ConnectServer[]): ConnectionProvider[] {
  return [...new Set(servers.map((server) => server.provider))];
}
