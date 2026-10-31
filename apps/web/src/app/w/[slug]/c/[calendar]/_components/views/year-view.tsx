"use client";

import { cn } from "@metis/ui/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format, isSameDay, isSameMonth, setMonth, startOfYear } from "date-fns";

import { monthCells } from "@/calendar/layout";
import { useNow } from "@/hooks/use-now";
import { useWorkspacePath, useWorkspaceScope } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";

import { useCalendar } from "../calendar-context";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const NO_DAYS: Record<string, number> = {};

const dayKey = (day: Date) => format(day, "yyyy-MM-dd");

function YearMonth({ month, counts }: { month: Date; counts: Record<string, number> }) {
  const { setDate, setView } = useCalendar();
  const cells = monthCells(month);
  const today = useNow();

  return (
    <section>
      <h2 className="mb-1.5 pl-1 text-[13px] font-medium text-foreground">
        {format(month, "MMMM")}
      </h2>

      <div className="grid grid-cols-7">
        {WEEKDAYS.map((label, i) => (
          <span
            // oxlint-disable-next-line react/no-array-index-key --weekday initials repeat (S…S)
            key={`${label}-${i}`}
            className="flex h-6 items-center justify-center text-[10px] text-faint"
          >
            {label}
          </span>
        ))}

        {cells.map((cell) => {
          const outside = !isSameMonth(cell.date, month);
          const isToday = isSameDay(cell.date, today);
          const count = outside ? 0 : (counts[dayKey(cell.date)] ?? 0);
          return (
            <button
              key={cell.date.toISOString()}
              type="button"
              aria-label={
                count > 0
                  ? `${format(cell.date, "MMMM d")}, ${count} ${count === 1 ? "event" : "events"}`
                  : undefined
              }
              onClick={() => {
                setDate(cell.date);
                setView("day");
              }}
              className={cn(
                "relative flex h-6 items-center justify-center rounded-full text-[11px] transition-colors",
                outside ? "text-faint/60" : "text-muted-foreground",
                count > 0 && !isToday && "font-medium text-foreground",
                !isToday && "hover:bg-hover",
                isToday && "bg-primary font-medium text-primary-foreground",
              )}
            >
              {cell.day}
              {count > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full",
                    isToday ? "bg-primary-foreground" : "bg-primary",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function YearView() {
  const { date, range, timeZone, calendars, hidden } = useCalendar();
  const scope = useWorkspaceScope();
  const calendarSlug = useWorkspacePath().calendarSlug ?? "all";
  const yearStart = startOfYear(date);
  const months = Array.from({ length: 12 }, (_, i) => setMonth(yearStart, i));
  const calendarIds =
    hidden.size > 0
      ? calendars.filter((c) => c.visible && !hidden.has(c.id)).map((c) => c.id)
      : undefined;
  const daysQuery = useQuery(
    rpc.calendarEvents.days.queryOptions({
      input: {
        ...scope,
        calendarSlug,
        timeMin: range.start.toISOString(),
        timeMax: range.end.toISOString(),
        calendarIds,
        timeZone,
      },
      placeholderData: keepPreviousData,
    }),
  );
  const counts = daysQuery.data?.days ?? NO_DAYS;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map((month) => (
          <YearMonth key={month.toISOString()} month={month} counts={counts} />
        ))}
      </div>
    </div>
  );
}
