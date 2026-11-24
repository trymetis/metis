"use client";

import { useCallback } from "react";

import { paletteMark } from "@/lib/palette";
import type { CalendarEvent } from "@/types/calendar";

import { useCalendar } from "./calendar-context";

export function calendarColor(calendarId: string, providerColor?: string | null): string {
  if (providerColor && /^#[0-9a-fA-F]{6}$/.test(providerColor)) {
    return providerColor;
  }
  return paletteMark(calendarId);
}

export function useEventColor(): (event: CalendarEvent) => string {
  const { calendars } = useCalendar();
  return useCallback(
    (event: CalendarEvent) => {
      const source = calendars.find(
        (c) => c.id === event.calendarId && c.accountId === event.accountId,
      );
      return calendarColor(event.calendarId, source?.color);
    },
    [calendars],
  );
}
