import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  addressBook,
  addressBookWorkspace,
  calendar,
  calendarWorkspace,
  connection,
  drive,
  driveWorkspace,
  mailbox,
  mailboxWorkspace,
} from "@/db/schema";
import { keysOf } from "@/lib/guards";

import { parseConnectionCredentials } from "./credential-schema";
import { getDriver, getOAuthDriver } from "./registry";
import { resolveServerCredentials } from "./servers";
import type {
  ConnectionAuth,
  ConnectionProvider,
  ConnectionResource,
  CredentialProvider,
  OAuthProfile,
  StoredConnectionCredentials,
  TokenSet,
} from "./types";
import { isCredentialProvider } from "./types";

const EXPIRY_SKEW_MS = 60_000;

export interface Connection {
  connectionId: string;
  userId: string;
  provider: ConnectionProvider;
  email: string;
  image: string | null;
  providerAccountId: string;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  scope: string | null;
  quarantinedAt: Date | null;
  server: string | null;
}

export const serverLabel = sql<
  string | null
>`coalesce(${connection.serverName}, ${connection.server})`;

export const CONNECTION_COLUMNS = {
  connectionId: connection.id,
  userId: connection.userId,
  provider: connection.provider,
  email: connection.email,
  image: connection.image,
  providerAccountId: connection.providerAccountId,
  accessToken: connection.accessToken,
  refreshToken: connection.refreshToken,
  accessTokenExpiresAt: connection.accessTokenExpiresAt,
  scope: connection.scope,
  quarantinedAt: connection.quarantinedAt,
  server: serverLabel,
};

type ConnectionTokens = Pick<
  Connection,
  | "connectionId"
  | "provider"
  | "accessToken"
  | "refreshToken"
  | "accessTokenExpiresAt"
  | "quarantinedAt"
>;

export interface ConnectionAuthRow extends ConnectionTokens {
  email: string;
  credentials: string | null;
}

function readCredentials(stored: string | null): StoredConnectionCredentials | null {
  if (!stored) return null;
  try {
    return parseConnectionCredentials(JSON.parse(stored));
  } catch (err) {
    console.error("[connections] stored credentials are unreadable:", err);
    return null;
  }
}

export async function resolveConnectionAuth(
  target: ConnectionAuthRow,
): Promise<ConnectionAuth | null> {
  if (isCredentialProvider(target.provider)) {
    if (target.quarantinedAt) {
      console.warn(
        `[connections] ${target.connectionId} (${target.provider}) is quarantined — no credentials issued`,
      );
      return null;
    }
    const stored = readCredentials(target.credentials);
    if (!stored) return null;
    const credentials = resolveServerCredentials(stored);
    if (!credentials) {
      console.warn(
        `[connections] ${target.connectionId} references ${target.provider} server "${stored.server}", which is no longer configured`,
      );
      return null;
    }
    return { kind: "credentials", credentials, email: target.email };
  }

  const accessToken = await getFreshAccessToken(target);
  if (!accessToken) return null;
  return { kind: "oauth", accessToken, email: target.email };
}

function splitScopes(scope: string | null): string[] {
  if (!scope) return [];
  return scope.split(/[\s,]+/).filter(Boolean);
}

function unionScopes(existing: string | null, incoming: string | null): string {
  const separator = (incoming ?? existing ?? "").includes(",") ? "," : " ";
  return [...new Set([...splitScopes(existing), ...splitScopes(incoming)])].join(separator);
}

export function grantedResources(
  target: Pick<Connection, "provider" | "scope">,
): ConnectionResource[] {
  return getDriver(target.provider).grantedResources(target.scope);
}

export async function getConnection(
  connectionId: string,
  userId: string,
): Promise<Connection | null> {
  const [row] = await db
    .select(CONNECTION_COLUMNS)
    .from(connection)
    .where(and(eq(connection.id, connectionId), eq(connection.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listUserConnections(userId: string): Promise<Connection[]> {
  return db
    .select(CONNECTION_COLUMNS)
    .from(connection)
    .where(eq(connection.userId, userId))
    .orderBy(desc(connection.createdAt));
}

export interface WorkspaceConnectionSummary {
  connectionId: string;
  provider: ConnectionProvider;
  email: string;
  server: string | null;
  quarantined: boolean;
  resources: ConnectionResource[];
}

const linked = (rows: { connectionId: string }[]) => new Set(rows.map((r) => r.connectionId));

export async function listWorkspaceConnectionsOf(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceConnectionSummary[]> {
  const [mailRows, calendarRows, driveRows, bookRows, owned] = await Promise.all([
    db
      .selectDistinct({ connectionId: mailbox.connectionId })
      .from(mailbox)
      .innerJoin(mailboxWorkspace, eq(mailboxWorkspace.mailboxId, mailbox.id))
      .where(eq(mailboxWorkspace.workspaceId, workspaceId)),
    db
      .selectDistinct({ connectionId: calendar.connectionId })
      .from(calendar)
      .innerJoin(calendarWorkspace, eq(calendarWorkspace.calendarId, calendar.id))
      .where(eq(calendarWorkspace.workspaceId, workspaceId)),
    db
      .selectDistinct({ connectionId: drive.connectionId })
      .from(drive)
      .innerJoin(driveWorkspace, eq(driveWorkspace.driveId, drive.id))
      .where(eq(driveWorkspace.workspaceId, workspaceId)),
    db
      .selectDistinct({ connectionId: addressBook.connectionId })
      .from(addressBook)
      .innerJoin(addressBookWorkspace, eq(addressBookWorkspace.addressBookId, addressBook.id))
      .where(eq(addressBookWorkspace.workspaceId, workspaceId)),
    listUserConnections(userId),
  ]);
  const mail = linked(mailRows);
  const cal = linked(calendarRows);
  const files = linked(driveRows);
  const books = linked(bookRows);
  return owned.flatMap((row) => {
    const resources: ConnectionResource[] = [];
    if (mail.has(row.connectionId)) resources.push("mailbox");
    if (cal.has(row.connectionId)) resources.push("calendar");
    if (files.has(row.connectionId)) resources.push("drive");
    if (books.has(row.connectionId)) resources.push("addressbook");
    if (resources.length === 0) return [];
    return [
      {
        connectionId: row.connectionId,
        provider: row.provider,
        email: row.email,
        server: row.server,
        quarantined: row.quarantinedAt !== null,
        resources,
      },
    ];
  });
}

export async function listUserConnectionsByProvider(
  userId: string,
  provider: ConnectionProvider,
): Promise<Connection[]> {
  return db
    .select(CONNECTION_COLUMNS)
    .from(connection)
    .where(
      and(
        eq(connection.userId, userId),
        eq(connection.provider, provider),
        isNull(connection.quarantinedAt),
      ),
    );
}

export async function upsertConnection(args: {
  userId: string;
  provider: ConnectionProvider;
  profile: OAuthProfile;
  token: TokenSet;
}): Promise<Connection> {
  const { userId, provider, profile, token } = args;
  const now = new Date();
  const expiresAt = token.expiresInSec ? new Date(Date.now() + token.expiresInSec * 1000) : null;

  const [existing] = await db
    .select({
      id: connection.id,
      refreshToken: connection.refreshToken,
      scope: connection.scope,
    })
    .from(connection)
    .where(
      and(
        eq(connection.userId, userId),
        eq(connection.provider, provider),
        eq(connection.providerAccountId, profile.providerAccountId),
      ),
    )
    .limit(1);

  const id = existing?.id ?? crypto.randomUUID();
  const driver = getDriver(provider);
  const scope =
    driver.kind === "oauth" && driver.mergesGrantedScopes
      ? unionScopes(existing?.scope ?? null, token.scope ?? null)
      : (token.scope ?? existing?.scope ?? null);

  const tokens = {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken ?? existing?.refreshToken ?? null,
    accessTokenExpiresAt: expiresAt,
    scope,
  };

  if (existing) {
    await db
      .update(connection)
      .set({
        email: profile.email,
        image: profile.image ?? null,
        ...tokens,
        quarantinedAt: null,
        updatedAt: now,
      })
      .where(eq(connection.id, id));
  } else {
    await db.insert(connection).values({
      id,
      userId,
      provider,
      email: profile.email,
      image: profile.image ?? null,
      providerAccountId: profile.providerAccountId,
      ...tokens,
      createdAt: now,
      updatedAt: now,
    });
  }

  const saved = await getConnection(id, userId);
  if (!saved) throw new Error("Failed to persist connection");
  return saved;
}

export async function upsertCredentialConnection(args: {
  userId: string;
  provider: CredentialProvider;
  profile: OAuthProfile;
  credentials: StoredConnectionCredentials;
  resources: ConnectionResource[];
}): Promise<Connection> {
  const { userId, provider, profile, credentials, resources } = args;
  const now = new Date();

  const [existing] = await db
    .select({ id: connection.id })
    .from(connection)
    .where(
      and(
        eq(connection.userId, userId),
        eq(connection.provider, provider),
        eq(connection.providerAccountId, profile.providerAccountId),
      ),
    )
    .limit(1);

  const id = existing?.id ?? crypto.randomUUID();
  const values = {
    email: profile.email,
    image: profile.image ?? null,
    accessToken: null,
    refreshToken: null,
    accessTokenExpiresAt: null,
    credentials: JSON.stringify(credentials),
    server: credentials.serverId ?? credentials.server,
    serverName: credentials.server,
    scope: resources.join(" "),
  };

  if (existing) {
    await db
      .update(connection)
      .set({ ...values, quarantinedAt: null, updatedAt: now })
      .where(eq(connection.id, id));
  } else {
    await db.insert(connection).values({
      id,
      userId,
      provider,
      providerAccountId: profile.providerAccountId,
      ...values,
      createdAt: now,
      updatedAt: now,
    });
  }

  const saved = await getConnection(id, userId);
  if (!saved) throw new Error("Failed to persist connection");
  return saved;
}

const RESOURCE_TABLES = {
  mailbox,
  calendar,
  drive,
  addressbook: addressBook,
} as const satisfies Record<ConnectionResource, unknown>;

export async function linkedConnectionResources(
  connectionId: string,
): Promise<ConnectionResource[]> {
  const found = await Promise.all(
    keysOf(RESOURCE_TABLES).map(async (resource) => {
      const table = RESOURCE_TABLES[resource];
      const rows = await db
        .select({ id: table.id })
        .from(table)
        .where(eq(table.connectionId, connectionId))
        .limit(1);
      return rows.length > 0 ? [resource] : [];
    }),
  );
  return found.flat();
}

async function countConnectionResources(connectionId: string): Promise<number> {
  return (await linkedConnectionResources(connectionId)).length;
}

export async function revokeConnection(target: Connection): Promise<void> {
  await db.delete(connection).where(eq(connection.id, target.connectionId));
  await getDriver(target.provider).revoke?.({
    accessToken: target.accessToken,
    refreshToken: target.refreshToken,
  });
}

export async function revokeConnectionIfUnused(target: Connection): Promise<boolean> {
  const remaining = await countConnectionResources(target.connectionId);
  if (remaining > 0) return false;
  await revokeConnection(target);
  return true;
}

async function getFreshAccessToken(target: ConnectionTokens): Promise<string | null> {
  if (isCredentialProvider(target.provider)) return null;

  if (target.quarantinedAt) {
    console.warn(
      `[connections] ${target.connectionId} (${target.provider}) is quarantined — no token issued`,
    );
    return null;
  }

  const now = Date.now();
  const expiresAt = target.accessTokenExpiresAt
    ? target.accessTokenExpiresAt.getTime()
    : Number.POSITIVE_INFINITY;
  const needsRefresh = !target.accessToken || expiresAt - now <= EXPIRY_SKEW_MS;

  if (!needsRefresh && target.accessToken) return target.accessToken;

  if (!target.refreshToken) {
    console.warn(
      `[connections] ${target.connectionId} (${target.provider}) needs refresh but has no refresh_token`,
    );
    return target.accessToken;
  }

  const refreshed = await getOAuthDriver(target.provider).refresh(target.refreshToken);
  if (!refreshed) {
    console.error(`[connections] refresh failed for ${target.connectionId} (${target.provider})`);
    return target.accessToken;
  }

  try {
    await db
      .update(connection)
      .set({
        accessToken: refreshed.accessToken,
        accessTokenExpiresAt: refreshed.expiresInSec
          ? new Date(Date.now() + refreshed.expiresInSec * 1000)
          : null,
        ...(refreshed.refreshToken ? { refreshToken: refreshed.refreshToken } : {}),
        updatedAt: new Date(),
      })
      .where(eq(connection.id, target.connectionId));
  } catch (err) {
    console.error("[connections] failed to persist refreshed token:", err);
  }

  return refreshed.accessToken;
}
