import type { CalendarEvent } from "@/types/calendar";

function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  };
  try {
    return new Intl.DateTimeFormat("en-CA", { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat("en-CA", { ...options, timeZone: "UTC" });
  }
}

function shiftDay(day: string, by: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + by);
  return date.toISOString().slice(0, 10);
}

function eventDays(
  event: CalendarEvent,
  format: Intl.DateTimeFormat,
): { first: string; last: string } | null {
  if (event.allDay) {
    const first = event.start.slice(0, 10);
    const last = shiftDay(event.end.slice(0, 10), -1);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(first)) return null;
    return { first, last: last < first ? first : last };
  }
  const start = new Date(event.start);
  const end = new Date(event.end);
  if (Number.isNaN(start.getTime())) return null;
  const first = format.format(start);
  const last =
    Number.isNaN(end.getTime()) || end <= start
      ? first
      : format.format(new Date(end.getTime() - 1));
  return { first, last };
}

export function countEventDays(
  events: CalendarEvent[],
  timeZone: string,
  timeMin: string,
  timeMax: string,
): Record<string, number> {
  const format = dayFormatter(timeZone);
  const from = format.format(new Date(timeMin));
  const to = format.format(new Date(timeMax));
  const counts: Record<string, number> = {};
  for (const event of events) {
    const span = eventDays(event, format);
    if (!span) continue;
    for (
      let day = span.first < from ? from : span.first;
      day <= span.last && day < to;
      day = shiftDay(day, 1)
    ) {
      counts[day] = (counts[day] ?? 0) + 1;
    }
  }
  return counts;
}
