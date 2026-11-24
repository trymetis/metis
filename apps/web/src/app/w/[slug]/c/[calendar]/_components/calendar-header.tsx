"use client";

import { Button } from "@metis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import { cn } from "@metis/ui/lib/utils";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { CALENDAR_VIEWS, type CalendarViewKey, navigateDate, rangeLabel } from "@/calendar/layout";
import { AgentToggle } from "@/components/agent/agent-toggle";
import { MobileAsideTrigger } from "@/components/mobile-aside";

import { useCalendar } from "./calendar-context";

const VIEW_LABEL: Record<CalendarViewKey, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  year: "Year",
  schedule: "Schedule",
};

const VIEW_KEY: Record<CalendarViewKey, string> = {
  day: "D",
  week: "W",
  month: "M",
  year: "Y",
  schedule: "A",
};

export function CalendarHeader({
  agentOpen,
  onToggleAgent,
  showAgentToggle,
}: {
  agentOpen: boolean;
  onToggleAgent: () => void;
  showAgentToggle: boolean;
}) {
  const { view, setView, date, setDate } = useCalendar();

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <MobileAsideTrigger className="-ml-1.5 size-8 shrink-0" />
      <Button variant="outline" size="sm" onClick={() => setDate(new Date())}>
        Today
      </Button>

      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous"
          onClick={() => setDate(navigateDate(date, view, "previous"))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next"
          onClick={() => setDate(navigateDate(date, view, "next"))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <h1 className="ml-1 text-[22px] font-medium leading-tight tracking-tight text-foreground">
        {rangeLabel(view, date)}
      </h1>

      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm">
                {VIEW_LABEL[view]}
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-44">
            {CALENDAR_VIEWS.map((key) => (
              <DropdownMenuItem
                key={key}
                onClick={() => setView(key)}
                className={cn("justify-between gap-6", key === view && "text-primary")}
              >
                {VIEW_LABEL[key]}
                <span className="font-mono text-[10px] text-faint">{VIEW_KEY[key]}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {showAgentToggle && (
          <AgentToggle label="Calendar AI" open={agentOpen} onToggle={onToggleAgent} />
        )}
      </div>
    </header>
  );
}
