import type { CalendarProvider } from "@/connections/types";

export const CALENDAR_PROVIDER_LABELS: Record<CalendarProvider, string> = {
  google: "Google Calendar",
  microsoft: "Outlook Calendar",
  zoho: "Zoho Calendar",
  caldav: "CalDAV",
};

export interface NamedCalendar {
  provider: CalendarProvider;
  email: string;
  server: string | null;
}

function baseName(calendar: NamedCalendar): string {
  return calendar.server ?? `${CALENDAR_PROVIDER_LABELS[calendar.provider]} · ${calendar.email}`;
}

export function calendarName(calendar: NamedCalendar, all: readonly NamedCalendar[]): string {
  const base = baseName(calendar);
  if (calendar.server === null) return base;
  const clash = all.some(
    (other) =>
      other.server !== null && other.provider !== calendar.provider && baseName(other) === base,
  );
  return clash ? `${base} · ${CALENDAR_PROVIDER_LABELS[calendar.provider]}` : base;
}
