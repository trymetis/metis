import { DOMAIN, PEOPLE } from "../lib/cast";
import type { EventSpec } from "./ics";

const { ana, raj, tomas, priya, sam, lena, kenji, layla } = PEOPLE;

function uid(name: string): string {
  return `${name}@${DOMAIN}`;
}

export interface SeededEvent {
  name: string;
  events: EventSpec[];
}

export const WORK_EVENTS: SeededEvent[] = [
  {
    name: "daily-standup",
    events: [
      {
        uid: uid("daily-standup"),
        summary: "Daily standup",
        start: "2026-10-05T09:00:00",
        end: "2026-10-05T09:15:00",
        rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=40",
        location: "https://linkroom.app/r/standup",
      },
    ],
  },
  {
    name: "design-review",
    events: [
      {
        uid: uid("design-review"),
        summary: "Design review",
        start: "2026-10-08T15:00:00",
        end: "2026-10-08T16:00:00",
        location: "Studio 2",
      },
    ],
  },
  {
    name: "weekly-1on1",
    events: [
      {
        uid: uid("ana-raj-1on1"),
        summary: "Weekly 1:1 Ana / Raj",
        start: "2026-01-06T10:00:00",
        end: "2026-01-06T10:30:00",
        timeZone: "Europe/Lisbon",
        rrule: "FREQ=WEEKLY;BYDAY=TU",
        exdates: ["2026-10-13T10:00:00"],
        location: "https://linkroom.app/r/ana-raj",
        organizer: raj,
        attendees: [[ana, "ACCEPTED"]],
      },
      {
        uid: uid("ana-raj-1on1"),
        summary: "Weekly 1:1 Ana / Raj",
        recurrenceId: "2026-10-06T10:00:00",
        start: "2026-10-07T11:00:00",
        end: "2026-10-07T11:30:00",
        timeZone: "Europe/Lisbon",
        location: "https://linkroom.app/r/ana-raj",
        organizer: raj,
        attendees: [[ana, "ACCEPTED"]],
        sequence: 1,
      },
    ],
  },
  {
    name: "monthly-review",
    events: [
      {
        uid: uid("monthly-review"),
        summary: "Monthly studio review",
        start: "2026-01-05T14:00:00",
        end: "2026-01-05T15:00:00",
        rrule: "FREQ=MONTHLY;BYDAY=1MO",
        location: "Studio 1",
        organizer: sam,
        attendees: [
          [ana, "ACCEPTED"],
          [raj, "ACCEPTED"],
          [tomas, "ACCEPTED"],
          [priya, "ACCEPTED"],
        ],
      },
    ],
  },
  {
    name: "aozora-kickoff",
    events: [
      {
        uid: uid("aozora-kickoff"),
        summary: "Aozora rebrand kickoff",
        start: "2026-10-05T10:00:00",
        end: "2026-10-05T11:30:00",
        location: "https://linkroom.app/r/aozora-kickoff",
        description: "Agenda: goals, timeline, wordmark directions, packaging constraints.",
        organizer: raj,
        attendees: [
          [ana, "ACCEPTED"],
          [tomas, "ACCEPTED"],
          [kenji, "ACCEPTED"],
        ],
      },
    ],
  },
  {
    name: "aozora-logo-review",
    events: [
      {
        uid: uid("aozora-logo-review"),
        summary: "Aozora logo review (internal)",
        start: "2026-10-01T14:00:00",
        end: "2026-10-01T15:00:00",
        location: "Studio 2",
        organizer: raj,
        attendees: [
          [ana, "ACCEPTED"],
          [tomas, "TENTATIVE"],
        ],
        sequence: 1,
      },
    ],
  },
  {
    name: "kaltwasser-maintenance",
    events: [
      {
        uid: uid("kaltwasser-maintenance"),
        summary: "Kaltwasser website maintenance",
        start: "2026-10-07T14:00:00",
        end: "2026-10-07T14:45:00",
        timeZone: "Europe/Berlin",
        location: "https://linkroom.app/r/kaltwasser",
        organizer: lena,
        attendees: [
          [ana, "TENTATIVE"],
          [tomas, "ACCEPTED"],
        ],
      },
    ],
  },
  {
    name: "menu-proofs",
    events: [
      {
        uid: uid("menu-proofs"),
        summary: "Arabic menu proofs",
        start: "2026-10-07T15:00:00",
        end: "2026-10-07T15:30:00",
        organizer: priya,
        attendees: [[ana, "ACCEPTED"]],
      },
    ],
  },
  {
    name: "saffron-call",
    events: [
      {
        uid: uid("saffron-call"),
        summary: "Saffron & Sage menu sign-off",
        start: "2026-10-07T15:30:00",
        end: "2026-10-07T16:00:00",
        location: "https://linkroom.app/r/saffron",
        organizer: ana,
        attendees: [
          [layla, "ACCEPTED"],
          [priya, "ACCEPTED"],
        ],
      },
    ],
  },
  {
    name: "packaging-workshop",
    events: [
      {
        uid: uid("packaging-workshop"),
        summary: "Workshop: packaging prototypes",
        start: "2026-10-08T10:00:00",
        end: "2026-10-08T13:00:00",
        location: "Studio 2",
        organizer: tomas,
        attendees: [
          [ana, "ACCEPTED"],
          [raj, "DECLINED"],
          [priya, "NEEDS-ACTION"],
        ],
      },
    ],
  },
  {
    name: "print-vendor",
    events: [
      {
        uid: uid("print-vendor"),
        summary: "Print vendor call (Pune)",
        start: "2026-10-08T18:30:00",
        end: "2026-10-08T19:00:00",
        timeZone: "Asia/Kolkata",
        location: "https://linkroom.app/r/print-vendor",
        organizer: ana,
        attendees: [[priya, "ACCEPTED"]],
      },
    ],
  },
  {
    name: "kenji-sync",
    events: [
      {
        uid: uid("kenji-sync"),
        summary: "Kenji / Ana sync",
        start: "2026-10-09T17:00:00",
        end: "2026-10-09T17:30:00",
        timeZone: "Asia/Tokyo",
        location: "https://linkroom.app/r/aozora",
        organizer: kenji,
        attendees: [[ana, "ACCEPTED"]],
      },
    ],
  },
  {
    name: "type-webinar",
    events: [
      {
        uid: uid("type-webinar"),
        summary: "Webinar: variable fonts for packaging",
        start: "2026-10-09T11:00:00",
        end: "2026-10-09T12:00:00",
        timeZone: "America/New_York",
        location: "Online",
      },
    ],
  },
  {
    name: "studio-drinks",
    events: [
      {
        uid: uid("studio-drinks"),
        summary: "Studio drinks",
        start: "2026-10-09T17:30:00",
        end: "2026-10-09T19:00:00",
        location: "Taberna da Rua",
        status: "TENTATIVE",
        organizer: sam,
        attendees: [
          [ana, "TENTATIVE"],
          [raj, "ACCEPTED"],
          [tomas, "ACCEPTED"],
          [priya, "DECLINED"],
        ],
      },
    ],
  },
  {
    name: "design-week",
    events: [
      {
        uid: uid("lisbon-design-week"),
        summary: "Lisbon Design Week",
        start: "2026-10-20",
        end: "2026-10-23",
        allDay: true,
        location: "Lisbon",
      },
    ],
  },
  {
    name: "kaltwasser-checkin",
    events: [
      {
        uid: uid("kaltwasser-checkin"),
        summary: "Kaltwasser check-in",
        start: "2026-04-28T14:00:00",
        end: "2026-04-28T14:30:00",
        organizer: ana,
        attendees: [
          [lena, "DECLINED"],
          [tomas, "ACCEPTED"],
        ],
        status: "CANCELLED",
        sequence: 1,
      },
    ],
  },
  {
    name: "offsite-2026",
    events: [
      {
        uid: uid("offsite-2026"),
        summary: "Offsite in Sintra",
        start: "2026-03-23",
        end: "2026-03-26",
        allDay: true,
        location: "Quinta da Ribeira, Sintra",
      },
    ],
  },
  {
    name: "kestrel-shoot",
    events: [
      {
        uid: uid("kestrel-shoot"),
        summary: "Kestrel spring shoot",
        start: "2025-03-18",
        end: "2025-03-22",
        allDay: true,
        location: "Porto",
      },
    ],
  },
  {
    name: "year-in-review",
    events: [
      {
        uid: uid("year-in-review"),
        summary: "Year in review",
        start: "2025-12-19T15:00:00",
        end: "2025-12-19T17:00:00",
        location: "Studio 1",
      },
    ],
  },
];

export const PERSONAL_EVENTS: SeededEvent[] = [
  {
    name: "holiday-republic-day",
    events: [
      {
        uid: uid("holiday-2026-10-05"),
        summary: "Implantação da República (holiday)",
        start: "2026-10-05",
        end: "2026-10-06",
        allDay: true,
      },
    ],
  },
  {
    name: "dentist",
    events: [
      {
        uid: uid("dentist"),
        summary: "Dentist",
        start: "2026-10-07T18:00:00",
        end: "2026-10-07T18:45:00",
        timeZone: "Europe/Lisbon",
        location: "Clínica Sorriso, Avenida da Liberdade 120",
        private: true,
      },
    ],
  },
  {
    name: "tokyo-trip",
    events: [
      {
        uid: uid("tokyo-trip"),
        summary: "Tokyo trip",
        start: "2026-11-09",
        end: "2026-11-15",
        allDay: true,
        description: "Northbeam Air NB7Q4K. Aozora studio visit on November 11.",
      },
    ],
  },
  {
    name: "summer-holiday",
    events: [
      {
        uid: uid("summer-holiday-2026"),
        summary: "Holiday",
        start: "2026-08-24",
        end: "2026-08-29",
        allDay: true,
      },
    ],
  },
];
