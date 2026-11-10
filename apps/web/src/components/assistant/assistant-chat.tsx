"use client";

import { useChat } from "@ai-sdk/react";
import { Button } from "@metis/ui/components/button";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { AlertTriangle, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { WORKSPACE_REFERENCE_TYPES } from "@/ai/references";
import { TURN_PART_TYPE, type WorkspaceTurnEnvelope, workspaceTurn } from "@/ai/turn";
import { AgentApprovalBar } from "@/components/agent/agent-approval-bar";
import { AgentChatMessage } from "@/components/agent/agent-chat-message";
import { pendingApproval } from "@/components/agent/agent-tool-call";
import { ReferenceComposer } from "@/components/agent/references/reference-composer";
import { AgentReferenceProvider } from "@/components/agent/references/reference-provider";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Suggestion } from "@/components/ai-elements/suggestion";
import { DrivePreview } from "@/components/drive-preview/drive-preview";
import { downloadDriveFile } from "@/components/drive-preview/use-drive-preview";
import { MemberPreview } from "@/components/members/member-preview";
import { useWorkspaceSlug } from "@/hooks/use-workspace-path";
import { orpc } from "@/lib/orpc";
import { assistantPath } from "@/workspace/path";

import { setPendingMessage, takePendingDraft, takePendingMessage } from "./pending";
import { useReferencePreview } from "./use-reference-preview";

function turnParts(text: string, turn: WorkspaceTurnEnvelope): UIMessage["parts"] {
  return [
    { type: "text", text },
    { type: TURN_PART_TYPE, data: turn },
  ];
}

const SUGGESTIONS = [
  "What needs my attention across all my mailboxes?",
  "Search every mailbox for unpaid invoices",
  "Summarize this week's unread mail per mailbox",
  "What's on my calendar this week?",
  "Find the latest contract in my drives",
];

export function AssistantChat({
  threadId,
  initialMessages,
}: {
  threadId: string | null;
  initialMessages?: UIMessage[];
}) {
  const router = useRouter();
  const workspaceSlug = useWorkspaceSlug();
  const { preview, open: openReference, close: closePreview } = useReferencePreview(workspaceSlug);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/workspace-chat",
        body: threadId ? { workspaceSlug, threadId } : { workspaceSlug },
      }),
    [workspaceSlug, threadId],
  );

  const { messages, sendMessage, status, error, regenerate, stop, addToolApprovalResponse } =
    useChat({
      transport,
      messages: initialMessages,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
      onError: (err) => console.error("[assistant] chat error:", err),
    });
  const pending = pendingApproval(messages);

  const [draftReferences] = useState(() =>
    threadId ? undefined : (takePendingDraft() ?? undefined),
  );

  const sentPending = useRef(false);
  useEffect(() => {
    if (!threadId || sentPending.current) return;
    const held = takePendingMessage(threadId);
    if (held) {
      sentPending.current = true;
      void sendMessage({ parts: turnParts(held.text, held.turn) });
    }
  }, [threadId, sendMessage]);

  async function sendText(text: string) {
    const turn = workspaceTurn();
    if (threadId) {
      await sendMessage({ parts: turnParts(text, turn) });
      return;
    }
    try {
      const created = await orpc.assistant.createThread({
        workspaceSlug,
        title: text,
      });
      setPendingMessage(created.id, text, turn);
      router.push(assistantPath(workspaceSlug, created.id));
    } catch (err) {
      console.error("[assistant] failed to create thread:", err);
      await sendMessage({ parts: turnParts(text, turn) });
    }
  }

  return (
    <AgentReferenceProvider
      onOpen={openReference}
      types={WORKSPACE_REFERENCE_TYPES}
      workspaceSlug={workspaceSlug}
    >
      <div className="flex h-full min-h-0">
        <div className="flex h-full min-w-0 flex-1 flex-col">
          <Conversation className="flex-1">
            <ConversationContent className="mx-auto w-full max-w-3xl gap-6">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center gap-5 py-16 text-center">
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft">
                    <Sparkles className="size-7 text-brand-text" />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="font-serif text-foreground text-xl">
                      Ask across your whole workspace
                    </h2>
                    <p className="mx-auto max-w-md text-muted-foreground text-sm">
                      Read, search, summarize and act across every connected mailbox, calendar,
                      drive and address book in your workspace. Sends, deletes and other changes
                      pause for your approval.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {SUGGESTIONS.map((s) => (
                      <Suggestion key={s} onClick={sendText} suggestion={s} />
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((message) => <AgentChatMessage key={message.id} message={message} />)
              )}

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive-text" />
                    <div className="flex-1">
                      <p className="font-medium text-destructive-text text-sm">
                        Workspace Assistant hit a problem
                      </p>
                      <p className="mt-1 wrap-break-word text-destructive-muted text-sm">
                        {error.message}
                      </p>
                      <Button
                        className="mt-2"
                        onClick={() => regenerate()}
                        size="sm"
                        variant="outline"
                      >
                        Retry
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          <div className="border-border-soft border-t px-6 py-4">
            <div className="mx-auto w-full max-w-3xl">
              <AgentApprovalBar onApproval={addToolApprovalResponse} pending={pending} />
              <PromptInput
                className={pending ? "[&_[data-slot=input-group]]:rounded-t-none" : undefined}
                onSubmit={(message) => {
                  const text = message.text.trim();
                  if (!text) return;
                  if (pending) {
                    addToolApprovalResponse({
                      id: pending.approval.id,
                      approved: false,
                      reason: text,
                    });
                    return;
                  }
                  void sendText(text);
                }}
              >
                <PromptInputBody>
                  <ReferenceComposer
                    label="Ask across your workspace"
                    placeholder="Ask across your workspace…  @ to reference"
                    initialReferences={draftReferences}
                  />
                </PromptInputBody>
                <PromptInputFooter>
                  <span className="text-[11px] text-faint">Sensitive actions ask for approval</span>
                  <PromptInputSubmit onStop={stop} status={status} />
                </PromptInputFooter>
              </PromptInput>
            </div>
          </div>
        </div>
        {preview?.kind === "member" && (
          <MemberPreview
            key={preview.userId}
            workspaceSlug={workspaceSlug}
            userId={preview.userId}
            label={preview.label}
            onClose={closePreview}
          />
        )}
        {preview?.kind === "file" && (
          <DrivePreview
            key={`${preview.entry.driveId}:${preview.entry.id}`}
            entry={preview.entry}
            workspaceSlug={workspaceSlug}
            driveSlug={preview.driveSlug}
            providerLabel={preview.providerLabel}
            onClose={closePreview}
            onDownload={(entry) => downloadDriveFile(workspaceSlug, preview.driveSlug, entry.id)}
          />
        )}
      </div>
    </AgentReferenceProvider>
  );
}
