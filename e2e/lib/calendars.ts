export const CALENDAR_COLLECTIONS = [
  { slug: "work", name: "Work" },
  { slug: "personal", name: "Personal" },
  { slug: "edge", name: "Edge cases" },
  { slug: "bulk", name: "Bulk" },
] as const;

export type CalendarCollection = (typeof CALENDAR_COLLECTIONS)[number]["slug"];

export function calendarCollectionUrl(
  baseUrl: string,
  user: string,
  slug: CalendarCollection,
): string {
  return `${baseUrl.replace(/\/+$/, "")}/${user}/${slug}/`;
}
