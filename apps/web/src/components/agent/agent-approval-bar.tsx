"use client";

import { Button } from "@metis/ui/components/button";
import { ShieldCheck } from "lucide-react";
import { useEffect, useEffectEvent } from "react";

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
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

export function AgentApprovalBar({
  pending: current,
  onApproval,
}: {
  pending: PendingApproval | null;
  onApproval: ApprovalResponder;
}) {
  const names = useResourceNames();

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (!current || event.defaultPrevented || isEditable(event.target)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Enter") {
      event.preventDefault();
      onApproval({ id: current.approval.id, approved: true });
    } else if (event.key === "Escape") {
      event.preventDefault();
      onApproval({ id: current.approval.id, approved: false });
    }
  });

  useEffect(() => {
    if (!current) return;
    const handler = (event: KeyboardEvent) => onKey(event);
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [current]);

  if (!current) return null;
  const copy = toolCopy(current, names.mailboxes);
  const summary = inputSummary(current);
  const fields = describeFields(current.input, names);

  return (
    <section
      aria-label="Approval needed"
      className="flex items-start gap-2.5 rounded-t-lg border border-input border-b-0 bg-surface px-3 py-2.5"
    >
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground">
          {copy.approval ?? "Approve this before it runs"}
        </p>
        {summary && <p className="mt-0.5 text-xs text-muted-foreground">{summary}</p>}
        {fields.length > 0 && (
          <div className="mt-1.5 max-h-32 overflow-auto">
            <FieldList fields={fields} />
          </div>
        )}
        <p className="mt-1.5 text-[11px] text-faint pointer-coarse:hidden">
          Or type a message below to decline with a reason.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          aria-keyshortcuts="Escape"
          onClick={() => onApproval({ id: current.approval.id, approved: false })}
          size="xs"
          title="Decline (Esc)"
          type="button"
          variant="ghost"
        >
          Decline
        </Button>
        <Button
          aria-keyshortcuts="Enter"
          onClick={() => onApproval({ id: current.approval.id, approved: true })}
          size="xs"
          title="Approve (Enter)"
          type="button"
        >
          Approve
        </Button>
      </div>
    </section>
  );
}
