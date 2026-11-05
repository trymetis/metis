import { and, desc, eq, isNull, notInArray, type SQL } from "drizzle-orm";

import { forgetCalendarLists } from "@/calendar/list-cache";
import { uniqueCalendarSlug } from "@/calendar/slug";
import { db } from "@/db";
import { calendar, calendarWorkspace, connection, workspace, workspaceMember } from "@/db/schema";
import { allOf } from "@/lib/sql";
import type { WorkspaceAiPolicy, WorkspacePhishingDetectionPolicy } from "@/types/workspace";
import { resolveCalendarPolicy } from "@/workspace/policy";

import {
  CONNECTION_COLUMNS,
  type Connection,
  getConnection,
  revokeConnectionIfUnused,
} from "./connection-store";
import {
  type CalendarProvider,
  type ConnectionProvider,
  hasProvider,
  isCalendarProvider,
} from "./types";

export interface Calendar extends Omit<Connection, "provider"> {
  id: string;
  provider: CalendarProvider;
  credentials: string | null;
}

export interface WorkspaceCalendarRow extends Calendar {
  linkId: string;
  workspaceId: string;
  slug: string;
  visibleCalendarIds: string[];
  aiEnabled: boolean;
  policy: { ai: boolean };
}

export interface CalendarWorkspace {
  linkId: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  slug: string;
  aiEnabled: boolean;
  policy: { ai: boolean };
}

const CALENDAR_COLUMNS = {
  ...CONNECTION_COLUMNS,
  id: calendar.id,
  credentials: connection.credentials,
};

const WORKSPACE_CALENDAR_COLUMNS = {
  ...CALENDAR_COLUMNS,
  linkId: calendarWorkspace.id,
  workspaceId: calendarWorkspace.workspaceId,
  slug: calendarWorkspace.slug,
  visibleCalendarIds: calendarWorkspace.visibleCalendarIds,
  aiEnabled: calendarWorkspace.aiEnabled,
  aiPolicy: workspace.aiPolicy,
  phishingDetectionPolicy: workspace.phishingDetectionPolicy,
};

type WorkspaceCalendarQueryRow = Omit<WorkspaceCalendarRow, "policy" | "provider"> & {
  provider: ConnectionProvider;
  aiPolicy: WorkspaceAiPolicy;
  phishingDetectionPolicy: WorkspacePhishingDetectionPolicy;
};

function asCalendar<T extends { id: string; provider: ConnectionProvider }>(
  row: T,
): T & { provider: CalendarProvider } {
  if (!hasProvider(row, isCalendarProvider)) {
    throw new Error(`calendar ${row.id} is backed by a ${row.provider} grant`);
  }
  return row;
}

function withPolicy(row: WorkspaceCalendarQueryRow): WorkspaceCalendarRow {
  const { aiPolicy, phishingDetectionPolicy, ...rest } = asCalendar(row);
  return {
    ...rest,
    policy: resolveCalendarPolicy(rest, { aiPolicy, phishingDetectionPolicy }),
  };
}

function visibilityWhere(workspaceId: string): SQL {
  return allOf(eq(calendarWorkspace.workspaceId, workspaceId), isNull(connection.quarantinedAt));
}

function calendarQuery() {
  return db
    .select(CALENDAR_COLUMNS)
    .from(calendar)
    .innerJoin(connection, eq(connection.id, calendar.connectionId));
}

function workspaceCalendarQuery() {
  return db
    .select(WORKSPACE_CALENDAR_COLUMNS)
    .from(calendarWorkspace)
    .innerJoin(calendar, eq(calendar.id, calendarWorkspace.calendarId))
    .innerJoin(connection, eq(connection.id, calendar.connectionId))
    .innerJoin(workspace, eq(workspace.id, calendarWorkspace.workspaceId));
}

export async function listWorkspaceCalendars(workspaceId: string): Promise<WorkspaceCalendarRow[]> {
  const rows = await workspaceCalendarQuery()
    .where(visibilityWhere(workspaceId))
    .orderBy(desc(calendarWorkspace.createdAt));
  return rows.map(withPolicy);
}

export async function getWorkspaceCalendarBySlug(
  slug: string,
  workspaceId: string,
): Promise<WorkspaceCalendarRow | null> {
  const [row] = await workspaceCalendarQuery()
    .where(and(eq(calendarWorkspace.slug, slug), visibilityWhere(workspaceId)))
    .limit(1);
  return row ? withPolicy(row) : null;
}

export async function getWorkspaceCalendarByLinkId(
  linkId: string,
  workspaceId: string,
): Promise<WorkspaceCalendarRow | null> {
  const [row] = await workspaceCalendarQuery()
    .where(and(eq(calendarWorkspace.id, linkId), visibilityWhere(workspaceId)))
    .limit(1);
  return row ? withPolicy(row) : null;
}

export async function getCalendar(calendarId: string, userId: string): Promise<Calendar | null> {
  const [row] = await calendarQuery()
    .where(and(eq(calendar.id, calendarId), eq(connection.userId, userId)))
    .limit(1);
  return row ? asCalendar(row) : null;
}

export async function listUserCalendars(userId: string): Promise<Calendar[]> {
  const rows = await calendarQuery()
    .where(eq(connection.userId, userId))
    .orderBy(desc(calendar.createdAt));
  return rows.map(asCalendar);
}

export async function listUnattachedCalendars(
  userId: string,
  workspaceId: string,
): Promise<Calendar[]> {
  const attachedHere = db
    .select({ id: calendarWorkspace.calendarId })
    .from(calendarWorkspace)
    .where(eq(calendarWorkspace.workspaceId, workspaceId));

  const rows = await calendarQuery()
    .where(
      and(
        eq(connection.userId, userId),
        isNull(connection.quarantinedAt),
        notInArray(calendar.id, attachedHere),
      ),
    )
    .orderBy(desc(calendar.createdAt));
  return rows.map(asCalendar);
}

export async function getCalendarLink(
  calendarId: string,
  workspaceId: string,
): Promise<{ linkId: string; slug: string } | null> {
  const [row] = await db
    .select({ linkId: calendarWorkspace.id, slug: calendarWorkspace.slug })
    .from(calendarWorkspace)
    .where(
      and(
        eq(calendarWorkspace.calendarId, calendarId),
        eq(calendarWorkspace.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listCalendarWorkspaces(
  calendarId: string,
  userId: string,
): Promise<CalendarWorkspace[]> {
  const rows = await db
    .select({
      linkId: calendarWorkspace.id,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
      slug: calendarWorkspace.slug,
      aiEnabled: calendarWorkspace.aiEnabled,
      aiPolicy: workspace.aiPolicy,
      phishingDetectionPolicy: workspace.phishingDetectionPolicy,
    })
    .from(calendarWorkspace)
    .innerJoin(calendar, eq(calendar.id, calendarWorkspace.calendarId))
    .innerJoin(connection, eq(connection.id, calendar.connectionId))
    .innerJoin(workspace, eq(workspace.id, calendarWorkspace.workspaceId))
    .innerJoin(
      workspaceMember,
      and(eq(workspaceMember.workspaceId, workspace.id), eq(workspaceMember.userId, userId)),
    )
    .where(and(eq(calendarWorkspace.calendarId, calendarId), isNull(connection.quarantinedAt)))
    .orderBy(workspace.name);

  return rows.map(({ aiPolicy, phishingDetectionPolicy, ...rest }) => ({
    ...rest,
    policy: resolveCalendarPolicy(rest, { aiPolicy, phishingDetectionPolicy }),
  }));
}

export async function upsertCalendar(target: Connection): Promise<Calendar> {
  if (!isCalendarProvider(target.provider)) {
    throw new Error(`${target.provider} accounts cannot be used as a calendar`);
  }
  const [existing] = await db
    .select({ id: calendar.id })
    .from(calendar)
    .where(eq(calendar.connectionId, target.connectionId))
    .limit(1);

  if (!existing) {
    const now = new Date();
    await db.insert(calendar).values({
      id: crypto.randomUUID(),
      connectionId: target.connectionId,
      createdAt: now,
      updatedAt: now,
    });
  }

  const [row] = await calendarQuery()
    .where(eq(calendar.connectionId, target.connectionId))
    .limit(1);
  if (!row) throw new Error("Failed to persist calendar");
  return asCalendar(row);
}

export async function attachCalendar(args: {
  calendarId: string;
  email: string;
  workspaceId: string;
}): Promise<{ linkId: string; slug: string }> {
  const { calendarId, email, workspaceId } = args;
  const linkId = crypto.randomUUID();
  const slug = await uniqueCalendarSlug(workspaceId, email);
  await db.insert(calendarWorkspace).values({
    id: linkId,
    calendarId,
    workspaceId,
    slug,
    visibleCalendarIds: [],
    createdAt: new Date(),
  });
  await forgetCalendarLists(workspaceId);
  return { linkId, slug };
}

export async function detachCalendar(args: { linkId: string; workspaceId: string }): Promise<void> {
  await db
    .delete(calendarWorkspace)
    .where(
      and(
        eq(calendarWorkspace.id, args.linkId),
        eq(calendarWorkspace.workspaceId, args.workspaceId),
      ),
    );
  await forgetCalendarLists(args.workspaceId);
}

export async function setCalendarVisibility(args: {
  linkId: string;
  workspaceId: string;
  visibleCalendarIds: string[];
}): Promise<void> {
  await db
    .update(calendarWorkspace)
    .set({ visibleCalendarIds: args.visibleCalendarIds })
    .where(
      and(
        eq(calendarWorkspace.id, args.linkId),
        eq(calendarWorkspace.workspaceId, args.workspaceId),
      ),
    );
  await forgetCalendarLists(args.workspaceId);
}

export async function deleteCalendar(target: Calendar): Promise<boolean> {
  await db.delete(calendar).where(eq(calendar.id, target.id));
  const owner = await getConnection(target.connectionId, target.userId);
  if (!owner) return false;
  return revokeConnectionIfUnused(owner);
}
