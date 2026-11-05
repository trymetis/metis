import type { CalendarProvider, ConnectionAuth, ProviderCalendar } from "@/connections";
import { calendarName, type NamedCalendar } from "@/connections/calendar-name";
import { BadRequestError } from "@/lib/errors/bad-request";
import { NotVisibleError } from "@/lib/errors/not-visible";
import { sanitizeError } from "@/lib/errors/sanitize-error";
import type {
  CalendarEvent,
  CalendarSourceError,
  EventsResponse,
  ListEventsOptions,
} from "@/types/calendar";

import { type CalendarAdapter, getCalendarAdapter } from "./adapter";
import type { EventAstSearch } from "./text-search";

export interface ResolvedCalendar {
  accountId: string;
  linkId: string;
  accountSlug: string;
  accountEmail: string;
  provider: CalendarProvider;
  server: string | null;
  visibleCalendarIds: string[];
  policy: { ai: boolean };
  auth: () => Promise<ConnectionAuth>;
}

export interface TaggedCalendar extends ProviderCalendar {
  accountId: string;
  accountSlug: string;
  accountEmail: string;
  provider: CalendarProvider;
  visible: boolean;
}

function namedCalendar(account: ResolvedCalendar): NamedCalendar {
  return { provider: account.provider, email: account.accountEmail, server: account.server };
}

export function resolvedCalendarName(
  account: ResolvedCalendar,
  all: readonly ResolvedCalendar[],
): string {
  return calendarName(namedCalendar(account), all.map(namedCalendar));
}

export function accountNameIn(
  all: readonly ResolvedCalendar[],
  accountId: string | undefined,
  email: string,
): string {
  const account = accountId ? all.find((c) => c.accountId === accountId) : undefined;
  return account ? resolvedCalendarName(account, all) : email;
}

export async function adapterForCalendar(account: ResolvedCalendar): Promise<CalendarAdapter> {
  return getCalendarAdapter(account.provider, await account.auth(), account.accountEmail);
}

export function isCalendarVisible(account: ResolvedCalendar, calendarId: string): boolean {
  return account.visibleCalendarIds.includes(calendarId);
}

export function resolveCalendarAccount(
  accounts: ResolvedCalendar[],
  accountId?: string,
): ResolvedCalendar {
  if (!accountId) {
    const only = accounts.length === 1 ? accounts[0] : null;
    if (!only) throw new BadRequestError("Pick which calendar account to use");
    return only;
  }
  const found = accounts.find((a) => a.accountId === accountId);
  if (!found) throw new NotVisibleError("No calendar account you can see with that id");
  return found;
}

export function assertWritable(account: ResolvedCalendar, calendarId: string): void {
  if (!isCalendarVisible(account, calendarId)) {
    throw new NotVisibleError("That calendar is not visible in this workspace");
  }
}

function tag(event: CalendarEvent, account: ResolvedCalendar): CalendarEvent {
  return {
    ...event,
    accountId: account.accountId,
    accountSlug: account.accountSlug,
    accountEmail: account.accountEmail,
  };
}

function millis(event: CalendarEvent): number {
  const ms = new Date(event.start).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function requestedCalendarIds(account: ResolvedCalendar, wanted?: string[]): string[] | undefined {
  if (!wanted) return account.visibleCalendarIds;
  return wanted.filter((id) => isCalendarVisible(account, id));
}

export async function listEventsAcross(
  accounts: ResolvedCalendar[],
  opts: ListEventsOptions,
): Promise<EventsResponse> {
  return eventsAcross(accounts, opts.calendarIds, (adapter, calendarIds) =>
    adapter.listEvents({ ...opts, calendarIds }),
  );
}

export async function searchEventsAcross(
  accounts: ResolvedCalendar[],
  search: (account: ResolvedCalendar) => Omit<EventAstSearch, "calendarIds"> | null,
): Promise<EventsResponse> {
  const plans = new Map(accounts.map((account) => [account.accountId, search(account)]));
  return eventsAcross(
    accounts.filter((account) => plans.get(account.accountId)),
    undefined,
    (adapter, calendarIds, account) => {
      const plan = plans.get(account.accountId);
      if (!plan) return Promise.resolve({ events: [] });
      return adapter.searchAst({
        ...plan,
        calendarIds,
        accept: (residual, events) =>
          plan.accept(
            residual,
            events.map((event) => tag(event, account)),
          ),
      });
    },
  );
}

async function eventsAcross(
  accounts: ResolvedCalendar[],
  wanted: string[] | undefined,
  run: (
    adapter: CalendarAdapter,
    calendarIds: string[] | undefined,
    account: ResolvedCalendar,
  ) => Promise<EventsResponse>,
): Promise<EventsResponse> {
  const settled = await Promise.all(
    accounts.map(async (account) => {
      try {
        const calendarIds = requestedCalendarIds(account, wanted);
        if (calendarIds !== undefined && calendarIds.length === 0) {
          return { account, events: [] as CalendarEvent[], error: null };
        }
        const adapter = await adapterForCalendar(account);
        const res = await run(adapter, calendarIds, account);
        return {
          account,
          events: res.events.map((event) => tag(event, account)),
          error: null as string | null,
        };
      } catch (err) {
        return {
          account,
          events: [] as CalendarEvent[],
          error: sanitizeError(err),
        };
      }
    }),
  );

  const events: CalendarEvent[] = [];
  const calendarErrors: CalendarSourceError[] = [];

  for (const row of settled) {
    if (row.error !== null) {
      calendarErrors.push({
        accountId: row.account.accountId,
        accountEmail: row.account.accountEmail,
        error: row.error,
      });
      continue;
    }
    events.push(...row.events);
  }

  events.sort((a, b) => millis(a) - millis(b));

  return {
    events,
    calendarErrors: calendarErrors.length ? calendarErrors : undefined,
  };
}

export async function listCalendarsAcross(
  accounts: ResolvedCalendar[],
): Promise<{ calendars: TaggedCalendar[]; errors: CalendarSourceError[] }> {
  const settled = await Promise.all(
    accounts.map(async (account) => {
      try {
        const adapter = await adapterForCalendar(account);
        const rows = await adapter.listCalendars();
        return {
          account,
          calendars: rows.map((c) => ({
            ...c,
            accountId: account.accountId,
            accountSlug: account.accountSlug,
            accountEmail: account.accountEmail,
            provider: account.provider,
            visible: isCalendarVisible(account, c.id),
          })),
          error: null as string | null,
        };
      } catch (err) {
        return {
          account,
          calendars: [] as TaggedCalendar[],
          error: sanitizeError(err),
        };
      }
    }),
  );

  const calendars: TaggedCalendar[] = [];
  const errors: CalendarSourceError[] = [];
  for (const row of settled) {
    if (row.error !== null) {
      errors.push({
        accountId: row.account.accountId,
        accountEmail: row.account.accountEmail,
        error: row.error,
      });
      continue;
    }
    calendars.push(...row.calendars);
  }
  return { calendars, errors };
}
