"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type CalendarViewKey,
  eventStart,
  isCalendarView,
  viewerTimeZone,
  viewRange,
} from "@/calendar/layout";
import {
  type CalendarHandoff,
  listenCalendarHandoffs,
  takeCalendarHandoff,
} from "@/calendar/pending-open";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useStoredItem, writeStoredItem } from "@/hooks/use-stored-item";
import { useWorkspacePath, useWorkspaceScope } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";
import { refreshQueries, refreshQuery } from "@/lib/query-client";
import type { CalendarSourceErrorDto, SessionCalendar } from "@/server/schema";
import type { CalendarEvent } from "@/types/calendar";

export interface DraftSlot {
  start: Date;
  end: Date;
  allDay: boolean;
  attendees?: string[];
}

interface CalendarContextValue {
  view: CalendarViewKey;
  setView: (view: CalendarViewKey) => void;
  date: Date;
  setDate: (date: Date) => void;
  range: { start: Date; end: Date };
  timeZone: string;

  events: CalendarEvent[];
  calendars: SessionCalendar[];
  errors: CalendarSourceErrorDto[];
  loading: boolean;

  hidden: Set<string>;
  toggleCalendar: (calendarId: string) => void;

  selected: CalendarEvent | null;
  setSelected: (event: CalendarEvent | null) => void;
  draft: DraftSlot | null;
  setDraft: (slot: DraftSlot | null) => void;
  editing: CalendarEvent | null;
  setEditing: (event: CalendarEvent | null) => void;

  refresh: () => Promise<void>;
}

const CalendarContext = createContext<CalendarContextValue | null>(null);

export function useCalendar(): CalendarContextValue {
  const ctx = use(CalendarContext);
  if (!ctx) {
    throw new Error("useCalendar must be used inside CalendarProvider");
  }
  return ctx;
}

const NO_CALENDARS: SessionCalendar[] = [];
const YEAR_EVENT_MAX = 250;

function hiddenKey(workspaceSlug: string, calendarSlug: string): string {
  return `metis:calendar:hidden:${workspaceSlug}:${calendarSlug}`;
}

function parseHidden(raw: string | null): Set<string> {
  try {
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id) => typeof id === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

export function CalendarProvider({ children }: { children: ReactNode }) {
  const scope = useWorkspaceScope();
  const { calendarSlug } = useWorkspacePath();
  const slug = calendarSlug ?? "all";

  const viewKey = `metis:calendar:view:${slug}`;
  const storedView = useStoredItem(viewKey);
  const mobile = useIsMobile();
  const view: CalendarViewKey =
    storedView && isCalendarView(storedView) ? storedView : mobile ? "schedule" : "week";
  const setView = useCallback((next: CalendarViewKey) => writeStoredItem(viewKey, next), [viewKey]);
  const [date, setDate] = useState<Date>(() => new Date());
  const calendarsQuery = useQuery(
    rpc.calendarEvents.calendars.queryOptions({ input: { ...scope, calendarSlug: slug } }),
  );
  const calendars: SessionCalendar[] = calendarsQuery.data?.calendars ?? NO_CALENDARS;
  const hiddenStorageKey = hiddenKey(scope.workspaceSlug, slug);
  const storedHidden = useStoredItem(hiddenStorageKey);
  const hidden = useMemo(() => parseHidden(storedHidden), [storedHidden]);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [draft, setDraft] = useState<DraftSlot | null>(null);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);

  const timeZone = useMemo(() => viewerTimeZone(), []);
  const range = useMemo(() => viewRange(view, date), [view, date]);

  const toggleCalendar = useCallback(
    (calendarId: string) => {
      const next = new Set(hidden);
      if (next.has(calendarId)) next.delete(calendarId);
      else next.add(calendarId);
      writeStoredItem(hiddenStorageKey, JSON.stringify([...next]));
    },
    [hidden, hiddenStorageKey],
  );

  const input = useMemo(
    () => ({
      ...scope,
      calendarSlug: slug,
      timeMin: range.start.toISOString(),
      timeMax: range.end.toISOString(),
      ...(view === "year" ? { max: YEAR_EVENT_MAX } : {}),
    }),
    [scope, slug, range.start, range.end, view],
  );

  const eventsOptions = useMemo(
    () => rpc.calendarEvents.list.queryOptions({ input, placeholderData: keepPreviousData }),
    [input],
  );
  const eventsQuery = useQuery(eventsOptions);
  const eventsKey = eventsOptions.queryKey;
  const eventsData = eventsQuery.isError ? undefined : eventsQuery.data;
  const events: CalendarEvent[] = useMemo(() => eventsData?.events ?? [], [eventsData]);
  const errors: CalendarSourceErrorDto[] = useMemo(
    () => eventsData?.calendarErrors ?? [],
    [eventsData],
  );
  const loading = eventsQuery.isFetching;
  const load = useCallback(async () => {
    await Promise.all([refreshQuery(eventsKey), refreshQueries(rpc.calendarEvents.days.key())]);
  }, [eventsKey]);

  const [handoff, setHandoff] = useState<CalendarHandoff | null>(null);

  useEffect(() => {
    const apply = (taken: CalendarHandoff) => {
      if (taken.kind === "event") {
        setDate(eventStart(taken.event));
        if (taken.edit) setEditing(taken.event);
        else setSelected(taken.event);
        return;
      }
      if (taken.kind === "draft") {
        const start = new Date();
        start.setMinutes(0, 0, 0);
        start.setHours(start.getHours() + 1);
        setDraft({
          start,
          end: new Date(start.getTime() + 3_600_000),
          allDay: false,
          attendees: taken.attendees,
        });
        return;
      }
      setHandoff(taken);
    };
    const taken = takeCalendarHandoff(slug);
    if (taken) apply(taken);
    return listenCalendarHandoffs(slug, apply);
  }, [slug]);

  const appliedHandoff = useRef<CalendarHandoff | null>(null);

  useEffect(() => {
    if (!handoff || handoff === appliedHandoff.current || calendars.length === 0) return;
    if (handoff.kind !== "only" && handoff.kind !== "hide") return;
    appliedHandoff.current = handoff;
    const target = handoff.calendarId;
    const next =
      handoff.kind === "only"
        ? new Set(calendars.map((c) => c.id).filter((id) => id !== target))
        : new Set([...hidden, target]);
    writeStoredItem(hiddenStorageKey, JSON.stringify([...next]));
  }, [handoff, calendars, hidden, hiddenStorageKey]);

  const visible = useMemo(
    () => events.filter((event) => !hidden.has(event.calendarId)),
    [events, hidden],
  );

  const value = useMemo<CalendarContextValue>(
    () => ({
      view,
      setView,
      date,
      setDate,
      range,
      timeZone,
      events: visible,
      calendars,
      errors,
      loading,
      hidden,
      toggleCalendar,
      selected,
      setSelected,
      draft,
      setDraft,
      editing,
      setEditing,
      refresh: load,
    }),
    [
      view,
      setView,
      date,
      range,
      timeZone,
      visible,
      calendars,
      errors,
      loading,
      hidden,
      toggleCalendar,
      selected,
      draft,
      editing,
      load,
    ],
  );

  return <CalendarContext value={value}>{children}</CalendarContext>;
}
