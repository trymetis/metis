"use client";

import { startOfHour } from "date-fns";
import { useEffect, useMemo } from "react";

import { navigateDate } from "@/calendar/layout";
import { type ChordBindings, isTypingTarget, useChord } from "@/hooks/use-chord";

import { useCalendar } from "./calendar-context";

export const CALENDAR_CHORD_PREFIX = "c";

export const CALENDAR_UNCHORDED: [string[], string][] = [
  [["j", "n"], "Next period"],
  [["k", "p"], "Previous period"],
];

export function useCalendarShortcuts({ onToggleAgent }: { onToggleAgent?: () => void }) {
  const { view, setView, date, setDate, setDraft, refresh } = useCalendar();

  const bindings = useMemo<ChordBindings>(
    () => ({
      d: { label: "Day", run: () => setView("day") },
      w: { label: "Week", run: () => setView("week") },
      m: { label: "Month", run: () => setView("month") },
      y: { label: "Year", run: () => setView("year") },
      s: { label: "Schedule", run: () => setView("schedule") },
      t: { label: "Today", run: () => setDate(new Date()) },
      n: {
        label: "New event",
        run: () => {
          const start = startOfHour(new Date(Date.now() + 3600_000));
          setDraft({
            start,
            end: new Date(start.getTime() + 3600_000),
            allDay: false,
          });
        },
      },
      r: { label: "Refresh", run: () => void refresh() },
      ...(onToggleAgent ? { a: { label: "Agent", run: onToggleAgent } } : {}),
    }),
    [setView, setDate, setDraft, refresh, onToggleAgent],
  );

  const chord = useChord({ prefix: CALENDAR_CHORD_PREFIX, bindings });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

      if (e.key === "j" || e.key === "n") {
        e.preventDefault();
        setDate(navigateDate(date, view, "next"));
      } else if (e.key === "k" || e.key === "p") {
        e.preventDefault();
        setDate(navigateDate(date, view, "previous"));
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, date, setDate]);

  return { ...chord, bindings };
}
