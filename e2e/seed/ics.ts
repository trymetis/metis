import type { Person } from "../lib/cast";

export type PartStat = "ACCEPTED" | "DECLINED" | "TENTATIVE" | "NEEDS-ACTION";

export interface EventSpec {
  uid: string;
  summary: string;
  start: string;
  end?: string;
  allDay?: boolean;
  timeZone?: string;
  rrule?: string;
  exdates?: string[];
  recurrenceId?: string;
  location?: string;
  description?: string;
  organizer?: Person;
  attendees?: [Person, PartStat][];
  status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
  sequence?: number;
  private?: boolean;
  stamp?: string;
}

function compact(value: string): string {
  return value.replace(/[-:]/g, "");
}

function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function when(name: string, value: string, spec: EventSpec): string {
  if (spec.allDay) return `${name};VALUE=DATE:${compact(value)}`;
  if (spec.timeZone) return `${name};TZID=${spec.timeZone}:${compact(value)}`;
  return `${name}:${compact(value)}Z`;
}

function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  for (const char of line) {
    if (Buffer.byteLength(current + char, "utf8") > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = "";
    }
    current += char;
  }
  out.push(current);
  return out.join("\r\n ");
}

function person(role: string, p: Person, params = ""): string {
  return `${role};CN="${p.name}"${params}:mailto:${p.email}`;
}

export function vevent(spec: EventSpec): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${spec.uid}`,
    `DTSTAMP:${compact(spec.stamp ?? "2026-09-01T08:00:00")}Z`,
    when("DTSTART", spec.start, spec),
    ...(spec.end ? [when("DTEND", spec.end, spec)] : []),
    ...(spec.recurrenceId ? [when("RECURRENCE-ID", spec.recurrenceId, spec)] : []),
    ...(spec.rrule ? [`RRULE:${spec.rrule}`] : []),
    ...(spec.exdates ?? []).map((d) => when("EXDATE", d, spec)),
    `SUMMARY:${escapeText(spec.summary)}`,
    ...(spec.location ? [`LOCATION:${escapeText(spec.location)}`] : []),
    ...(spec.description ? [`DESCRIPTION:${escapeText(spec.description)}`] : []),
    ...(spec.organizer ? [person("ORGANIZER", spec.organizer)] : []),
    ...(spec.attendees ?? []).map(([p, stat]) =>
      person("ATTENDEE", p, `;ROLE=REQ-PARTICIPANT;PARTSTAT=${stat}`),
    ),
    ...(spec.status ? [`STATUS:${spec.status}`] : []),
    ...(spec.sequence !== undefined ? [`SEQUENCE:${spec.sequence}`] : []),
    ...(spec.private ? ["CLASS:PRIVATE"] : []),
    "END:VEVENT",
  ];
}

export function vcalendar(events: EventSpec[], method?: "REQUEST" | "CANCEL"): string {
  return `${[
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Fernhill Studio//Calendar//EN",
    "CALSCALE:GREGORIAN",
    ...(method ? [`METHOD:${method}`] : []),
    ...events.flatMap(vevent),
    "END:VCALENDAR",
  ]
    .map(fold)
    .join("\r\n")}\r\n`;
}
