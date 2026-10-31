import "server-only";
import { z } from "zod";

import {
  adapterForCalendar,
  assertWritable,
  listCalendarsAcross,
  listEventsAcross,
  type ResolvedCalendar,
} from "@/calendar/aggregate";
import { truncate } from "@/lib/utils";
import {
  attendeeResponseSchema,
  calendarEventSchema,
  calendarProviderSchema,
  calendarSourceErrorSchema,
} from "@/server/schema";
import type { WritableAttendeeResponse } from "@/types/calendar";

import type { Output } from "./output";

const DEFAULT_EVENT_MAX = 250;

export const listCalendarsOutput = z.object({
  accountCount: z.number(),
  calendars: z.array(
    z.object({
      calendarAccountId: z.string(),
      accountEmail: z.string(),
      provider: calendarProviderSchema,
      calendarId: z.string(),
      name: z.string(),
      primary: z.boolean(),
      readOnly: z.boolean(),
      timeZone: z.string().nullable(),
    }),
  ),
  errors: z.array(calendarSourceErrorSchema).optional(),
});

export const listEventsOutput = z.object({
  count: z.number(),
  events: z.array(
    z.object({
      eventId: z.string(),
      calendarAccountId: z.string().optional(),
      accountEmail: z.string().optional(),
      calendarId: z.string(),
      calendarName: z.string().optional(),
      title: z.string(),
      start: z.string(),
      end: z.string(),
      allDay: z.boolean(),
      location: z.string().optional(),
      status: calendarEventSchema.shape.status,
      attendees: z.array(z.string()).optional(),
    }),
  ),
  errors: z.array(calendarSourceErrorSchema).optional(),
});

export const getEventOutput = calendarEventSchema.extend({
  calendarAccountId: z.string(),
  accountEmail: z.string(),
});

export const createEventOutput = z.object({
  created: z.literal(true),
  eventId: z.string(),
  calendarId: z.string(),
  calendarAccountId: z.string(),
  title: z.string(),
});

export const updateEventOutput = z.object({ updated: z.literal(true), eventId: z.string() });

export const deleteEventOutput = z.object({ deleted: z.literal(true), eventId: z.string() });

export const respondToEventOutput = z.object({
  responded: z.literal(true),
  eventId: z.string(),
  response: attendeeResponseSchema,
});

export interface EventWriteInput {
  calendarId?: string;
  title?: string;
  description?: string;
  location?: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  attendees?: string[];
  timeZone?: string;
}

export async function listCalendars(
  accounts: ResolvedCalendar[],
): Promise<Output<typeof listCalendarsOutput>> {
  const { calendars, errors } = await listCalendarsAcross(accounts);
  return {
    accountCount: accounts.length,
    calendars: calendars
      .filter((c) => c.visible)
      .map((c) => ({
        calendarAccountId: c.accountId,
        accountEmail: c.accountEmail,
        provider: c.provider,
        calendarId: c.id,
        name: c.name,
        primary: c.primary,
        readOnly: c.readOnly,
        timeZone: c.timeZone,
      })),
    errors: errors.length ? errors : undefined,
  };
}

export async function listEvents(
  accounts: ResolvedCalendar[],
  args: {
    timeMin: string;
    timeMax: string;
    calendarIds?: string[];
    query?: string;
    max?: number;
  },
): Promise<Output<typeof listEventsOutput>> {
  const res = await listEventsAcross(accounts, { ...args, max: args.max ?? DEFAULT_EVENT_MAX });
  return {
    count: res.events.length,
    events: res.events.map((event) => ({
      eventId: event.id,
      calendarAccountId: event.accountId,
      accountEmail: event.accountEmail,
      calendarId: event.calendarId,
      calendarName: event.calendarName,
      title: event.title,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      location: event.location,
      status: event.status,
      attendees: event.attendees?.map((a) => a.email),
    })),
    errors: res.calendarErrors,
  };
}

export async function getEvent(
  account: ResolvedCalendar,
  calendarId: string,
  eventId: string,
): Promise<Output<typeof getEventOutput>> {
  assertWritable(account, calendarId);
  const adapter = await adapterForCalendar(account);
  const event = await adapter.getEvent(calendarId, eventId);
  return {
    ...event,
    description: event.description ? truncate(event.description, 4000) : undefined,
    calendarAccountId: account.accountId,
    accountEmail: account.accountEmail,
  };
}

export async function createEvent(
  account: ResolvedCalendar,
  input: EventWriteInput & { title: string; start: string; end: string },
): Promise<Output<typeof createEventOutput>> {
  if (input.calendarId) assertWritable(account, input.calendarId);
  const adapter = await adapterForCalendar(account);
  const created = await adapter.createEvent({
    calendarId: input.calendarId,
    title: input.title,
    description: input.description,
    location: input.location,
    start: input.start,
    end: input.end,
    allDay: input.allDay,
    attendees: input.attendees,
    timeZone: input.timeZone,
  });
  return {
    created: true,
    eventId: created.id,
    calendarId: created.calendarId,
    calendarAccountId: account.accountId,
    title: input.title,
  };
}

export async function updateEvent(
  account: ResolvedCalendar,
  calendarId: string,
  eventId: string,
  input: EventWriteInput,
): Promise<Output<typeof updateEventOutput>> {
  assertWritable(account, calendarId);
  const adapter = await adapterForCalendar(account);
  await adapter.updateEvent(calendarId, eventId, {
    title: input.title,
    description: input.description,
    location: input.location,
    start: input.start,
    end: input.end,
    allDay: input.allDay,
    attendees: input.attendees,
    timeZone: input.timeZone,
  });
  return { updated: true, eventId };
}

export async function deleteEvent(
  account: ResolvedCalendar,
  calendarId: string,
  eventId: string,
): Promise<Output<typeof deleteEventOutput>> {
  assertWritable(account, calendarId);
  const adapter = await adapterForCalendar(account);
  await adapter.deleteEvent(calendarId, eventId);
  return { deleted: true, eventId };
}

export async function respondToEvent(
  account: ResolvedCalendar,
  calendarId: string,
  eventId: string,
  response: WritableAttendeeResponse,
): Promise<Output<typeof respondToEventOutput>> {
  assertWritable(account, calendarId);
  const adapter = await adapterForCalendar(account);
  await adapter.respondToEvent(calendarId, eventId, response);
  return { responded: true, eventId, response };
}
