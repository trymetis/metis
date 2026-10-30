import { CRLF } from "./mime";
import { words } from "./rng";

const DOMAIN = "edge.test";

export interface CalendarCase {
  name: string;
  ics: () => string;
}

function calendar(components: string[], extra: string[] = []): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Metis E2E Edge//EN",
    ...extra,
    ...components,
    "END:VCALENDAR",
  ].join(CRLF);
}

function event(name: string, fields: string[]): string {
  return [
    "BEGIN:VEVENT",
    `UID:edge-${name}@${DOMAIN}`,
    "DTSTAMP:20260910T080000Z",
    ...fields,
    "END:VEVENT",
  ].join(CRLF);
}

function one(name: string, fields: string[]): CalendarCase {
  return { name, ics: () => calendar([event(name, fields)]) };
}

function folded(line: string): string {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 74) out.push(line.slice(i, i + 74));
  return out.join(`${CRLF} `);
}

export const CALENDAR_CASES: CalendarCase[] = [
  one("zero-duration", [
    "DTSTART:20261001T100000Z",
    "DTEND:20261001T100000Z",
    "SUMMARY:Zero duration",
  ]),
  one("end-before-start", [
    "DTSTART:20261001T120000Z",
    "DTEND:20261001T080000Z",
    "SUMMARY:Ends before it starts",
  ]),
  one("no-end-no-duration", ["DTSTART:20261002T090000Z", "SUMMARY:No end, no duration"]),
  one("negative-duration", [
    "DTSTART:20261002T090000Z",
    "DURATION:-PT1H",
    "SUMMARY:Negative duration",
  ]),
  one("all-day-10-years", [
    "DTSTART;VALUE=DATE:20260101",
    "DTEND;VALUE=DATE:20360101",
    "SUMMARY:Ten year all-day event",
  ]),
  one("all-day-single", ["DTSTART;VALUE=DATE:20261003", "SUMMARY:All day, no end"]),
  one("no-summary", ["DTSTART:20261003T090000Z", "DTEND:20261003T100000Z"]),
  one("empty-summary", ["DTSTART:20261003T110000Z", "DTEND:20261003T120000Z", "SUMMARY:"]),
  one("summary-2000-chars", [
    "DTSTART:20261004T090000Z",
    "DTEND:20261004T100000Z",
    folded(`SUMMARY:${"S".repeat(2000)}`),
  ]),
  one("description-1mb", [
    "DTSTART:20261004T110000Z",
    "DTEND:20261004T120000Z",
    "SUMMARY:Huge description",
    folded(`DESCRIPTION:${words(140_000, 7)}`),
  ]),
  one("unicode-torture", [
    "DTSTART:20261005T090000Z",
    "DTEND:20261005T100000Z",
    "SUMMARY:\u{202E}gnp.exe \u{1F469}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466} \u{645}\u{631}\u{62D}\u{628}\u{627} Z\u{337}\u{322}\u{31B}a\u{336}l\u{337}g\u{335}o\u{200B}",
    "LOCATION:\u{65E5}\u{672C}\u{8A9E}\u{306E}\u{5834}\u{6240} \u{1F5FC}",
  ]),
  one("attendees-500", [
    "DTSTART:20261005T110000Z",
    "DTEND:20261005T120000Z",
    "SUMMARY:Five hundred attendees",
    `ORGANIZER;CN=Organizer:mailto:org@${DOMAIN}`,
    ...Array.from(
      { length: 500 },
      (_, i) => `ATTENDEE;CN=Guest ${i};PARTSTAT=NEEDS-ACTION:mailto:g${i}@${DOMAIN}`,
    ),
  ]),
  one("unknown-tzid", [
    "DTSTART;TZID=Mars/Olympus_Mons:20261006T090000",
    "DTEND;TZID=Mars/Olympus_Mons:20261006T100000",
    "SUMMARY:Unknown time zone",
  ]),
  one("floating-time", [
    "DTSTART:20261006T110000",
    "DTEND:20261006T120000",
    "SUMMARY:Floating local time",
  ]),
  one("dst-gap", [
    "DTSTART;TZID=America/New_York:20260308T023000",
    "DTEND;TZID=America/New_York:20260308T033000",
    "SUMMARY:Starts in the DST gap",
  ]),
  one("year-1900", ["DTSTART:19000101T000000Z", "DTEND:19000101T010000Z", "SUMMARY:Year 1900"]),
  one("year-2199", ["DTSTART:21991231T230000Z", "DTEND:21991231T235900Z", "SUMMARY:Year 2199"]),
  one("rrule-daily-forever", [
    "DTSTART:20261007T090000Z",
    "DTEND:20261007T091500Z",
    "RRULE:FREQ=DAILY",
    "SUMMARY:Daily forever",
  ]),
  one("rrule-exdate-heavy", [
    "DTSTART:20261008T090000Z",
    "DTEND:20261008T093000Z",
    "RRULE:FREQ=DAILY;COUNT=400",
    "SUMMARY:Daily with 300 exceptions",
    ...Array.from(
      { length: 300 },
      (_, i) =>
        `EXDATE:${new Date(Date.UTC(2026, 9, 8 + i, 9))
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\.\d{3}/, "")}`,
    ),
  ]),
  one("rrule-invalid", [
    "DTSTART:20261009T090000Z",
    "DTEND:20261009T100000Z",
    "RRULE:FREQ=FORTNIGHTLY;BYDAY=XX;COUNT=-3",
    "SUMMARY:Invalid RRULE",
  ]),
  {
    name: "vtodo-only",
    ics: () =>
      calendar([
        [
          "BEGIN:VTODO",
          `UID:edge-vtodo@${DOMAIN}`,
          "DTSTAMP:20260910T080000Z",
          "SUMMARY:A task, not an event",
          "DUE:20261010T170000Z",
          "END:VTODO",
        ].join(CRLF),
      ]),
  },
  {
    name: "vjournal-only",
    ics: () =>
      calendar([
        [
          "BEGIN:VJOURNAL",
          `UID:edge-vjournal@${DOMAIN}`,
          "DTSTAMP:20260910T080000Z",
          "SUMMARY:A journal entry",
          "END:VJOURNAL",
        ].join(CRLF),
      ]),
  },
  {
    name: "overlap-50-same-slot",
    ics: () =>
      calendar(
        Array.from({ length: 50 }, (_, i) =>
          event(`overlap-${i}`, [
            "DTSTART:20261012T090000Z",
            "DTEND:20261012T100000Z",
            `SUMMARY:Overlap ${i}`,
          ]),
        ),
      ),
  },
  { name: "garbage", ics: () => "this is not an iCalendar object at all" },
];

export const CALENDAR_STRESS_CASES: CalendarCase[] = [
  one("rrule-secondly-forever", [
    "DTSTART:20261007T000000Z",
    "DURATION:PT1S",
    "RRULE:FREQ=SECONDLY",
    "SUMMARY:Every second forever",
  ]),
  one("rrule-minutely-forever", [
    "DTSTART:20261007T000000Z",
    "DURATION:PT1M",
    "RRULE:FREQ=MINUTELY",
    "SUMMARY:Every minute forever",
  ]),
];

export const CALENDAR_BULK_EVENTS = 300;

export function bulkEvent(i: number): string {
  const day = String((i % 28) + 1).padStart(2, "0");
  const hour = String(i % 24).padStart(2, "0");
  return calendar([
    event(`bulk-${i}`, [
      `DTSTART:202611${day}T${hour}0000Z`,
      "DURATION:PT45M",
      `SUMMARY:Bulk ${i} ${words(3, i)}`,
    ]),
  ]);
}
