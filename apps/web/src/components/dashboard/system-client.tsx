"use client";

import { Button } from "@metis/ui/components/button";
import { type QueryKey, useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import type {
  DashboardSystemCheck,
  DashboardSystemCheckInput,
  SystemCheckStatus,
  SystemTone,
} from "@/server/schema";

import { useDashboardRole } from "./dashboard-role";
import { Mono, Section, ToneBadge } from "./system-ui";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function useSystemResource<T, E extends Error, K extends QueryKey>(
  options: UseQueryOptions<T, E, T, K>,
  fallback = "Could not load system info",
): [T | null, () => Promise<void>] {
  const query = useQuery(options);
  const error = query.error;

  useEffect(() => {
    if (error) toast.error(errorMessage(error, fallback));
  }, [error, fallback]);

  const { queryKey } = options;
  const reload = useCallback(async () => {
    await refreshQuery(queryKey);
  }, [queryKey]);

  return [query.data ?? null, reload];
}

export function useSystemData<T, E extends Error, K extends QueryKey>(
  options: UseQueryOptions<T, E, T, K>,
  fallback?: string,
): T | null {
  return useSystemResource(options, fallback)[0];
}

export function Loading() {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="py-6 text-center">
        <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
      </div>
    </section>
  );
}

const STATUS_BADGE: Record<SystemCheckStatus, { tone: SystemTone; label: string }> = {
  ok: { tone: "ok", label: "OK" },
  warning: { tone: "warning", label: "Warning" },
  failed: { tone: "danger", label: "Failed" },
  skipped: { tone: "off", label: "Skipped" },
};

export function CheckResults({ check }: { check: DashboardSystemCheck }) {
  return (
    <div className="divide-y divide-border">
      {check.results.map((result) => {
        const badge = STATUS_BADGE[result.status];
        return (
          <div key={`${result.server ?? ""}:${result.label}`} className="py-1.5">
            <div className="flex items-center justify-between gap-4">
              <span className="min-w-0 truncate text-[13px] text-muted-foreground">
                {result.server ? `${result.server} · ` : ""}
                {result.label}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {result.latencyMs !== null && <Mono>{result.latencyMs} ms</Mono>}
                <ToneBadge tone={badge.tone}>{badge.label}</ToneBadge>
              </span>
            </div>
            {result.message && (
              <p className="mt-0.5 text-[11px] break-words text-faint">{result.message}</p>
            )}
          </div>
        );
      })}
      <p className="pt-2 text-[11px] text-faint">
        Checked {new Date(check.checkedAt).toLocaleTimeString()}
      </p>
    </div>
  );
}

function overall(check: DashboardSystemCheck): SystemCheckStatus {
  const statuses = check.results.map((result) => result.status);
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("warning")) return "warning";
  if (statuses.every((status) => status === "skipped")) return "skipped";
  return "ok";
}

export function HealthCheck({
  input,
  description,
}: {
  input: DashboardSystemCheckInput;
  description: string;
}) {
  const [check, setCheck] = useState<DashboardSystemCheck | null>(null);
  const [running, setRunning] = useState(false);
  const { canOperate } = useDashboardRole();

  async function run() {
    setRunning(true);
    try {
      setCheck(await orpc.dashboard.system.check(input));
    } catch (err) {
      toast.error(errorMessage(err, "The check could not run"));
    } finally {
      setRunning(false);
    }
  }

  const summary = check ? STATUS_BADGE[overall(check)] : null;

  return (
    <Section
      title="Health"
      description={description}
      badge={
        <div className="flex shrink-0 items-center gap-2">
          {summary && <ToneBadge tone={summary.tone}>{summary.label}</ToneBadge>}
          {canOperate && (
            <Button variant="outline" size="sm" onClick={run} disabled={running}>
              {running ? <Loader2 className="animate-spin" /> : <RefreshCw strokeWidth={1.75} />}
              {check ? "Re-check" : "Run check"}
            </Button>
          )}
        </div>
      }
    >
      {check === null ? (
        <p className="py-1 text-[13px] text-faint">
          {running
            ? "Checking…"
            : canOperate
              ? "Not checked yet. Checks contact the real service, so they run only when asked."
              : "Not checked yet. The instance owner and admins can run checks."}
        </p>
      ) : (
        <CheckResults check={check} />
      )}
    </Section>
  );
}
