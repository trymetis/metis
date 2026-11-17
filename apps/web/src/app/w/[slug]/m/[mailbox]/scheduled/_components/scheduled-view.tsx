"use client";

import { Button } from "@metis/ui/components/button";
import { ScrollArea } from "@metis/ui/components/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock, Loader2, RefreshCw, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MobileAsideTrigger } from "@/components/mobile-aside";
import { usePollingRefresh } from "@/hooks/use-polling-refresh";
import { useMailboxScope } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import { formatRelativeDate } from "@/lib/utils";
import type { ScheduledSendItem } from "@/server/schema";

import { CLOSE_REASON_LABELS, ResolveSendDialog } from "./resolve-send-dialog";

type ScheduledItem = ScheduledSendItem;

export function ScheduledView() {
  const scope = useMailboxScope();
  const scheduledOptions = rpc.mail.scheduledSend.list.queryOptions({ input: scope });
  const query = useQuery(scheduledOptions);
  const items: ScheduledItem[] = query.data?.scheduled ?? [];
  const [reloading, setReloading] = useState(false);
  const loading = query.isPending || reloading;

  async function load() {
    setReloading(true);
    try {
      await refreshQuery(scheduledOptions.queryKey);
    } finally {
      setReloading(false);
    }
  }

  usePollingRefresh(async () => {
    await query.refetch({ cancelRefetch: false });
  }, 30_000);

  async function cancel(id: string) {
    await orpc.mail.scheduledSend.cancel({ ...scope, id });
    await load();
  }

  async function retry(id: string) {
    try {
      const result = await orpc.mail.scheduledSend.retry({ ...scope, id });
      toast.success(result.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That message could not be retried");
    }
    await load();
  }

  const pending = items.filter((i) => i.status === "pending");
  const processing = items.filter((i) => i.status === "running");
  const past = items.filter((i) => i.status !== "pending" && i.status !== "running");

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center gap-3 border-b px-7 py-4 border-border-soft">
        <MobileAsideTrigger className="-ml-1.5 size-8 shrink-0" />
        <Clock className="h-4 w-4 text-brand-text" />
        <h1 className="text-[24px] tracking-tight text-foreground">Scheduled</h1>
        <span className="text-xs text-faint">{pending.length} queued</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={load}
          className="ml-auto text-faint"
          aria-label="Refresh"
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-3xl px-6 py-6 md:px-10 md:py-8">
          {loading && items.length === 0 ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  // oxlint-disable-next-line react/no-array-index-key --static skeleton placeholders
                  key={i}
                  className="h-20 animate-pulse rounded-lg bg-hover"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-faint">
              <Clock className="h-10 w-10 opacity-30" />
              <p className="text-base tracking-tight">No scheduled emails</p>
              <p className="text-xs">When you schedule a send, it'll appear here.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {pending.length > 0 && (
                <section>
                  <h2 className="mb-3 text-[11px] uppercase tracking-[1.5px] text-faint">
                    Pending ({pending.length})
                  </h2>
                  <div className="space-y-2">
                    {pending.map((item) => (
                      <ScheduledRow
                        key={item.id}
                        item={item}
                        onCancel={item.sent ? undefined : () => cancel(item.id)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {processing.length > 0 && (
                <section>
                  <h2 className="mb-3 text-[11px] uppercase tracking-[1.5px] text-faint">
                    Sending ({processing.length})
                  </h2>
                  <div className="space-y-2">
                    {processing.map((item) => (
                      <ScheduledRow key={item.id} item={item} />
                    ))}
                  </div>
                </section>
              )}

              {past.length > 0 && (
                <section>
                  <h2 className="mb-3 text-[11px] uppercase tracking-[1.5px] text-faint">
                    History ({past.length})
                  </h2>
                  <div className="space-y-2">
                    {past.map((item) => (
                      <ScheduledRow
                        key={item.id}
                        item={item}
                        onRetry={retryable(item) ? () => retry(item.id) : undefined}
                        onResolved={item.unconfirmed ? load : undefined}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function retryable(item: ScheduledItem): boolean {
  if (item.unconfirmed || item.resolution?.outcome === "closed") return false;
  if (item.status === "partial") return item.sent;
  return item.status === "failed" || item.status === "blocked";
}

function ScheduledRow({
  item,
  onCancel,
  onRetry,
  onResolved,
}: {
  item: ScheduledItem;
  onCancel?: () => void;
  onRetry?: () => void;
  onResolved?: () => void;
}) {
  const when = new Date(item.scheduledFor);
  const statusPalette = (() => {
    if (item.unconfirmed) {
      return {
        label: "Delivery unconfirmed",
        color: "var(--status-danger)",
        bg: "color-mix(in srgb, var(--status-danger) 12%, transparent)",
        icon: AlertCircle,
      };
    }
    if (item.resolution?.outcome === "closed") {
      return {
        label: "Closed — not resent",
        color: "var(--text-secondary)",
        bg: "var(--bg-hover)",
        icon: X,
      };
    }
    switch (item.status) {
      case "pending":
        return {
          label: item.sent ? "Sent — retrying follow-up" : "Scheduled",
          color: "var(--brand-on-tint)",
          bg: "var(--brand-soft)",
          icon: Loader2,
        };
      case "running":
        return {
          label: "Sending",
          color: "var(--brand-on-tint)",
          bg: "var(--brand-soft)",
          icon: Loader2,
        };
      case "completed":
        return {
          label: "Sent",
          color: "var(--status-success)",
          bg: "color-mix(in srgb, var(--status-success) 12%, transparent)",
          icon: CheckCircle2,
        };
      case "partial":
        return {
          label: item.sent ? "Sent — label not applied" : "Delivery unconfirmed",
          color: "var(--status-danger)",
          bg: "color-mix(in srgb, var(--status-danger) 12%, transparent)",
          icon: AlertCircle,
        };
      case "blocked":
        return {
          label: "Blocked",
          color: "var(--status-danger)",
          bg: "color-mix(in srgb, var(--status-danger) 12%, transparent)",
          icon: AlertCircle,
        };
      case "failed":
        return {
          label: item.sent ? "Sent — follow-up failed" : "Couldn't send",
          color: "var(--status-danger)",
          bg: "color-mix(in srgb, var(--status-danger) 12%, transparent)",
          icon: AlertCircle,
        };
      default:
        return {
          label: "Canceled",
          color: "var(--text-secondary)",
          bg: "var(--bg-hover)",
          icon: X,
        };
    }
  })();
  const StatusIcon = statusPalette.icon;

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-lg border p-4 transition-colors bg-surface border-border">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: statusPalette.bg }}
      >
        <StatusIcon
          className={`h-4 w-4 ${item.status === "pending" || item.status === "running" ? "animate-pulse" : ""}`}
          style={{ color: statusPalette.color }}
        />
      </div>

      <div className="min-w-48 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <span
            className="text-[11px] font-medium uppercase tracking-wide"
            style={{ color: statusPalette.color }}
          >
            {statusPalette.label}
          </span>
          <span className="text-[11px] text-faint">
            ·{" "}
            {when.toLocaleString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            ({formatRelativeDate(when.toISOString())})
          </span>
        </div>

        <div className="mt-1.5 text-[13px] font-medium text-foreground">
          {item.payload?.subject || item.subject || "(no subject)"}
        </div>
        <div className="mt-0.5 truncate text-[12px] text-faint">
          To: {item.payload?.to.join(", ") ?? "—"}
        </div>
        {item.error && (
          <div className="mt-0.5 truncate font-mono text-[11px] text-destructive-text">
            {item.error}
          </div>
        )}
        {item.resolution && (
          <div className="mt-0.5 text-[11px] text-faint">
            {item.resolution.outcome === "verified"
              ? `Delivery confirmed from the Sent folder by ${item.resolution.resolvedByName}`
              : `Closed by ${item.resolution.resolvedByName}${item.resolution.reason ? ` — ${CLOSE_REASON_LABELS[item.resolution.reason]}` : ""}${item.resolution.note ? `: ${item.resolution.note}` : ""}`}{" "}
            · {formatRelativeDate(new Date(item.resolution.resolvedAt).toISOString())}
          </div>
        )}
        {!item.scheduledByMe && (
          <div className="mt-0.5 text-[11px] text-faint">Scheduled by {item.scheduledByName}</div>
        )}
      </div>

      {onCancel && (
        <Button
          variant="outline"
          size="xs"
          onClick={onCancel}
          className="shrink-0 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive-text dark:hover:bg-destructive/10"
        >
          Cancel
        </Button>
      )}
      {onResolved && <ResolveSendDialog item={item} onDone={onResolved} />}
      {onRetry && (
        <Button
          variant="outline"
          size="xs"
          onClick={onRetry}
          title={
            item.sent
              ? "Retry only the steps after the send — the message is not sent again"
              : "Retry the steps that failed"
          }
          className="shrink-0 text-[11px] text-muted-foreground"
        >
          <RotateCcw className="size-3" />
          {item.sent ? "Retry follow-up" : "Retry"}
        </Button>
      )}
    </div>
  );
}
