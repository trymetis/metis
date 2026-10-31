import "server-only";
import { ORPCError } from "@orpc/server";

import {
  adapterForCalendar,
  assertWritable,
  listCalendarsAcross,
  listEventsAcross,
  resolveCalendarAccount,
} from "@/calendar/aggregate";
import { countEventDays } from "@/calendar/day-counts";

import { calendarSession } from "../middlewares/calendar-session";
import {
  calendarEventSchema,
  calendarScopeSchema,
  createEventInputSchema,
  createEventOutputSchema,
  getEventInputSchema,
  listEventDaysInputSchema,
  listEventDaysOutputSchema,
  listEventsInputSchema,
  listEventsOutputSchema,
  listSessionCalendarsOutputSchema,
  respondEventInputSchema,
  successSchema,
  updateEventInputSchema,
} from "../schema";

function fail(err: unknown): ORPCError<"BAD_GATEWAY", unknown> {
  return new ORPCError("BAD_GATEWAY", { cause: err });
}

export const calendarEventsRouter = {
  calendars: calendarSession(calendarScopeSchema)
    .output(listSessionCalendarsOutputSchema)
    .handler(async ({ context }) => {
      const { calendars, errors } = await listCalendarsAcross(context.calendar.accounts);
      return {
        calendars,
        calendarErrors: errors.length ? errors : undefined,
      };
    }),

  list: calendarSession(listEventsInputSchema)
    .output(listEventsOutputSchema)
    .handler(async ({ input, context }) => {
      try {
        return await listEventsAcross(context.calendar.accounts, {
          timeMin: input.timeMin,
          timeMax: input.timeMax,
          calendarIds: input.calendarIds,
          query: input.query,
          max: input.max,
        });
      } catch (err) {
        throw fail(err);
      }
    }),

  days: calendarSession(listEventDaysInputSchema)
    .output(listEventDaysOutputSchema)
    .handler(async ({ input, context }) => {
      try {
        const { events, calendarErrors } = await listEventsAcross(context.calendar.accounts, {
          timeMin: input.timeMin,
          timeMax: input.timeMax,
          calendarIds: input.calendarIds,
          fields: "times",
        });
        return {
          days: countEventDays(events, input.timeZone, input.timeMin, input.timeMax),
          calendarErrors,
        };
      } catch (err) {
        throw fail(err);
      }
    }),

  get: calendarSession(getEventInputSchema)
    .output(calendarEventSchema)
    .handler(async ({ input, context }) => {
      const account = resolveCalendarAccount(context.calendar.accounts, input.accountId);
      assertWritable(account, input.calendarId);
      try {
        const adapter = await adapterForCalendar(account);
        const event = await adapter.getEvent(input.calendarId, input.eventId);
        return {
          ...event,
          accountId: account.accountId,
          accountSlug: account.accountSlug,
          accountEmail: account.accountEmail,
        };
      } catch (err) {
        throw fail(err);
      }
    }),

  create: calendarSession(createEventInputSchema)
    .output(createEventOutputSchema)
    .handler(async ({ input, context }) => {
      const account = resolveCalendarAccount(context.calendar.accounts, input.accountId);
      if (input.calendarId) assertWritable(account, input.calendarId);
      try {
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
          addMeeting: input.addMeeting,
        });
        return { ...created, accountId: account.accountId };
      } catch (err) {
        throw fail(err);
      }
    }),

  update: calendarSession(updateEventInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const account = resolveCalendarAccount(context.calendar.accounts, input.accountId);
      assertWritable(account, input.calendarId);
      try {
        const adapter = await adapterForCalendar(account);
        await adapter.updateEvent(input.calendarId, input.eventId, {
          title: input.title,
          description: input.description,
          location: input.location,
          start: input.start,
          end: input.end,
          allDay: input.allDay,
          attendees: input.attendees,
          timeZone: input.timeZone,
        });
        return { success: true as const };
      } catch (err) {
        throw fail(err);
      }
    }),

  delete: calendarSession(getEventInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const account = resolveCalendarAccount(context.calendar.accounts, input.accountId);
      assertWritable(account, input.calendarId);
      try {
        const adapter = await adapterForCalendar(account);
        await adapter.deleteEvent(input.calendarId, input.eventId);
        return { success: true as const };
      } catch (err) {
        throw fail(err);
      }
    }),

  respond: calendarSession(respondEventInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const account = resolveCalendarAccount(context.calendar.accounts, input.accountId);
      assertWritable(account, input.calendarId);
      try {
        const adapter = await adapterForCalendar(account);
        await adapter.respondToEvent(input.calendarId, input.eventId, input.response);
        return { success: true as const };
      } catch (err) {
        throw fail(err);
      }
    }),
};
