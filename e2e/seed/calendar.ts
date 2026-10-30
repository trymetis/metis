import { CALENDAR_COLLECTIONS, type CalendarCollection } from "../lib/calendars";
import { PERSONAL_EVENTS, type SeededEvent, WORK_EVENTS } from "./calendar-events";
import {
  bulkEvent,
  CALENDAR_BULK_EVENTS,
  CALENDAR_CASES,
  CALENDAR_STRESS_CASES,
} from "./edge/calendar-cases";
import { vcalendar } from "./ics";
import { edgeEnabled, reject } from "./report";

function collectionName(slug: CalendarCollection): string {
  return CALENDAR_COLLECTIONS.find((c) => c.slug === slug)?.name ?? slug;
}

export interface CaldavTarget {
  url: string;
  user: string;
  pass: string;
}

async function dav(
  target: CaldavTarget,
  method: string,
  path: string,
  body?: string,
  contentType = "application/xml; charset=utf-8",
): Promise<Response> {
  return fetch(`${target.url}${path}`, {
    method,
    headers: {
      authorization: `Basic ${btoa(`${target.user}:${target.pass}`)}`,
      "content-type": contentType,
      depth: "0",
    },
    body,
  });
}

async function ensureCollection(
  target: CaldavTarget,
  slug: string,
  displayName: string,
): Promise<string> {
  const collection = `/${target.user}/${slug}/`;
  const probe = await dav(target, "PROPFIND", collection);
  if (probe.status !== 404) return collection;
  const created = await dav(
    target,
    "MKCALENDAR",
    collection,
    `<?xml version="1.0" encoding="utf-8"?>
<C:mkcalendar xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:set><D:prop><D:displayname>${displayName}</D:displayname></D:prop></D:set>
</C:mkcalendar>`,
  );
  if (!created.ok) {
    throw new Error(`MKCALENDAR ${collection} -> ${created.status}`);
  }
  return collection;
}

async function putEvent(target: CaldavTarget, path: string, ics: string): Promise<void> {
  const res = await dav(target, "PUT", path, ics, "text/calendar; charset=utf-8");
  if (!res.ok) throw new Error(`PUT ${path} -> ${res.status} ${await res.text()}`);
}

export async function seedCalendar(target: CaldavTarget): Promise<void> {
  const home = `/${target.user}/`;
  const principal = await dav(target, "PROPFIND", home);
  if (principal.status >= 400) {
    throw new Error(`PROPFIND ${home} -> ${principal.status}`);
  }

  const collections: [CalendarCollection, SeededEvent[]][] = [
    ["work", WORK_EVENTS],
    ["personal", PERSONAL_EVENTS],
  ];
  for (const [slug, seeded] of collections) {
    const collection = await ensureCollection(target, slug, collectionName(slug));
    for (const event of seeded) {
      await putEvent(target, `${collection}${event.name}.ics`, vcalendar(event.events));
    }
    console.log(`[seed] put ${seeded.length} events into ${collection}`);
  }

  if (!edgeEnabled()) return;

  const edge = await ensureCollection(target, "edge", collectionName("edge"));
  let accepted = 0;
  for (const edgeCase of CALENDAR_CASES) {
    try {
      await putEvent(target, `${edge}${edgeCase.name}.ics`, edgeCase.ics());
      accepted++;
    } catch (err) {
      reject("caldav", edgeCase.name, err);
    }
  }
  console.log(`[seed] put ${accepted}/${CALENDAR_CASES.length} edge-case events into ${edge}`);

  const bulk = await ensureCollection(target, "bulk", collectionName("bulk"));
  for (let i = 0; i < CALENDAR_BULK_EVENTS; i++) {
    await putEvent(target, `${bulk}bulk-${i}.ics`, bulkEvent(i));
  }
  console.log(`[seed] put ${CALENDAR_BULK_EVENTS} events into ${bulk}`);
}

export async function seedStressCalendar(target: CaldavTarget): Promise<void> {
  if (!edgeEnabled()) return;
  const home = `/${target.user}/`;
  const principal = await dav(target, "PROPFIND", home);
  if (principal.status >= 400) {
    throw new Error(`PROPFIND ${home} -> ${principal.status}`);
  }
  const stress = await ensureCollection(target, "stress", "Stress");
  for (const stressCase of CALENDAR_STRESS_CASES) {
    try {
      await putEvent(target, `${stress}${stressCase.name}.ics`, stressCase.ics());
    } catch (err) {
      reject("caldav", stressCase.name, err);
    }
  }
  console.log(
    `[seed] put ${CALENDAR_STRESS_CASES.length} stress events into ${stress} (not connected to the app)`,
  );
}
