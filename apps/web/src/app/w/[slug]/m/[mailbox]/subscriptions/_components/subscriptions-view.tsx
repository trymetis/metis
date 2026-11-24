"use client";

import { Button } from "@metis/ui/components/button";
import { ScrollArea } from "@metis/ui/components/scroll-area";
import { cn } from "@metis/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  BellOff,
  Check,
  ExternalLink,
  Loader2,
  MailX,
  RefreshCw,
} from "lucide-react";
import { useMemo, useState } from "react";

import { MobileAsideTrigger } from "@/components/mobile-aside";
import { useMailboxScope } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import { formatRelativeDate } from "@/lib/utils";
import type { UnsubscribeMethod, UnsubscribeStatus } from "@/types/mail";

interface SubscriptionSender {
  senderEmail: string;
  senderName?: string;
  messageId: string;
  count: number;
  latestDate: string;
  latestSubject: string;
  methods: UnsubscribeMethod[];
  unsubscribedStatus?: UnsubscribeStatus;
}

interface UnsubscribeResult {
  senderEmail: string;
  status: UnsubscribeStatus;
  method?: UnsubscribeMethod;
  url?: string;
  error?: string;
}

const NO_SENDERS: SubscriptionSender[] = [];

type SenderSortKey = "sender" | "count" | "latest";
interface SenderSort {
  key: SenderSortKey;
  dir: "asc" | "desc";
}

function sortSenders<
  T extends { senderName?: string; senderEmail: string; count: number; latestDate: string },
>(senders: readonly T[], sort: SenderSort): T[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return senders.toSorted((a, b) => {
    if (sort.key === "count") return sign * (a.count - b.count);
    if (sort.key === "latest") return sign * (Date.parse(a.latestDate) - Date.parse(b.latestDate));
    return sign * (a.senderName || a.senderEmail).localeCompare(b.senderName || b.senderEmail);
  });
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SenderSortKey;
  sort: SenderSort;
  onSort: (sort: SenderSort) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      className={cn("pb-2 font-medium", className)}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() =>
          onSort({
            key: sortKey,
            dir: active
              ? sort.dir === "asc"
                ? "desc"
                : "asc"
              : sortKey === "sender"
                ? "asc"
                : "desc",
          })
        }
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        {active &&
          (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );
}

const METHOD_LABEL: Record<UnsubscribeMethod, string> = {
  one_click: "Automatic",
  mailto: "We'll email them",
  link: "Finish on their site",
};

export function SubscriptionsView() {
  const scope = useMailboxScope();
  const queryClient = useQueryClient();
  const subscriptions = rpc.mail.subscriptions.list;
  const query = useQuery(subscriptions.queryOptions({ input: scope }));
  const senders: SubscriptionSender[] = query.data?.senders ?? NO_SENDERS;
  const scanned = query.data?.scanned ?? 0;
  const loading = query.isFetching;
  const error = query.error ? query.error.message || "Failed to scan subscriptions" : null;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<SenderSort>({ key: "count", dir: "desc" });

  function load() {
    setSelected(new Set());
    void refreshQuery(subscriptions.queryKey({ input: scope }));
  }

  const pending = senders.filter((s) => s.unsubscribedStatus !== "done");
  const selectable = pending.filter(
    (s) => s.unsubscribedStatus !== "manual" && !working.has(s.senderEmail),
  );
  const sorted = useMemo(() => sortSenders(senders, sort), [senders, sort]);
  const allSelected = selectable.length > 0 && selectable.every((s) => selected.has(s.senderEmail));

  function toggle(senderEmail: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(senderEmail)) next.delete(senderEmail);
      else next.add(senderEmail);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map((s) => s.senderEmail)));
  }

  function applyResults(results: UnsubscribeResult[]) {
    const byEmail = new Map(results.map((r) => [r.senderEmail, r]));
    queryClient.setQueryData(subscriptions.queryKey({ input: scope }), (old) =>
      old
        ? {
            ...old,
            senders: old.senders.map((s) => {
              const r = byEmail.get(s.senderEmail);
              if (!r) return s;
              return { ...s, unsubscribedStatus: r.status };
            }),
          }
        : old,
    );
    setErrors((prev) => {
      const next = { ...prev };
      for (const r of results) {
        if (r.status === "failed" && r.error) next[r.senderEmail] = r.error;
        else delete next[r.senderEmail];
      }
      return next;
    });
    for (const r of results) {
      if (r.status === "manual" && r.url) {
        window.open(r.url, "_blank", "noopener,noreferrer");
      }
    }
  }

  async function unsubscribe(targets: SubscriptionSender[]) {
    if (targets.length === 0) return;
    const emails = targets.map((t) => t.senderEmail);
    setWorking((prev) => new Set([...prev, ...emails]));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const e of emails) next.delete(e);
      return next;
    });
    try {
      for (let i = 0; i < targets.length; i += 25) {
        const batch = targets.slice(i, i + 25);
        // oxlint-disable-next-line eslint/no-await-in-loop -- one batch of 25 at a time keeps a large selection from flooding the provider
        const data = await orpc.mail.subscriptions.unsubscribe({
          ...scope,
          items: batch.map((t) => ({
            senderEmail: t.senderEmail,
            messageId: t.messageId,
          })),
        });
        applyResults(data.results ?? []);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unsubscribe failed";
      setErrors((prev) => {
        const next = { ...prev };
        for (const e of emails) next[e] = message;
        return next;
      });
    } finally {
      setWorking((prev) => {
        const next = new Set(prev);
        for (const e of emails) next.delete(e);
        return next;
      });
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border-soft px-6 py-4">
        <MobileAsideTrigger className="-ml-1.5 size-8 shrink-0" />
        <MailX className="h-4 w-4 text-primary" strokeWidth={1.8} />
        <h1 className="text-[18px] font-medium tracking-tight">Subscriptions</h1>
        {!loading && (
          <span className="text-[12px] text-faint max-md:order-last max-md:w-full">
            {senders.length} {senders.length === 1 ? "sender" : "senders"} found in your latest{" "}
            {scanned} inbox emails
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && (
            <Button
              size="sm"
              onClick={() => unsubscribe(senders.filter((s) => selected.has(s.senderEmail)))}
            >
              <BellOff className="h-3.5 w-3.5" />
              Unsubscribe ({selected.size})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="text-[12px] text-muted-foreground"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Rescan
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-6 py-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader2 className="h-5 w-5 animate-spin opacity-50" />
              <p className="text-[13px] text-faint">Scanning your inbox for mailing lists…</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-border bg-surface px-6 py-12 text-center">
              <p className="text-[14px] text-faint">{error}</p>
            </div>
          ) : senders.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface px-6 py-12 text-center">
              <MailX className="mx-auto mb-3 h-8 w-8 opacity-30" strokeWidth={1.5} />
              <p className="text-[14px] text-faint">
                No mailing lists found in your recent inbox. Newsletters and promotional senders
                with an unsubscribe option will show up here.
              </p>
            </div>
          ) : (
            <table className="w-full table-fixed border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-medium text-faint">
                  <th className="w-8 pb-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all senders"
                      className="size-3.5 accent-brand"
                    />
                  </th>
                  <SortHeader label="Sender" sortKey="sender" sort={sort} onSort={setSort} />
                  <SortHeader
                    label="Emails"
                    sortKey="count"
                    sort={sort}
                    onSort={setSort}
                    className="w-20 text-right"
                  />
                  <SortHeader
                    label="Last received"
                    sortKey="latest"
                    sort={sort}
                    onSort={setSort}
                    className="w-32 max-md:hidden"
                  />
                  <th className="w-28 pb-2 font-medium max-md:hidden">Method</th>
                  <th className="w-32 pb-2" aria-label="Action" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => {
                  const isWorking = working.has(s.senderEmail);
                  const done = s.unsubscribedStatus === "done";
                  const manual = s.unsubscribedStatus === "manual";
                  const rowError = errors[s.senderEmail];
                  // oxlint-disable-next-line typescript/no-non-null-assertion --mail/subscriptions.ts omits senders with zero methods
                  const primaryMethod = s.methods[0]!;
                  return (
                    <tr
                      key={s.senderEmail}
                      className={cn("border-b border-border-soft align-top", done && "opacity-60")}
                    >
                      <td className="py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(s.senderEmail)}
                          onChange={() => toggle(s.senderEmail)}
                          disabled={done || manual || isWorking}
                          className="mt-0.5 size-3.5 accent-brand"
                          aria-label={`Select ${s.senderName || s.senderEmail}`}
                        />
                      </td>
                      <td className="min-w-0 py-2.5 pr-3">
                        <div
                          className="truncate font-medium text-foreground"
                          title={`${s.senderEmail}\nLatest: ${s.latestSubject}`}
                        >
                          {s.senderName || s.senderEmail}
                        </div>
                        {rowError && (
                          <div className="mt-0.5 text-[11px] text-destructive-text">{rowError}</div>
                        )}
                        {manual && (
                          <div className="mt-0.5 text-[11px] text-primary">
                            We opened their unsubscribe page. Finish it there.
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">
                        {s.count}
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums text-faint max-md:hidden">
                        {formatRelativeDate(s.latestDate)}
                      </td>
                      <td className="py-2.5 pr-3 text-[12px] text-faint max-md:hidden">
                        {METHOD_LABEL[primaryMethod]}
                      </td>
                      <td className="py-2 text-right">
                        {done ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-primary">
                            <Check className="size-3" strokeWidth={2.5} />
                            Unsubscribed
                          </span>
                        ) : isWorking ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-faint">
                            <Loader2 className="size-3 animate-spin" />
                            Working…
                          </span>
                        ) : (
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => unsubscribe([s])}
                            className="text-[11px] text-muted-foreground"
                          >
                            {primaryMethod === "link" ? (
                              <ExternalLink className="size-3" />
                            ) : (
                              <BellOff className="size-3" />
                            )}
                            {manual ? "Open again" : "Unsubscribe"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
