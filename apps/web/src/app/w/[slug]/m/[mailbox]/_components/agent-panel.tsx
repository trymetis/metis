"use client";

import { useChat } from "@ai-sdk/react";
import { useDndContext, useDndMonitor, useDroppable } from "@dnd-kit/core";
import { Button } from "@metis/ui/components/button";
import { cn } from "@metis/ui/lib/utils";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { AlertTriangle, Bot, Eraser, Mail, X } from "lucide-react";
import { useMemo } from "react";

import {
  AGENT_DROP_ID,
  type AgentEmail,
  TURN_PART_TYPE,
  toAgentEmail,
  viewerTimeZone,
} from "@/ai/turn";
import { AgentApprovalBar } from "@/components/agent/agent-approval-bar";
import { AgentChatMessage } from "@/components/agent/agent-chat-message";
import { AgentDisabled } from "@/components/agent/agent-disabled";
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
import { useScopePolicy } from "@/components/scope-policy-context";
import { useCurrentEmails } from "@/hooks/use-current-emails";
import { useMailboxScope } from "@/hooks/use-workspace-path";
import { formatEmailDate } from "@/lib/utils";
import { useMailStore } from "@/store/mail-store";
import type { Email } from "@/types/mail";

const EMAIL_SUGGESTIONS = [
  "Summarize this email",
  "Is this email phishing?",
  "Draft a reply",
  "What does the sender want?",
];

const INBOX_SUGGESTIONS = [
  "Summarize my inbox",
  "Find emails from this week",
  "Delete all promotional emails",
  "Star the latest email",
];

export function AgentPanel() {
  const scope = useMailboxScope();
  const { agentOpen, setAgentOpen, selectedEmail, setSelectedEmail, selectedFolder } =
    useMailStore();
  const emails = useCurrentEmails();
  const policy = useScopePolicy();
  const phishingDetectionEnabled = policy.phishingDetection;
  const openEmail = useMemo(
    () => (selectedEmail ? toAgentEmail(selectedEmail) : null),
    [selectedEmail],
  );
  const { entries, add, pin, remove, reset } = useAttachmentTray<AgentEmail>(openEmail);
  const { isOver, setNodeRef } = useDroppable({ id: AGENT_DROP_ID });
  const { active } = useDndContext();
  const dragActive = Boolean((active?.data.current as { email?: Email } | undefined)?.email);

  useDndMonitor({
    onDragEnd({ active: dragged, over }) {
      if (over?.id !== AGENT_DROP_ID) return;
      const data = dragged.data.current as { email?: Email } | undefined;
      if (!data?.email) return;
      add(toAgentEmail(data.email));
    },
  });

  const chips = entries.map((e) => ({
    id: e.item.id,
    title: e.item.subject,
    subtitle: `${e.item.from} · ${formatEmailDate(e.item.date)}`,
    origin: e.origin,
  }));

  const attachable = emails
    .filter((e) => !entries.some((a) => a.item.id === e.id))
    .slice(0, 50)
    .map((e) => ({
      id: e.id,
      title: e.subject,
      subtitle: `${e.fromName || e.from} · ${formatEmailDate(e.date)}`,
    }));

  function openChip(id: string) {
    const found = emails.find((e) => e.id === id);
    if (found) setSelectedEmail(found);
  }

  function pickAttachment(id: string) {
    const found = emails.find((e) => e.id === id);
    if (found) add(toAgentEmail(found));
  }

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/ai/chat", body: scope }),
    [scope],
  );

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
    onError: (err) => console.error("[agent-panel] chat error:", err),
  });
  const pending = pendingApproval(messages);

  function sendText(text: string) {
    void sendMessage({
      parts: [
        { type: "text", text },
        {
          type: TURN_PART_TYPE,
          data: {
            kind: "mail",
            sentAt: new Date().toISOString(),
            timeZone: viewerTimeZone(),
            folder: selectedFolder,
            emails: entries.map((e) => e.item),
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

  if (!agentOpen) return null;

  if (!policy.ai) {
    return (
      <AgentDisabled
        onClose={() => setAgentOpen(false)}
        reason={policy.workspaceAi ? "resource" : "workspace"}
        resource="mailbox"
        scopeLabel="this mailbox"
        workspaceSlug={scope.workspaceSlug}
      />
    );
  }

  const attachedCount = entries.length;
  const suggestions = (attachedCount > 0 ? EMAIL_SUGGESTIONS : INBOX_SUGGESTIONS).filter(
    (s) => phishingDetectionEnabled || s !== "Is this email phishing?",
  );

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
          <p className="font-medium font-serif text-[16px] text-foreground">Mail AI</p>
          <p className="text-[11px] text-faint">This mailbox</p>
        </div>
        {messages.length > 0 && (
          <Button
            aria-label="Clear chat"
            onClick={clearChat}
            size="icon-sm"
            title="Clear chat"
            variant="ghost"
          >
            <Eraser className="size-4" />
          </Button>
        )}
        <Button
          aria-label="Close assistant"
          onClick={() => setAgentOpen(false)}
          size="icon-sm"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
      </div>

      <Conversation className="flex-1">
        <ConversationContent className="gap-4">
          {messages.length === 0 ? (
            <ConversationEmptyState
              description={
                attachedCount === 1 && entries[0]
                  ? entries[0].item.subject
                  : attachedCount > 1
                    ? `${attachedCount} emails attached`
                    : "Ask anything about this mailbox. Drag emails here to attach them."
              }
              icon={<Bot className="size-10 opacity-40" />}
              title={attachedCount > 0 ? "Ask about this email" : "Mail AI"}
            >
              <div className="flex flex-col items-center gap-3">
                <Bot className="size-10 text-faint opacity-40" />
                <p className="font-serif text-muted-foreground text-sm">
                  {attachedCount > 0 ? "Ask about this email" : "Ask Mail AI"}
                </p>
                <div className="flex flex-col gap-1.5">
                  {suggestions.map((s) => (
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
                  <p className="font-medium text-destructive-text text-sm">Mail AI hit a problem</p>
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
          icon={Mail}
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
            <PromptInputTextarea className="text-sm" placeholder="Ask about your emails…" />
          </PromptInputBody>
          <PromptInputFooter>
            <div className="flex items-center gap-1">
              <AttachmentPicker
                disabled={attachable.length === 0}
                emptyLabel="No other emails loaded"
                icon={Mail}
                items={attachable}
                onPick={pickAttachment}
                placeholder="Attach an email…"
                title="Attach an email"
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
