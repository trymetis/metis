import "server-only";
import { getAppUser, isWorkspaceUser } from "@/auth/session";
import {
  getWorkspaceCalendarBySlug,
  getWorkspaceDriveBySlug,
  getWorkspaceMailboxBySlug,
  listWorkspaceCalendars,
  listWorkspaceDrives,
} from "@/connections";
import { calendarName } from "@/connections/calendar-name";
import { driveName } from "@/drive/name";

import { ALL_CALENDARS_SLUG, ALL_DRIVES_SLUG, ALL_MAILBOXES_SLUG } from "./path";

type ResourceTitle = (slug: string, workspaceId: string) => Promise<string | null>;

async function resourceTitle(
  headers: Headers,
  workspaceSlug: string,
  resourceSlug: string,
  allSlug: string,
  allLabel: string,
  title: ResourceTitle,
): Promise<string | null> {
  const appUser = await getAppUser(headers, workspaceSlug);
  if (!isWorkspaceUser(appUser)) return null;
  if (resourceSlug === allSlug) return allLabel;
  return title(resourceSlug, appUser.workspaceId);
}

export function mailboxTitle(
  headers: Headers,
  workspaceSlug: string,
  mailboxSlug: string,
): Promise<string | null> {
  return resourceTitle(
    headers,
    workspaceSlug,
    mailboxSlug,
    ALL_MAILBOXES_SLUG,
    "All mailboxes",
    async (slug, workspaceId) =>
      (await getWorkspaceMailboxBySlug(slug, workspaceId))?.email ?? null,
  );
}

export function calendarTitle(
  headers: Headers,
  workspaceSlug: string,
  calendarSlug: string,
): Promise<string | null> {
  return resourceTitle(
    headers,
    workspaceSlug,
    calendarSlug,
    ALL_CALENDARS_SLUG,
    "All calendars",
    async (slug, workspaceId) => {
      const [calendar, calendars] = await Promise.all([
        getWorkspaceCalendarBySlug(slug, workspaceId),
        listWorkspaceCalendars(workspaceId),
      ]);
      return calendar ? calendarName(calendar, calendars) : null;
    },
  );
}

export function driveTitle(
  headers: Headers,
  workspaceSlug: string,
  driveSlug: string,
): Promise<string | null> {
  return resourceTitle(
    headers,
    workspaceSlug,
    driveSlug,
    ALL_DRIVES_SLUG,
    "All drives",
    async (slug, workspaceId) => {
      const [drive, drives] = await Promise.all([
        getWorkspaceDriveBySlug(slug, workspaceId),
        listWorkspaceDrives(workspaceId),
      ]);
      return drive ? driveName(drive, drives) : null;
    },
  );
}
