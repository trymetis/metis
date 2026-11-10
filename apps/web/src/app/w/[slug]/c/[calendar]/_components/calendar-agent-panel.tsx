"use client";

import { useChat } from "@ai-sdk/react";
import { useDndContext, useDndMonitor, useDroppable } from "@dnd-kit/core";
import { Button } from "@metis/ui/components/button";
import { cn } from "@metis/ui/lib/utils";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { format, parseISO } from "date-fns";
import { AlertTriangle, Bot, CalendarDays, X } from "lucide-react";
import { useMemo } from "react";

import {
  AGENT_DROP_ID,
  type AgentEvent,
  TURN_PART_TYPE,
  toAgentEvent,
  viewerTimeZone,
} from "@/ai/turn";
import { AgentApprovalBar } from "@/components/agent/agent-approval-bar";
import { AgentChatMessage } from "@/components/agent/agent-chat-message";
import { pendingApproval } from "@/components/agent/agent-tool-call";
import {
  AttachmentChips,
  AttachmentDropZone,
  AttachmentPicker,
  useAttachmentTray,
} from "@/components/agent/turn-attachments";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Suggestion } from "@/components/ai-elements/suggestion";
import { useWorkspacePath, useWorkspaceScope } from "@/hooks/use-workspace-path";
import type { CalendarEvent } from "@/types/calendar";

import { useCalendar } from "./calendar-context";

const SUGGESTIONS = [
  "What's on this week?",
  "When am I free tomorrow?",
  "Find my next meeting with the team",
  "Move my 3pm to Thursday",
];

export function CalendarAgentPanel({ onClose }: { onClose: () => void }) {
  const scope = useWorkspaceScope();
  const calendarSlug = useWorkspacePath().calendarSlug ?? "all";
  const { view, range, refresh, events, selected, setSelected, setDate } = useCalendar();
  const openEvent = useMemo(() => (selected ? toAgentEvent(selected) : null), [selected]);
  const { entries, add, pin, remove, reset } = useAttachmentTray<AgentEvent>(openEvent);
  const { isOver, setNodeRef } = useDroppable({ id: AGENT_DROP_ID });
  const { active } = useDndContext();
  const dragActive = (active?.data.current as { mode?: string } | undefined)?.mode === "move";

  useDndMonitor({
    onDragEnd({ active: dragged, over }) {
      if (over?.id !== AGENT_DROP_ID) return;
      const data = dragged.data.current as { event?: CalendarEvent; mode?: string } | undefined;
      if (!data?.event || data.mode !== "move") return;
      add(toAgentEvent(data.event));
    },
  });

  const chips = entries.map((e) => ({
    id: e.item.id,
    title: e.item.title,
    subtitle: e.item.allDay ? "All day" : format(parseISO(e.item.start), "EEE d MMM, HH:mm"),
    origin: e.origin,
  }));

  const attachable = events
    .filter((e) => !entries.some((a) => a.item.id === e.id))
    .slice(0, 50)
    .map((e) => ({
      id: e.id,
      title: e.title,
      subtitle: e.allDay ? "All day" : format(parseISO(e.start), "EEE d MMM, HH:mm"),
    }));

  function pickAttachment(id: string) {
    const found = events.find((e) => e.id === id);
    if (found) add(toAgentEvent(found));
  }

  function openChip(id: string) {
    const found = events.find((e) => e.id === id);
    if (found) {
      setSelected(found);
      return;
    }
    const attached = entries.find((e) => e.item.id === id);
    if (attached) setDate(parseISO(attached.item.start));
  }

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/calendar-chat",
        body: { ...scope, calendarSlug },
      }),
    [scope, calendarSlug],
  );

  const { messages, sendMessage, status, error, regenerate, stop, addToolApprovalResponse } =
    useChat({
      transport,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
      onError: (err) => console.error("[calendar-agent] chat error:", err),
      onFinish: () => refresh(),
    });
  const pending = pendingApproval(messages);

  function sendText(text: string) {
    void sendMessage({
      parts: [
        { type: "text", text },
        {
          type: TURN_PART_TYPE,
          data: {
            kind: "calendar",
            sentAt: new Date().toISOString(),
            timeZone: viewerTimeZone(),
            view,
            visibleRange: {
              start: range.start.toISOString(),
              end: range.end.toISOString(),
            },
            events: entries.map((e) => e.item),
          },
        },
      ],
    });
    reset();
  }

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col border-border border-l bg-panel",
        isOver && "ring-2 ring-primary ring-inset",
      )}
      ref={setNodeRef}
    >
      <div className="flex items-center gap-2.5 border-border-soft border-b px-4 py-3.5">
        <div className="flex-1">
          <p className="font-medium font-serif text-[16px] text-foreground">Calendar AI</p>
          <p className="text-[11px] text-faint">
            {calendarSlug === "all" ? "All calendars" : "This calendar"}
          </p>
        </div>
        <Button aria-label="Close assistant" onClick={onClose} size="icon-sm" variant="ghost">
          <X className="size-4" />
        </Button>
      </div>

      <Conversation className="flex-1">
        <ConversationContent className="gap-4">
          {messages.length === 0 ? (
            <ConversationEmptyState
              description="Ask anything about this calendar."
              icon={<Bot className="size-10 opacity-40" />}
              title="Calendar AI"
            >
              <div className="flex flex-col items-center gap-3">
                <Bot className="size-10 text-faint opacity-40" />
                <p className="font-serif text-muted-foreground text-sm">Ask about this calendar</p>
                <div className="flex flex-col gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <Suggestion className="rounded-md" key={s} onClick={sendText} suggestion={s} />
                  ))}
                </div>
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((message) => <AgentChatMessage key={message.id} message={message} />)
          )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive-text" />
                <div className="flex-1">
                  <p className="font-medium text-destructive-text text-sm">
                    Calendar AI hit a problem
                  </p>
                  <p className="mt-1 wrap-break-word text-destructive-muted text-xs">
                    {error.message}
                  </p>
                  <Button className="mt-2" onClick={() => regenerate()} size="sm" variant="outline">
                    Retry
                  </Button>
                </div>
              </div>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-border-soft border-t p-3">
        <AttachmentDropZone
          className="mb-2"
          isOver={isOver}
          label="Drop to attach"
          visible={dragActive}
        />

        <AttachmentChips
          chips={chips}
          className="mb-2"
          icon={CalendarDays}
          onClear={reset}
          onOpen={openChip}
          onPin={pin}
          onRemove={remove}
        />

        <AgentApprovalBar onApproval={addToolApprovalResponse} pending={pending} />
        <PromptInput
          className={pending ? "[&_[data-slot=input-group]]:rounded-t-none" : undefined}
          onSubmit={(message) => {
            const text = message.text.trim();
            if (!text) return;
            if (pending) {
              addToolApprovalResponse({ id: pending.approval.id, approved: false, reason: text });
              return;
            }
            sendText(text);
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea className="text-sm" placeholder="Ask about your calendar…" />
          </PromptInputBody>
          <PromptInputFooter>
            <div className="flex items-center gap-1">
              <AttachmentPicker
                disabled={attachable.length === 0}
                emptyLabel="No events in view"
                icon={CalendarDays}
                items={attachable}
                onPick={pickAttachment}
                placeholder="Attach an event…"
                title="Attach an event"
              />
              <span className="text-[11px] text-faint pointer-coarse:hidden">Enter to send</span>
            </div>
            <PromptInputSubmit onStop={stop} status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
