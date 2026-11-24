"use client";

import { Button } from "@metis/ui/components/button";
import type { ChatStatus } from "ai";
import { ShieldCheck } from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";

import {
  describeFields,
  FieldList,
  inputSummary,
  type PendingApproval,
  toolCopy,
} from "./agent-tool-call";
import { useResourceNames } from "./resource-names";

export type ApprovalResponder = (args: { id: string; approved: boolean; reason?: string }) => void;

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function outsideComposer(
  target: EventTarget | null,
  composerRef: RefObject<HTMLDivElement | null>,
): boolean {
  return isEditable(target) && target instanceof Node && !composerRef.current?.contains(target);
}

function typedText(target: EventTarget | null): string {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    return target.value;
  }
  if (target instanceof HTMLElement && target.isContentEditable) return target.textContent ?? "";
  return "";
}

function ApprovalCard({
  pending,
  onApproval,
  composerHasText,
  composerRef,
}: {
  pending: PendingApproval;
  onApproval: ApprovalResponder;
  composerHasText: boolean;
  composerRef: RefObject<HTMLDivElement | null>;
}) {
  const names = useResourceNames();

  const onApproveKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey) || event.altKey) return;
    if (outsideComposer(event.target, composerRef)) return;
    if (composerHasText) {
      if (!(event.target instanceof Node) || !composerRef.current?.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      composerRef.current.querySelector("form")?.requestSubmit();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onApproval({ id: pending.approval.id, approved: true });
  });

  const onDeclineKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (typedText(event.target).trim()) return;
    if (outsideComposer(event.target, composerRef)) return;
    event.preventDefault();
    onApproval({ id: pending.approval.id, approved: false });
  });

  useEffect(() => {
    const approve = (event: KeyboardEvent) => onApproveKey(event);
    const decline = (event: KeyboardEvent) => onDeclineKey(event);
    document.addEventListener("keydown", approve, true);
    document.addEventListener("keydown", decline);
    return () => {
      document.removeEventListener("keydown", approve, true);
      document.removeEventListener("keydown", decline);
    };
  }, []);

  const copy = toolCopy(pending, names.mailboxes);
  const summary = inputSummary(pending);
  const fields = describeFields(pending.input, names);

  return (
    <section
      aria-label="Approval needed"
      className="mx-4 rounded-t-xl border border-b-0 border-input bg-surface px-3 py-2.5"
    >
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-foreground">
            {copy.approval ?? "Approve this before it runs"}
          </p>
          {summary && <p className="mt-0.5 text-xs text-muted-foreground">{summary}</p>}
        </div>
      </div>
      {fields.length > 0 && (
        <div className="mt-1.5 max-h-32 overflow-auto pl-6">
          <FieldList fields={fields} />
        </div>
      )}
      <div className="mt-2 flex justify-end gap-1.5">
        <Button
          aria-keyshortcuts="Escape"
          onClick={() => onApproval({ id: pending.approval.id, approved: false })}
          size="xs"
          title="Decline (Esc)"
          type="button"
          variant="ghost"
        >
          Decline
        </Button>
        <Button
          aria-keyshortcuts="Control+Enter Meta+Enter"
          onClick={() => onApproval({ id: pending.approval.id, approved: true })}
          size="xs"
          title="Approve (Ctrl/⌘ Enter)"
          type="button"
        >
          Approve
        </Button>
      </div>
    </section>
  );
}

export function AgentComposer({
  pending,
  onApproval,
  onSend,
  status,
  onStop,
  footer,
  children,
}: {
  pending: PendingApproval | null;
  onApproval: ApprovalResponder;
  onSend: (text: string) => void;
  status: ChatStatus;
  onStop: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const [hasText, setHasText] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);
  const declining = Boolean(pending) && hasText;

  return (
    <div ref={composerRef}>
      {pending && (
        <ApprovalCard
          key={pending.approval.id}
          pending={pending}
          onApproval={onApproval}
          composerHasText={hasText}
          composerRef={composerRef}
        />
      )}
      <PromptInput
        onInput={(event: FormEvent<HTMLFormElement>) =>
          setHasText(typedText(event.target).trim().length > 0)
        }
        onSubmit={(message) => {
          const text = message.text.trim();
          if (!text) return;
          setHasText(false);
          if (pending) {
            onApproval({ id: pending.approval.id, approved: false, reason: text });
            return;
          }
          onSend(text);
        }}
      >
        <PromptInputBody>{children}</PromptInputBody>
        <PromptInputFooter>
          {footer}
          {declining ? (
            <PromptInputSubmit size="sm" status={status} onStop={onStop}>
              Decline with reason
            </PromptInputSubmit>
          ) : (
            <PromptInputSubmit onStop={onStop} status={status} />
          )}
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
