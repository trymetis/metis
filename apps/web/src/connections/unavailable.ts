import "server-only";
import { and, eq, exists, isNotNull, or, sql } from "drizzle-orm";

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
  workspaceMember,
} from "@/db/schema";

import { serverLabel } from "./connection-store";
import type { ConnectionProvider } from "./types";

export interface UnavailableConnection {
  connectionId: string;
  provider: ConnectionProvider;
  email: string;
  server: string | null;
  mine: boolean;
  quarantinedAt: Date;
}

export async function listUnavailableConnections(userId: string): Promise<UnavailableConnection[]> {
  const linkedToMyWorkspace = or(
    exists(
      db
        .select({ one: sql`1` })
        .from(mailboxWorkspace)
        .innerJoin(mailbox, eq(mailbox.id, mailboxWorkspace.mailboxId))
        .innerJoin(
          workspaceMember,
          and(
            eq(workspaceMember.workspaceId, mailboxWorkspace.workspaceId),
            eq(workspaceMember.userId, userId),
            eq(workspaceMember.role, "owner"),
          ),
        )
        .where(eq(mailbox.connectionId, connection.id)),
    ),
    exists(
      db
        .select({ one: sql`1` })
        .from(calendarWorkspace)
        .innerJoin(calendar, eq(calendar.id, calendarWorkspace.calendarId))
        .innerJoin(
          workspaceMember,
          and(
            eq(workspaceMember.workspaceId, calendarWorkspace.workspaceId),
            eq(workspaceMember.userId, userId),
            eq(workspaceMember.role, "owner"),
          ),
        )
        .where(eq(calendar.connectionId, connection.id)),
    ),
    exists(
      db
        .select({ one: sql`1` })
        .from(driveWorkspace)
        .innerJoin(drive, eq(drive.id, driveWorkspace.driveId))
        .innerJoin(
          workspaceMember,
          and(
            eq(workspaceMember.workspaceId, driveWorkspace.workspaceId),
            eq(workspaceMember.userId, userId),
            eq(workspaceMember.role, "owner"),
          ),
        )
        .where(eq(drive.connectionId, connection.id)),
    ),
    exists(
      db
        .select({ one: sql`1` })
        .from(addressBookWorkspace)
        .innerJoin(addressBook, eq(addressBook.id, addressBookWorkspace.addressBookId))
        .innerJoin(
          workspaceMember,
          and(
            eq(workspaceMember.workspaceId, addressBookWorkspace.workspaceId),
            eq(workspaceMember.userId, userId),
            eq(workspaceMember.role, "owner"),
          ),
        )
        .where(eq(addressBook.connectionId, connection.id)),
    ),
  );

  const rows = await db
    .selectDistinct({
      connectionId: connection.id,
      userId: connection.userId,
      provider: connection.provider,
      email: connection.email,
      server: serverLabel,
      quarantinedAt: connection.quarantinedAt,
    })
    .from(connection)
    .where(
      and(
        isNotNull(connection.quarantinedAt),
        or(eq(connection.userId, userId), linkedToMyWorkspace),
      ),
    );

  return rows.flatMap((row) =>
    row.quarantinedAt
      ? [
          {
            connectionId: row.connectionId,
            provider: row.provider,
            email: row.email,
            server: row.server,
            mine: row.userId === userId,
            quarantinedAt: row.quarantinedAt,
          },
        ]
      : [],
  );
}
