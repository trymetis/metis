"use client";

import type { Data } from "@dnd-kit/core";
import { format, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";
import { useMemo } from "react";

import { type AgentEvent, toAgentEvent } from "@/ai/turn";
import { AgentPanel } from "@/components/agent/agent-panel";
import { useWorkspacePath, useWorkspaceScope } from "@/hooks/use-workspace-path";
import type { CalendarEvent } from "@/types/calendar";

import { useCalendar } from "./calendar-context";

const SUGGESTIONS = [
  "What's on this week?",
  "When am I free tomorrow?",
  "Find my next meeting with the team",
  "Move my 3pm to Thursday",
];

function describe(event: AgentEvent) {
  return {
    title: event.title,
    subtitle: event.allDay ? "All day" : format(parseISO(event.start), "EEE d MMM, HH:mm"),
  };
}

function fromDrag(data: Data | undefined): AgentEvent | null {
  const event: CalendarEvent | undefined = data?.event;
  return event && data?.mode === "move" ? toAgentEvent(event) : null;
}

export function CalendarAgentPanel({ onClose }: { onClose: () => void }) {
  const scope = useWorkspaceScope();
  const calendarSlug = useWorkspacePath().calendarSlug ?? "all";
  const { view, range, refresh, events, selected, setSelected, setDate } = useCalendar();
  const open = useMemo(() => (selected ? toAgentEvent(selected) : null), [selected]);
  const candidates = useMemo(() => events.map(toAgentEvent), [events]);
  const body = useMemo(() => ({ ...scope, calendarSlug }), [scope, calendarSlug]);

  return (
    <AgentPanel
      kind="calendar"
      slug={calendarSlug}
      api="/api/ai/chat/calendar"
      body={body}
      logTag="[calendar-agent]"
      name="Calendar AI"
      icon={CalendarDays}
      placeholder="Ask about your calendar…"
      emptyLabel={() => "Ask about this calendar"}
      suggestions={() => SUGGESTIONS}
      open={open}
      candidates={candidates}
      describe={describe}
      picker={{
        title: "Attach an event",
        placeholder: "Attach an event…",
        emptyLabel: "No events in view",
      }}
      onOpenItem={(item) => {
        const found = events.find((e) => e.id === item.id);
        if (found) setSelected(found);
        else setDate(parseISO(item.start));
      }}
      fromDrag={fromDrag}
      turn={(items) => ({
        kind: "calendar",
        view,
        visibleRange: { start: range.start.toISOString(), end: range.end.toISOString() },
        events: items,
      })}
      onTurnFinished={() => void refresh()}
      onClose={onClose}
    />
  );
}
