export const WRITABLE_ATTENDEE_RESPONSES = ["accepted", "declined", "tentative"] as const;
export type WritableAttendeeResponse = (typeof WRITABLE_ATTENDEE_RESPONSES)[number];

export const ATTENDEE_RESPONSES = [...WRITABLE_ATTENDEE_RESPONSES, "needsAction"] as const;
export type AttendeeResponse = (typeof ATTENDEE_RESPONSES)[number];

export const EVENT_STATUSES = ["confirmed", "tentative", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export interface EventAttendee {
  email: string;
  name?: string;
  response?: AttendeeResponse;
  optional?: boolean;
  organizer?: boolean;
  self?: boolean;
}

export interface ConferencePhone {
  number: string;
  label?: string;
  pin?: string;
}

export interface EventConference {
  name?: string;
  meetingId?: string;
  passcode?: string;
  phones?: ConferencePhone[];
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  calendarName?: string;
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay: boolean;
  status?: EventStatus;
  recurring?: boolean;
  organizer?: EventAttendee;
  attendees?: EventAttendee[];
  myResponse?: AttendeeResponse;
  meetingUrl?: string;
  conference?: EventConference;
  timeZone?: string | null;
  updatedAt?: string;
  accountId?: string;
  accountSlug?: string;
  accountEmail?: string;
}

export interface CalendarSourceError {
  accountId: string;
  accountEmail: string;
  error: string;
}

export interface EventsResponse {
  events: CalendarEvent[];
  calendarErrors?: CalendarSourceError[];
}

export interface EventDraft {
  calendarId?: string;
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay?: boolean;
  attendees?: string[];
  timeZone?: string;
  addMeeting?: boolean;
}

export interface EventPatch {
  title?: string;
  description?: string;
  location?: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  attendees?: string[];
  timeZone?: string;
}

export interface ListEventsOptions {
  calendarIds?: string[];
  timeMin: string;
  timeMax: string;
  max?: number;
  query?: string;
  fields?: "times";
}
