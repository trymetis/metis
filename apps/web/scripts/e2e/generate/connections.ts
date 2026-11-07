import { CALENDAR_COLLECTIONS, calendarCollectionUrl } from "@metis/e2e/lib/calendars";
import { ADDRESS_BOOK_COLLECTIONS, addressBookCollectionUrl } from "@metis/e2e/lib/contacts";
import { env } from "@metis/e2e/lib/env";
import { eq } from "drizzle-orm";

import * as connections from "../../../src/connections";
import { credentialAccountId } from "../../../src/connections/drivers/credential";
import { db } from "../../../src/db";
import {
  addressBookWorkspace,
  calendarWorkspace,
  driveWorkspace,
  mailboxWorkspace,
} from "../../../src/db/schema";
import type { Account } from "./account";

export interface Resources {
  mailboxSlug: string;
  calendarSlug: string;
  addressBookSlug: string;
  driveSlugs: Record<string, string>;
}

export async function connectResources(account: Account): Promise<Resources> {
  const { email, userId, workspaceId } = account;

  async function connect(
    credentials: Parameters<typeof connections.upsertCredentialConnection>[0]["credentials"],
    accountKey: string,
  ) {
    const provider = credentials.provider;
    const resource = connections.credentialResourceFor(provider);
    const resolved = connections.resolveServerCredentials(credentials);
    if (!resolved) {
      throw new Error(`${provider} server "${credentials.server}" is not configured`);
    }
    const connection = await connections.upsertCredentialConnection({
      userId,
      provider,
      profile: {
        providerAccountId: credentialAccountId(accountKey, credentials.server),
        email,
        image: null,
      },
      credentials: {
        ...credentials,
        serverId: resolved.serverId,
        server: resolved.server,
      },
      resources: [resource],
    });
    const { slug } = await connections.addConnectionResource({
      account: connection,
      resource,
      workspaceId,
    });
    if (!slug) throw new Error(`${provider} was not attached to the workspace`);
    return slug;
  }

  const { bucket } = env.s3;
  const mailboxSlug = await connect(
    {
      provider: "imap",
      server: env.servers.imap,
      user: env.imap.user,
      pass: env.imap.pass,
      smtpAuth: null,
    },
    email,
  );
  const calendarSlug = await connect(
    {
      provider: "caldav",
      server: env.servers.caldav,
      user: env.caldav.user,
      pass: env.caldav.pass,
    },
    email,
  );
  const addressBookSlug = await connect(
    {
      provider: "carddav",
      server: env.servers.carddav,
      user: env.caldav.user,
      pass: env.caldav.pass,
    },
    email,
  );
  const [s3Direct, s3Relay] = env.servers.s3;
  const [ftpTls, ftpPlain, ftpImplicit] = env.servers.ftp;
  if (!s3Direct || !s3Relay || !ftpTls || !ftpPlain || !ftpImplicit) {
    throw new Error(
      "METIS_S3_SERVERS needs two entries (direct + relay) and METIS_FTP_SERVERS three (explicit TLS + plain + implicit TLS)",
    );
  }

  const driveSlugs: Record<string, string> = {
    s3: await connect({ provider: "s3", server: s3Direct, bucket, prefix: null }, `${bucket}|`),
    s3Relay: await connect({ provider: "s3", server: s3Relay, bucket, prefix: null }, `${bucket}|`),
    webdav: await connect(
      {
        provider: "webdav",
        server: env.servers.webdav,
        user: env.webdav.user,
        pass: env.webdav.pass,
        root: null,
      },
      `${env.webdav.user}|`,
    ),
    ftps: await connect(
      {
        provider: "ftp",
        server: ftpTls,
        user: env.ftp.user,
        pass: env.ftp.pass,
        root: null,
      },
      `${env.ftp.user}|`,
    ),
    ftp: await connect(
      {
        provider: "ftp",
        server: ftpPlain,
        user: env.ftp.user,
        pass: env.ftp.pass,
        root: null,
      },
      `${env.ftp.user}|`,
    ),
    ftpsImplicit: await connect(
      {
        provider: "ftp",
        server: ftpImplicit,
        user: env.ftp.user,
        pass: env.ftp.pass,
        root: null,
      },
      `${env.ftp.user}|`,
    ),
    sftp: await connect(
      {
        provider: "sftp",
        server: env.servers.sftp,
        user: env.sftp.user,
        pass: env.sftp.pass,
        root: env.sftp.root,
      },
      `${env.sftp.user}|${env.sftp.root}`,
    ),
  };
  console.log(
    `[generate] connected mail=${mailboxSlug} calendar=${calendarSlug} contacts=${addressBookSlug} drives=${Object.entries(
      driveSlugs,
    )
      .map(([kind, slug]) => `${kind}:${slug}`)
      .join(",")}`,
  );

  const visibleCalendarIds = CALENDAR_COLLECTIONS.map((c) =>
    calendarCollectionUrl(env.servers.caldavOrigin, env.caldav.user, c.slug),
  );
  await db
    .update(mailboxWorkspace)
    .set({ aiEnabled: true })
    .where(eq(mailboxWorkspace.workspaceId, workspaceId));
  await db
    .update(calendarWorkspace)
    .set({ aiEnabled: true, visibleCalendarIds })
    .where(eq(calendarWorkspace.workspaceId, workspaceId));
  await db
    .update(driveWorkspace)
    .set({ aiEnabled: true })
    .where(eq(driveWorkspace.workspaceId, workspaceId));
  const visibleBookIds = ADDRESS_BOOK_COLLECTIONS.map((c) =>
    addressBookCollectionUrl(env.servers.carddavOrigin, env.caldav.user, c.slug),
  );
  await db
    .update(addressBookWorkspace)
    .set({ aiEnabled: true, visibleBookIds })
    .where(eq(addressBookWorkspace.workspaceId, workspaceId));
  console.log(
    `[generate] AI on for all links, visible calendars: ${visibleCalendarIds.join(", ")}`,
  );

  return { mailboxSlug, calendarSlug, addressBookSlug, driveSlugs };
}
