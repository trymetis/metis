"use client";

import { Button } from "@metis/ui/components/button";
import { AlertCircle, CheckCircle2, Clock, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { UndoSendStatus } from "@/types/mail";

interface UndoSendCardProps {
  status: UndoSendStatus;
  holdMs: number;
  error?: string;
  scheduledFor?: Date;
  addedBcc?: string[];
  onUndo: () => void;
  onDismiss: () => void;
}

function AddedBcc({ addresses }: { addresses?: string[] }) {
  if (!addresses || addresses.length === 0) return null;
  return (
    <div className="mt-0.5 text-[11px] text-faint">
      A workflow added Bcc: {addresses.join(", ")}
    </div>
  );
}

function UndoSendCard({
  status,
  holdMs,
  error,
  scheduledFor,
  addedBcc,
  onUndo,
  onDismiss,
}: UndoSendCardProps) {
  const [remaining, setRemaining] = useState(holdMs);
  const countKey = `${status} ${holdMs}`;
  const [countFor, setCountFor] = useState(countKey);

  if (countKey !== countFor) {
    setCountFor(countKey);
    setRemaining(holdMs);
  }

  useEffect(() => {
    if (status !== "pending") return;
    const start = Date.now();
    const tick = setInterval(() => {
      setRemaining(Math.max(0, holdMs - (Date.now() - start)));
    }, 100);
    return () => clearInterval(tick);
  }, [status, holdMs]);

  const seconds = Math.ceil(remaining / 1000);
  const progress = ((holdMs - remaining) / holdMs) * 100;

  return (
    <div className="relative flex min-w-[320px] items-center gap-3 overflow-hidden rounded-lg border px-4 py-3 shadow-2xl bg-surface border-border">
      {status === "pending" && (
        <>
          <div
            className="absolute bottom-0 left-0 h-0.5 transition-[width] duration-100 bg-brand"
            style={{ width: `${progress}%` }}
          />
          <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-text" />
          <div className="flex-1 text-[13px] text-foreground">Sending in {seconds}s…</div>
          <Button variant="outline" size="sm" onClick={onUndo}>
            Undo
          </Button>
        </>
      )}

      {status === "sending" && (
        <>
          <CheckCircle2 className="h-4 w-4 animate-pulse text-brand-text" />
          <div className="flex-1 text-[13px] text-foreground">Sending…</div>
        </>
      )}

      {status === "sent" && (
        <>
          <CheckCircle2 className="h-4 w-4 text-status-success" />
          <div className="flex-1 text-[13px] text-foreground">
            Email sent
            <AddedBcc addresses={addedBcc} />
          </div>
          <DismissButton onClick={onDismiss} />
        </>
      )}

      {status === "failed" && (
        <>
          <AlertCircle className="h-4 w-4 text-destructive-text" />
          <div className="flex-1 text-[13px] text-foreground">
            Send failed
            {error && <div className="mt-0.5 text-[11px] text-faint">{error}</div>}
          </div>
          <DismissButton onClick={onDismiss} />
        </>
      )}

      {status === "scheduled" && (
        <>
          <Clock className="h-4 w-4 shrink-0 text-brand-text" />
          <div className="flex-1 text-[13px] text-foreground">
            Scheduled to send
            {scheduledFor && (
              <div className="mt-0.5 text-[11px] text-faint">
                {scheduledFor.toLocaleString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
            )}
            <AddedBcc addresses={addedBcc} />
          </div>
          <DismissButton onClick={onDismiss} />
        </>
      )}

      {status === "cancelled" && (
        <>
          <X className="h-4 w-4 text-faint" />
          <div className="flex-1 text-[13px] text-foreground">Send cancelled — draft restored</div>
          <DismissButton onClick={onDismiss} />
        </>
      )}
    </div>
  );
}

function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={onClick}
      aria-label="Dismiss"
      className="text-faint"
    >
      <X />
    </Button>
  );
}

export function showUndoSendToast(id: string, props: UndoSendCardProps): void {
  toast.custom(() => <UndoSendCard {...props} />, {
    id,
    duration: Number.POSITIVE_INFINITY,
  });
}

export function dismissUndoSendToast(id: string): void {
  toast.dismiss(id);
}
