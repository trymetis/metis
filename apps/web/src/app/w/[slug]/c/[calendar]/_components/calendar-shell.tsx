"use client";

import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { differenceInMinutes, format, parseISO, startOfDay } from "date-fns";
import { CalendarDays, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AGENT_DROP_ID } from "@/ai/turn";
import { eventEnd, eventStart } from "@/calendar/layout";
import { AgentDisabled } from "@/components/agent/agent-disabled";
import { ChordHint } from "@/components/chord-hint";
import { ResponsiveAside } from "@/components/mobile-aside";
import { usePlatformPolicy } from "@/components/platform-policy-context";
import { useScopePolicy } from "@/components/scope-policy-context";
import { ShortcutsHelp } from "@/components/shortcuts-help";
import { useWorkspacePath, useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc } from "@/lib/orpc";
import { calendarEventSchema } from "@/server/schema";
import type { CalendarEvent } from "@/types/calendar";

import { CalendarAgentPanel } from "./calendar-agent-panel";
import { CalendarProvider, useCalendar } from "./calendar-context";
import { CalendarHeader } from "./calendar-header";
import { CalendarSidebar } from "./calendar-sidebar";
import { EventDialog } from "./event-dialog";
import { EventPopover } from "./event-popover";
import { HOUR_PX } from "./time-line";
import {
  CALENDAR_CHORD_PREFIX,
  CALENDAR_UNCHORDED,
  useCalendarShortcuts,
} from "./use-calendar-shortcuts";
import { DayView } from "./views/day-view";
import { MonthView } from "./views/month-view";
import { ScheduleView } from "./views/schedule-view";
import { WeekView } from "./views/week-view";
import { YearView } from "./views/year-view";

const SNAP_MINUTES = 15;

const dragDataSchema = z.object({
  event: calendarEventSchema,
  mode: z.enum(["move", "resize"]),
});

function ViewSurface() {
  const { view, loading } = useCalendar();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {loading && (
        <div className="pointer-events-none absolute top-2 right-4 z-40">
          <Loader2 className="h-4 w-4 animate-spin text-faint" />
        </div>
      )}
      {view === "day" && <DayView />}
      {view === "week" && <WeekView />}
      {view === "month" && <MonthView />}
      {view === "year" && <YearView />}
      {view === "schedule" && <ScheduleView />}
    </div>
  );
}

function Surface({ agentOpen, onToggleAgent }: { agentOpen: boolean; onToggleAgent: () => void }) {
  const scope = useWorkspaceScope();
  const workspaceSlug = scope.workspaceSlug;
  const platformAi = usePlatformPolicy().ai;
  const policy = useScopePolicy();
  const calendarSlug = useWorkspacePath().calendarSlug ?? "all";
  const { refresh, errors } = useCalendar();
  const { armed, bindings, helpOpen, setHelpOpen } = useCalendarShortcuts({
    onToggleAgent,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const [dragging, setDragging] = useState<CalendarEvent | null>(null);
  const [overAgent, setOverAgent] = useState(false);

  function onDragOver({ over }: DragOverEvent) {
    setOverAgent(over?.id === AGENT_DROP_ID);
  }

  async function onDragEnd({ active, over, delta }: DragEndEvent) {
    setDragging(null);
    setOverAgent(false);
    if (!over || over.id === AGENT_DROP_ID) return;
    const parsed = dragDataSchema.safeParse(active.data.current);
    if (!parsed.success) return;
    const data = parsed.data;

    const { event, mode } = data;
    const start = eventStart(event);
    const end = eventEnd(event);
    const duration = differenceInMinutes(end, start);

    const shift = Math.round(((delta.y / HOUR_PX) * 60) / SNAP_MINUTES) * SNAP_MINUTES;

    let nextStart = start;
    let nextEnd = end;

    if (mode === "resize") {
      nextEnd = new Date(end.getTime() + shift * 60_000);
      if (differenceInMinutes(nextEnd, start) < SNAP_MINUTES) return;
    } else {
      const targetDay = (over.data.current as { day?: Date } | undefined)?.day;
      const base = targetDay ? startOfDay(targetDay) : startOfDay(start);
      nextStart = new Date(base);
      nextStart.setHours(start.getHours(), start.getMinutes(), 0, 0);
      nextStart = new Date(nextStart.getTime() + shift * 60_000);
      nextEnd = new Date(nextStart.getTime() + duration * 60_000);
      if (nextStart.getTime() === start.getTime()) return;
    }

    try {
      await orpc.calendarEvents.update({
        ...scope,
        calendarSlug,
        accountId: event.accountId,
        calendarId: event.calendarId,
        eventId: event.id,
        start: nextStart.toISOString(),
        end: nextEnd.toISOString(),
      });
    } catch (err) {
      const failure = mode === "resize" ? "Could not resize the event" : "Could not move the event";
      toast.error(err instanceof Error ? err.message : failure);
    } finally {
      await refresh();
    }
  }

  return (
    <DndContext
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragStart={({ active }) => {
        const data = active.data.current as { event?: CalendarEvent; mode?: string } | undefined;
        setDragging(data?.mode === "move" ? (data.event ?? null) : null);
      }}
      sensors={sensors}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <CalendarHeader
          agentOpen={agentOpen}
          onToggleAgent={onToggleAgent}
          showAgentToggle={platformAi}
        />

        {errors.length > 0 && (
          <div className="shrink-0 border-b border-destructive/25 bg-destructive/8 px-4 py-2 text-[12px] text-destructive-text">
            {errors.map((e) => `${e.accountEmail}: ${e.error}`).join(" · ")}
          </div>
        )}

        <ViewSurface />
      </div>

      {agentOpen && (
        <div className="w-95 shrink-0 max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full max-md:bg-background">
          {policy.ai ? (
            <CalendarAgentPanel onClose={onToggleAgent} />
          ) : (
            <AgentDisabled
              onClose={onToggleAgent}
              reason={policy.workspaceAi ? "resource" : "workspace"}
              resource="calendar"
              scopeLabel="this calendar"
              workspaceSlug={workspaceSlug}
            />
          )}
        </div>
      )}

      <EventPopover />
      <EventDialog />
      <ShortcutsHelp
        open={helpOpen}
        onOpenChange={setHelpOpen}
        prefix={CALENDAR_CHORD_PREFIX}
        bindings={bindings}
        unchorded={CALENDAR_UNCHORDED}
      />
      <ChordHint prefix={CALENDAR_CHORD_PREFIX} bindings={bindings} visible={armed} />

      <DragOverlay dropAnimation={null}>
        {dragging && overAgent && (
          <div className="flex max-w-70 items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5 shadow-lg">
            <CalendarDays className="size-3 shrink-0 text-faint" strokeWidth={1.75} />
            <span className="min-w-0 truncate text-[12px] text-foreground">{dragging.title}</span>
            <span className="shrink-0 text-[11px] text-faint">
              {dragging.allDay ? "All day" : format(parseISO(dragging.start), "HH:mm")}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

export function CalendarShell() {
  const [agentOpen, setAgentOpen] = useState(false);
  const toggleAgent = useCallback(() => setAgentOpen((open) => !open), []);

  return (
    <CalendarProvider>
      <div className="flex h-full min-h-0">
        <ResponsiveAside label="Calendars">
          <CalendarSidebar />
        </ResponsiveAside>
        <Surface agentOpen={agentOpen} onToggleAgent={toggleAgent} />
      </div>
    </CalendarProvider>
  );
}
