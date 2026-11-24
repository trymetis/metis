"use client";

import { useChat } from "@ai-sdk/react";
import { type Data, useDndContext, useDndMonitor, useDroppable } from "@dnd-kit/core";
import { Button } from "@metis/ui/components/button";
import { cn } from "@metis/ui/lib/utils";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { AlertTriangle, Bot, type LucideIcon } from "lucide-react";
import { useMemo } from "react";

import { chatErrorText } from "@/ai/chat-error";
import { AGENT_DROP_ID, TURN_PART_TYPE, viewerTimeZone } from "@/ai/turn";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Suggestion } from "@/components/ai-elements/suggestion";

import { AgentChatMessage } from "./agent-chat-message";
import { AgentComposer } from "./agent-composer";
import { AgentPanelHeader } from "./agent-panel-header";
import { pendingApproval } from "./agent-tool-call";
import {
  AttachmentChips,
  AttachmentDropZone,
  AttachmentPicker,
  useAttachmentTray,
} from "./turn-attachments";
import type { AgentScopeKind } from "./use-scope-name";

const PICKER_LIMIT = 50;

export interface AgentPanelProps<T extends { id: string }> {
  kind: AgentScopeKind;
  slug: string;
  api: string;
  body: object;
  logTag: string;
  name: string;
  icon: LucideIcon;
  placeholder: string;
  emptyLabel: (attached: number) => string;
  suggestions: (attached: number) => readonly string[];
  open: T | null;
  candidates: readonly T[];
  describe: (item: T) => { title: string; subtitle: string };
  picker: { title: string; placeholder: string; emptyLabel: string };
  onOpenItem: (item: T) => void;
  fromDrag: (data: Data | undefined) => T | null;
  turn: (items: T[]) => { kind: string } & Record<string, unknown>;
  onTurnFinished: () => void;
  onClose: () => void;
}

export function AgentPanel<T extends { id: string }>({
  kind,
  slug,
  api,
  body,
  logTag,
  name,
  icon: Icon,
  placeholder,
  emptyLabel,
  suggestions,
  open,
  candidates,
  describe,
  picker,
  onOpenItem,
  fromDrag,
  turn,
  onTurnFinished,
  onClose,
}: AgentPanelProps<T>) {
  const { entries, add, pin, remove, reset } = useAttachmentTray<T>(open);
  const { isOver, setNodeRef } = useDroppable({ id: AGENT_DROP_ID });
  const { active } = useDndContext();
  const dragActive = active ? fromDrag(active.data.current) !== null : false;

  useDndMonitor({
    onDragEnd({ active: dragged, over }) {
      if (over?.id !== AGENT_DROP_ID) return;
      const item = fromDrag(dragged.data.current);
      if (item) add(item);
    },
  });

  const chips = entries.map((e) => ({ id: e.item.id, origin: e.origin, ...describe(e.item) }));
  const attachable = candidates
    .filter((c) => !entries.some((e) => e.item.id === c.id))
    .slice(0, PICKER_LIMIT)
    .map((c) => ({ id: c.id, ...describe(c) }));

  const transport = useMemo(() => new DefaultChatTransport({ api, body }), [api, body]);
  const {
    messages,
    setMessages,
    sendMessage,
    status,
    error,
    regenerate,
    stop,
    addToolApprovalResponse,
  } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onError: (err) => console.error(`${logTag} chat error:`, err),
    onFinish: () => onTurnFinished(),
  });
  const pending = pendingApproval(messages);

  function sendText(text: string) {
    const { kind: turnKind, ...context } = turn(entries.map((e) => e.item));
    void sendMessage({
      parts: [
        { type: "text", text },
        {
          type: TURN_PART_TYPE,
          data: {
            kind: turnKind,
            sentAt: new Date().toISOString(),
            timeZone: viewerTimeZone(),
            ...context,
          },
        },
      ],
    });
    reset();
  }

  function clearChat() {
    void stop();
    setMessages([]);
    reset();
  }

  function openChip(id: string) {
    const item = entries.find((e) => e.item.id === id)?.item ?? candidates.find((c) => c.id === id);
    if (item) onOpenItem(item);
  }

  function pickAttachment(id: string) {
    const item = candidates.find((c) => c.id === id);
    if (item) add(item);
  }

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col border-border border-l bg-panel",
        isOver && "ring-2 ring-primary ring-inset",
      )}
      ref={setNodeRef}
    >
      <AgentPanelHeader
        kind={kind}
        slug={slug}
        onClear={messages.length > 0 ? clearChat : undefined}
        onClose={onClose}
      />

      <Conversation className="flex-1">
        <ConversationContent className="gap-4">
          {messages.length === 0 ? (
            <ConversationEmptyState>
              <div className="flex flex-col items-center gap-3">
                <Bot className="size-10 text-faint opacity-40" />
                <p className="text-muted-foreground text-sm">{emptyLabel(entries.length)}</p>
                <div className="flex flex-col gap-1.5">
                  {suggestions(entries.length).map((s) => (
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
                  <p className="font-medium text-destructive-text text-sm">{name} hit a problem</p>
                  <p className="mt-1 wrap-break-word text-destructive-muted text-xs">
                    {chatErrorText(error)}
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
          icon={Icon}
          onClear={reset}
          onOpen={openChip}
          onPin={pin}
          onRemove={remove}
        />

        <AgentComposer
          pending={pending}
          onApproval={addToolApprovalResponse}
          onSend={sendText}
          status={status}
          onStop={stop}
          footer={
            <div className="flex items-center gap-1">
              <AttachmentPicker
                disabled={attachable.length === 0}
                emptyLabel={picker.emptyLabel}
                icon={Icon}
                items={attachable}
                onPick={pickAttachment}
                placeholder={picker.placeholder}
                title={picker.title}
              />
              <span className="text-[11px] text-faint pointer-coarse:hidden">Enter to send</span>
            </div>
          }
        >
          <PromptInputTextarea className="text-sm" placeholder={placeholder} />
        </AgentComposer>
      </div>
    </div>
  );
}
