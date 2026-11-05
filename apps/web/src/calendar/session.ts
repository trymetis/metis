import type { Auth } from "@/auth/server";
import { getAppUser, isWorkspaceUser, type WorkspaceUserSession } from "@/auth/session";
import {
  type ConnectionAuth,
  getWorkspaceCalendarBySlug,
  listWorkspaceCalendars,
  resolveConnectionAuth,
  type WorkspaceCalendarRow,
} from "@/connections";
import type { WorkspaceRole } from "@/types/workspace";
import { ALL_CALENDARS_SLUG } from "@/workspace/path";

import type { ResolvedCalendar } from "./aggregate";

export interface CalendarSession {
  userId: string;
  user: Auth["$Infer"]["Session"]["user"];
  calendarSlug: string;
  isAggregate: boolean;
  accounts: ResolvedCalendar[];
  workspaceId: string;
  workspaceSlug: string;
  workspaceRole: WorkspaceRole;
}

function lazyResolved(found: WorkspaceCalendarRow): ResolvedCalendar {
  let pending: Promise<ConnectionAuth> | null = null;
  return {
    accountId: found.id,
    linkId: found.linkId,
    accountSlug: found.slug,
    accountEmail: found.email,
    provider: found.provider,
    server: found.server,
    visibleCalendarIds: found.visibleCalendarIds,
    policy: found.policy,
    auth: () => {
      pending ??= resolveConnectionAuth(found).then((resolved) => {
        if (!resolved) {
          pending = null;
          throw new Error(`Could not authenticate ${found.email}`);
        }
        return resolved;
      });
      return pending;
    },
  };
}

export async function workspaceCalendarAccounts(workspaceId: string): Promise<ResolvedCalendar[]> {
  const rows = await listWorkspaceCalendars(workspaceId);
  return rows.map(lazyResolved);
}

export async function calendarSessionFor(
  appUser: WorkspaceUserSession,
  calendarSlug: string,
): Promise<CalendarSession | null> {
  const base = {
    userId: appUser.userId,
    user: appUser.user,
    workspaceId: appUser.workspaceId,
    workspaceSlug: appUser.workspaceSlug,
    workspaceRole: appUser.workspaceRole,
  };

  if (calendarSlug === ALL_CALENDARS_SLUG) {
    const accounts = await workspaceCalendarAccounts(appUser.workspaceId);
    if (accounts.length === 0) return null;
    return {
      ...base,
      calendarSlug: ALL_CALENDARS_SLUG,
      isAggregate: true,
      accounts,
    };
  }

  const found = await getWorkspaceCalendarBySlug(calendarSlug, appUser.workspaceId);
  if (!found) return null;

  return {
    ...base,
    calendarSlug: found.slug,
    isAggregate: false,
    accounts: [lazyResolved(found)],
  };
}

export async function getCalendarSession(
  headers: Headers,
  workspaceSlug: string,
  calendarSlug: string,
): Promise<CalendarSession | null> {
  const appUser = await getAppUser(headers, workspaceSlug);
  if (!isWorkspaceUser(appUser)) return null;
  return calendarSessionFor(appUser, calendarSlug);
}

export async function firstCalendarSlug(workspaceId: string): Promise<string | null> {
  const all = await listWorkspaceCalendars(workspaceId);
  return all[0]?.slug ?? null;
}
