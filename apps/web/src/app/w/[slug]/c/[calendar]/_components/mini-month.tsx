"use client";

import { Button } from "@metis/ui/components/button";
import { cn } from "@metis/ui/lib/utils";
import { addMonths, format, isSameDay, isSameMonth, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { monthCells } from "@/calendar/layout";
import { useNow } from "@/hooks/use-now";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function MiniMonth({
  selected,
  onSelect,
}: {
  selected: Date;
  onSelect: (date: Date) => void;
}) {
  const [cursor, setCursor] = useState(selected);
  const [shown, setShown] = useState(selected);
  const today = useNow();

  if (selected !== shown) {
    setShown(selected);
    setCursor(selected);
  }

  const cells = monthCells(cursor);

  return (
    <div className="px-1">
      <div className="mb-1 flex items-center justify-between">
        <span className="pl-1.5 text-[13px] font-medium text-foreground">
          {format(cursor, "MMMM yyyy")}
        </span>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Previous month"
            onClick={() => setCursor(subMonths(cursor, 1))}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Next month"
            onClick={() => setCursor(addMonths(cursor, 1))}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>

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
          const isToday = isSameDay(cell.date, today);
          const isSelected = isSameDay(cell.date, selected);
          return (
            <button
              key={cell.date.toISOString()}
              type="button"
              onClick={() => onSelect(cell.date)}
              className={cn(
                "flex h-6 items-center justify-center rounded-full text-[11px] transition-colors",
                isSameMonth(cell.date, cursor) ? "text-muted-foreground" : "text-faint",
                !isToday && !isSelected && "hover:bg-hover",
                isSelected && !isToday && "bg-hover text-foreground",
                isToday && "bg-primary font-medium text-primary-foreground",
              )}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
