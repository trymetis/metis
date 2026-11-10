"use client";

import { useChat } from "@ai-sdk/react";
import { Button } from "@metis/ui/components/button";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { AlertTriangle, Bot, File, X } from "lucide-react";
import { useMemo } from "react";

import { type AgentFile, TURN_PART_TYPE, toAgentFile, viewerTimeZone } from "@/ai/turn";
import { AgentApprovalBar } from "@/components/agent/agent-approval-bar";
import { AgentChatMessage } from "@/components/agent/agent-chat-message";
import { pendingApproval } from "@/components/agent/agent-tool-call";
import {
  AttachmentChips,
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
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { formatBytes } from "@/lib/utils";
import type { DriveEntryRow } from "@/server/schema";
import { ALL_DRIVES_SLUG } from "@/workspace/path";

const SUGGESTIONS = [
  "What's in this folder?",
  "Find the latest invoice",
  "Which files changed this week?",
  "Summarise the notes file here",
];

function sizeLabel(kind: "file" | "folder", size: number | null | undefined) {
  if (kind === "folder") return "Folder";
  return size === null || size === undefined ? "" : formatBytes(size);
}

export function DriveAgentPanel({
  driveSlug,
  folderId,
  folderPath,
  entries: visible,
  onClose,
  onRefresh,
  onOpenEntry,
}: {
  driveSlug: string;
  folderId: string | null;
  folderPath: string[];
  entries: DriveEntryRow[];
  onClose: () => void;
  onRefresh: () => void;
  onOpenEntry: (entry: DriveEntryRow) => void;
}) {
  const scope = useWorkspaceScope();
  const { entries, add, pin, remove, reset } = useAttachmentTray<AgentFile>(null);

  const chips = entries.map((e) => ({
    id: e.item.id,
    title: e.item.name,
    subtitle: sizeLabel(e.item.kind, e.item.size),
    origin: e.origin,
  }));

  const attachable = visible
    .filter((entry) => !entries.some((a) => a.item.id === entry.id))
    .slice(0, 50)
    .map((entry) => ({
      id: entry.id,
      title: entry.name,
      subtitle: sizeLabel(entry.kind, entry.size),
    }));

  function pickAttachment(id: string) {
    const found = visible.find((entry) => entry.id === id);
    if (found) add(toAgentFile(found));
  }

  function openChip(id: string) {
    const found = visible.find((entry) => entry.id === id);
    if (found) onOpenEntry(found);
  }

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/drive-chat",
        body: { ...scope, driveSlug },
      }),
    [scope, driveSlug],
  );

  const { messages, sendMessage, status, error, regenerate, stop, addToolApprovalResponse } =
    useChat({
      transport,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
      onError: (err) => console.error("[drive-agent] chat error:", err),
      onFinish: () => onRefresh(),
    });
  const pending = pendingApproval(messages);

  function sendText(text: string) {
    void sendMessage({
      parts: [
        { type: "text", text },
        {
          type: TURN_PART_TYPE,
          data: {
            kind: "drive",
            sentAt: new Date().toISOString(),
            timeZone: viewerTimeZone(),
            folderId: folderId ?? undefined,
            folderPath,
            files: entries.map((e) => e.item),
          },
        },
      ],
    });
    reset();
  }

  return (
    <div className="flex h-full w-full flex-col border-border border-l bg-panel">
      <div className="flex items-center gap-2.5 border-border-soft border-b px-4 py-3.5">
        <div className="flex-1">
          <p className="font-medium font-serif text-[16px] text-foreground">Drive AI</p>
          <p className="text-[11px] text-faint">
            {driveSlug === ALL_DRIVES_SLUG ? "All drives" : "This drive"}
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
              description="Ask anything about these files."
              icon={<Bot className="size-10 opacity-40" />}
              title="Drive AI"
            >
              <div className="flex flex-col items-center gap-3">
                <Bot className="size-10 text-faint opacity-40" />
                <p className="font-serif text-muted-foreground text-sm">Ask about these files</p>
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
                    Drive AI hit a problem
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
        <AttachmentChips
          chips={chips}
          className="mb-2"
          icon={File}
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
            <PromptInputTextarea className="text-sm" placeholder="Ask about these files…" />
          </PromptInputBody>
          <PromptInputFooter>
            <div className="flex items-center gap-1">
              <AttachmentPicker
                disabled={attachable.length === 0}
                emptyLabel="Nothing in this folder"
                icon={File}
                items={attachable}
                onPick={pickAttachment}
                placeholder="Attach a file…"
                title="Attach a file"
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
