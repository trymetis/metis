"use client";

import { Button } from "@metis/ui/components/button";
import { ScrollArea } from "@metis/ui/components/scroll-area";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Loader2, Moon, X } from "lucide-react";
import { useState } from "react";

import { MobileAsideTrigger } from "@/components/mobile-aside";
import { usePollingRefresh } from "@/hooks/use-polling-refresh";
import { useMailboxScope } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import { formatRelativeDate } from "@/lib/utils";

const SETTLING_POLL_MS = 2_000;

interface SnoozedEmail {
  id: string;
  threadId?: string;
  from: string;
  fromName?: string;
  subject: string;
  snippet: string;
  date: string;
  scheduleId: string;
  wakeAt: string;
  status: string;
  error: string | null;
}

function formatWake(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate();
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (sameDay) return `Today at ${time}`;
  if (isTomorrow) return `Tomorrow at ${time}`;
  return `${date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at ${time}`;
}

export function SnoozedView() {
  const scope = useMailboxScope();
  const queryClient = useQueryClient();
  const snoozed = rpc.mail.messages.listSnoozed;
  const query = useQuery(
    snoozed.queryOptions({
      input: scope,
      refetchInterval: (q) =>
        q.state.data?.emails.some((e) => e.status === "running") ? SETTLING_POLL_MS : false,
    }),
  );
  const emails: SnoozedEmail[] = query.data?.emails ?? [];
  const loading = query.isPending && !query.isError;
  const loadError =
    query.error && !query.data ? query.error.message || "Could not load snoozed mail" : null;
  const [actioning, setActioning] = useState<string | null>(null);

  usePollingRefresh(async () => {
    await query.refetch({ cancelRefetch: false });
  });

  function drop(messageId: string) {
    queryClient.setQueryData(snoozed.queryKey({ input: scope }), (old) =>
      old ? { ...old, emails: old.emails.filter((e) => e.id !== messageId) } : old,
    );
  }

  async function cancelSnooze(messageId: string) {
    setActioning(messageId);
    try {
      await orpc.mail.messages.cancelSnooze({ ...scope, id: messageId });
      drop(messageId);
    } finally {
      setActioning(null);
    }
  }

  async function wakeNow(messageId: string) {
    setActioning(messageId);
    try {
      await orpc.mail.messages.unsnooze({ ...scope, id: messageId });
      drop(messageId);
    } finally {
      setActioning(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-soft px-6 py-4">
        <MobileAsideTrigger className="-ml-1.5 size-8 shrink-0" />
        <Moon className="h-4 w-4 text-primary" strokeWidth={1.8} />
        <h1 className="text-[18px] font-medium tracking-tight">Snoozed</h1>
        <span className="text-[12px] text-faint">{emails.length} pending</span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-6 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin opacity-50" />
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-border bg-surface px-6 py-12 text-center">
              <p className="text-[14px] text-destructive-text">{loadError}</p>
            </div>
          ) : emails.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface px-6 py-12 text-center">
              <Moon className="mx-auto mb-3 h-8 w-8 opacity-30" strokeWidth={1.5} />
              <p className="text-[14px] text-faint">
                Nothing snoozed. Use the Snooze button on any email to hide it until later — it'll
                come back to the folder it was in at the time you pick.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {emails.map((e) => (
                <div
                  key={e.scheduleId}
                  className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-foreground">
                        {e.fromName || e.from}
                      </span>
                      <span className="ml-auto shrink-0 text-[11px] tabular-nums text-faint">
                        {formatRelativeDate(e.date)}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[13px] text-foreground">{e.subject}</div>
                    <div className="mt-0.5 truncate text-[12px] text-faint">{e.snippet}</div>
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-primary">
                      <Moon className="h-3 w-3" strokeWidth={2} />
                      {e.status === "pending"
                        ? `Returns ${formatWake(e.wakeAt)}`
                        : `Wake-up ${e.status}`}
                    </div>
                    {e.error && (
                      <div className="mt-0.5 truncate font-mono text-[11px] text-destructive-text">
                        {e.error}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col gap-1.5">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => wakeNow(e.id)}
                      disabled={actioning === e.id}
                      className="text-[11px] text-muted-foreground hover:bg-hover disabled:opacity-50 dark:hover:bg-hover"
                    >
                      <Inbox className="h-3 w-3" />
                      Wake now
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => cancelSnooze(e.id)}
                      disabled={actioning === e.id}
                      className="text-[11px] text-faint hover:bg-hover disabled:opacity-50 dark:hover:bg-hover"
                    >
                      <X className="h-3 w-3" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
