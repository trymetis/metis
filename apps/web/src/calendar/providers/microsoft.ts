import { Client } from "@microsoft/microsoft-graph-client";
import type {
  Attendee,
  Calendar as GraphCalendar,
  Event as GraphEvent,
} from "@microsoft/microsoft-graph-types";

import type { ProviderCalendar } from "@/connections";
import { bind } from "@/lib/bind";
import { errorStatus, readTokenMap } from "@/lib/token-map";
import type {
  AttendeeResponse,
  CalendarEvent,
  EventAttendee,
  EventDraft,
  EventPatch,
  EventsResponse,
  ListEventsOptions,
} from "@/types/calendar";

import type { CalendarAdapter, CalendarChangeSignal } from "../adapter";
import { compactConference, conferenceName } from "../conference";
import { textEventSearch } from "../text-search";

export function microsoftCalendar(accessToken: string): CalendarAdapter {
  return bind<CalendarAdapter, string>(
    {
      listCalendars,
      listEvents,
      getEvent,
      createEvent,
      updateEvent,
      deleteEvent,
      respondToEvent,
      searchAst: (token, search) => textEventSearch((opts) => listEvents(token, opts), search),
      changes,
    },
    accessToken,
  );
}

const DELTA_PAGES = 20;
const LIST_PAGES = 10;
const LIST_PAGE_SIZE = 1000;
const TIMES_SELECT = ["id", "start", "end", "isAllDay", "isCancelled", "showAs", "type"];

interface ListPage {
  value?: GraphEvent[];
  "@odata.nextLink"?: string;
}
const DELTA_WINDOW_DAYS = 90;

interface DeltaPage {
  value?: unknown[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

async function followDelta(
  client: Client,
  start: string,
): Promise<{ link: string; changed: boolean } | null> {
  let url = start;
  let changed = false;
  for (let page = 0; page < DELTA_PAGES; page += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each delta page needs the previous page's link
    const res: DeltaPage = await client.api(url).get();
    if ((res.value ?? []).length > 0) changed = true;
    if (res["@odata.deltaLink"]) return { link: res["@odata.deltaLink"], changed };
    const next = res["@odata.nextLink"];
    if (!next) return null;
    url = next;
  }
  return null;
}

async function changes(
  accessToken: string,
  calendarIds: string[],
  cursor: string | null,
): Promise<CalendarChangeSignal | null> {
  const client = getGraphClient(accessToken);
  const known = readTokenMap(cursor);
  const next: Record<string, string> = {};
  let changed = false;
  const from = new Date(Date.now() - 86_400_000).toISOString();
  const to = new Date(Date.now() + DELTA_WINDOW_DAYS * 86_400_000).toISOString();
  try {
    for (const calendarId of calendarIds) {
      const own = known[calendarId];
      // oxlint-disable-next-line eslint/no-await-in-loop -- one calendar at a time stays inside Graph's per-mailbox throttling
      const followed = await followDelta(
        client,
        own ??
          `/me/calendars/${calendarId}/calendarView/delta?startDateTime=${from}&endDateTime=${to}`,
      );
      if (!followed) return null;
      next[calendarId] = followed.link;
      if (own ? followed.changed : !!cursor) changed = true;
    }
  } catch (err) {
    if (errorStatus(err) === 410) return { cursor: "", changed: true, expired: true };
    throw err;
  }
  return { cursor: JSON.stringify(next), changed };
}

function getGraphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => done(null, accessToken),
  });
}

function toResponse(value?: string | null): AttendeeResponse | undefined {
  if (value === "accepted" || value === "organizer") return "accepted";
  if (value === "declined") return "declined";
  if (value === "tentativelyAccepted") return "tentative";
  if (value === "notResponded" || value === "none") return "needsAction";
  return undefined;
}

function attendee(raw: Attendee) {
  return {
    email: raw.emailAddress?.address ?? "",
    name: raw.emailAddress?.name ?? undefined,
    response: toResponse(raw.status?.response),
    optional: raw.type === "optional",
  } satisfies EventAttendee;
}

function withZone(value: string | undefined | null, zone: string | undefined | null): string {
  if (!value) return "";
  if (/[Z+]|-\d{2}:\d{2}$/.test(value)) return value;
  return zone === "UTC" || zone === undefined || zone === null ? `${value}Z` : value;
}

function toEvent(raw: GraphEvent, calendarId: string, calendarName?: string): CalendarEvent {
  const meetingUrl = raw.onlineMeeting?.joinUrl ?? raw.onlineMeetingUrl ?? undefined;
  return {
    id: raw.id ?? "",
    calendarId,
    calendarName,
    title: raw.subject || "(no title)",
    description: raw.bodyPreview ?? raw.body?.content ?? undefined,
    location: raw.location?.displayName ?? undefined,
    start: withZone(raw.start?.dateTime, raw.start?.timeZone),
    end: withZone(raw.end?.dateTime, raw.end?.timeZone),
    allDay: raw.isAllDay === true,
    status: raw.isCancelled ? "cancelled" : raw.showAs === "tentative" ? "tentative" : "confirmed",
    recurring: Boolean(raw.seriesMasterId) || raw.type === "occurrence",
    organizer: raw.organizer?.emailAddress?.address
      ? {
          email: raw.organizer.emailAddress.address,
          name: raw.organizer.emailAddress.name ?? undefined,
        }
      : undefined,
    attendees: raw.attendees?.map(attendee),
    myResponse: toResponse(raw.responseStatus?.response),
    meetingUrl,
    conference: conferenceFrom(raw, meetingUrl),
    timeZone: raw.start?.timeZone ?? null,
    updatedAt: raw.lastModifiedDateTime ?? undefined,
  };
}

const MEETING_PROVIDER_NAMES: Record<string, string> = {
  teamsForBusiness: "Microsoft Teams",
  skypeForBusiness: "Skype for Business",
  skypeForConsumer: "Skype",
};

function conferenceFrom(raw: GraphEvent, meetingUrl: string | undefined) {
  const meeting = raw.onlineMeeting;
  const pin = meeting?.conferenceId ?? undefined;
  const listed = (meeting?.phones ?? []).map((phone) => ({
    number: phone.number ?? "",
    label: phone.type ?? undefined,
    pin,
  }));
  const phones = listed.length
    ? listed
    : [
        ...(meeting?.tollNumber ? [{ number: meeting.tollNumber, label: "Toll", pin }] : []),
        ...(meeting?.tollFreeNumbers ?? []).map((number) => ({
          number,
          label: "Toll-free",
          pin,
        })),
      ];
  return compactConference({
    name: MEETING_PROVIDER_NAMES[raw.onlineMeetingProvider ?? ""] ?? conferenceName(meetingUrl),
    phones,
  });
}

function toGraphBody(draft: EventDraft | EventPatch): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const zone = draft.timeZone ?? "UTC";
  if (draft.title !== undefined) body.subject = draft.title;
  if (draft.description !== undefined) {
    body.body = { contentType: "text", content: draft.description };
  }
  if (draft.location !== undefined) {
    body.location = { displayName: draft.location };
  }
  if (draft.start !== undefined) {
    body.start = { dateTime: draft.start, timeZone: zone };
  }
  if (draft.end !== undefined) {
    body.end = { dateTime: draft.end, timeZone: zone };
  }
  if (draft.allDay !== undefined) body.isAllDay = draft.allDay;
  if (draft.attendees !== undefined) {
    body.attendees = draft.attendees.map((email) => ({
      emailAddress: { address: email },
      type: "required",
    }));
  }
  return body;
}

async function listCalendars(accessToken: string): Promise<ProviderCalendar[]> {
  const data: { value?: GraphCalendar[] } = await getGraphClient(accessToken)
    .api("/me/calendars")
    .top(100)
    .get();

  return (data.value ?? [])
    .filter((item) => Boolean(item.id))
    .map((item) => ({
      id: String(item.id),
      name: item.name || String(item.id),
      description: null,
      color: item.hexColor || null,
      timeZone: null,
      primary: item.isDefaultCalendar === true,
      readOnly: item.canEdit === false,
    }));
}

async function listEvents(accessToken: string, opts: ListEventsOptions): Promise<EventsResponse> {
  const client = getGraphClient(accessToken);
  const calendars = await listCalendars(accessToken);
  const wanted = opts.calendarIds
    ? calendars.filter((c) => opts.calendarIds?.includes(c.id))
    : calendars;

  const pages = await Promise.all(
    wanted.map(async (cal) => {
      let request = client
        .api(`/me/calendars/${cal.id}/calendarView`)
        .query({ startDateTime: opts.timeMin, endDateTime: opts.timeMax })
        .top(Math.min(opts.max ?? LIST_PAGE_SIZE, LIST_PAGE_SIZE))
        .orderby("start/dateTime");
      if (opts.query) request = request.search(`"${opts.query}"`);
      if (opts.fields === "times") request = request.select(TIMES_SELECT);

      const items: GraphEvent[] = [];
      let data: ListPage = await request.get();
      for (let page = 1; ; page += 1) {
        items.push(...(data.value ?? []));
        const next = data["@odata.nextLink"];
        if (!next || page >= LIST_PAGES || (opts.max !== undefined && items.length >= opts.max)) {
          break;
        }
        // oxlint-disable-next-line eslint/no-await-in-loop -- each page needs the previous page's link
        data = await client.api(next).get();
      }
      return items.slice(0, opts.max).map((raw) => toEvent(raw, cal.id, cal.name));
    }),
  );

  return { events: pages.flat() };
}

async function getEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<CalendarEvent> {
  const raw: GraphEvent = await getGraphClient(accessToken)
    .api(`/me/calendars/${calendarId}/events/${eventId}`)
    .get();
  return toEvent(raw, calendarId);
}

async function createEvent(
  accessToken: string,
  draft: EventDraft,
): Promise<{ id: string; calendarId: string }> {
  const path = draft.calendarId ? `/me/calendars/${draft.calendarId}/events` : "/me/events";

  const body = toGraphBody(draft);
  if (draft.addMeeting) {
    body.isOnlineMeeting = true;
    body.onlineMeetingProvider = "teamsForBusiness";
  }

  const created: GraphEvent = await getGraphClient(accessToken).api(path).post(body);
  return { id: created.id ?? "", calendarId: draft.calendarId ?? "" };
}

async function updateEvent(
  accessToken: string,
  _calendarId: string,
  eventId: string,
  patch: EventPatch,
): Promise<void> {
  await getGraphClient(accessToken).api(`/me/events/${eventId}`).patch(toGraphBody(patch));
}

async function deleteEvent(
  accessToken: string,
  _calendarId: string,
  eventId: string,
): Promise<void> {
  await getGraphClient(accessToken).api(`/me/events/${eventId}`).delete();
}

const RESPOND_PATH: Record<AttendeeResponse, string | null> = {
  accepted: "accept",
  declined: "decline",
  tentative: "tentativelyAccept",
  needsAction: null,
};

async function respondToEvent(
  accessToken: string,
  _calendarId: string,
  eventId: string,
  response: AttendeeResponse,
): Promise<void> {
  const action = RESPOND_PATH[response];
  if (!action) throw new Error("Outlook cannot reset an invite response");

  await getGraphClient(accessToken)
    .api(`/me/events/${eventId}/${action}`)
    .post({ sendResponse: true });
}
