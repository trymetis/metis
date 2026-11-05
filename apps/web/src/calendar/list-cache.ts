import "server-only";
import { z } from "zod";

import { calendarSourceErrorSchema, sessionCalendarSchema } from "@/server/schema";
import { cachedField, forgetHash } from "@/services/cache";

const CALENDAR_LIST_TTL_SEC = 60;
const TAG = "[calendar] list";

const calendarListSchema = z.object({
  calendars: z.array(sessionCalendarSchema),
  errors: z.array(calendarSourceErrorSchema),
});

export type CalendarList = z.infer<typeof calendarListSchema>;

function workspaceKey(workspaceId: string): string {
  return `calendar-lists:${workspaceId}`;
}

export function cachedCalendarList(
  workspaceId: string,
  field: string,
  load: () => Promise<CalendarList>,
): Promise<CalendarList> {
  return cachedField({
    key: workspaceKey(workspaceId),
    field,
    ttlSec: CALENDAR_LIST_TTL_SEC,
    schema: calendarListSchema,
    tag: TAG,
    load,
    keep: (list) => list.errors.length === 0,
  });
}

export function forgetCalendarLists(workspaceId: string): Promise<void> {
  return forgetHash(workspaceKey(workspaceId), TAG);
}
