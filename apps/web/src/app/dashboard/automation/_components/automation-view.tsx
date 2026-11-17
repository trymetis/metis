"use client";

import { Badge } from "@metis/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@metis/ui/components/card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@metis/ui/components/table";
import { cn } from "@metis/ui/lib/utils";
import { Loader2 } from "lucide-react";

import { ScrollTable } from "@/components/dashboard/scroll-table";
import { useSystemData } from "@/components/dashboard/system-client";
import { rpc } from "@/lib/orpc";
import type { DashboardAutomation, DashboardRunner, DashboardRunnerStatus } from "@/server/schema";

const number = new Intl.NumberFormat("en-US");

const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function StatRow({
  cards,
}: {
  cards: { label: string; hint: string; value?: number; alert?: boolean }[];
}) {
  return (
    <div
      className={cn(
        "grid gap-2 sm:grid-cols-2",
        cards.length > 3 ? "lg:grid-cols-4" : "lg:grid-cols-3",
      )}
    >
      {cards.map((card) => (
        <Card key={card.label} size="sm">
          <CardHeader>
            <CardTitle className="text-[13px] font-medium text-muted-foreground">
              {card.label}
            </CardTitle>
            <CardDescription className="text-[11px] text-faint">{card.hint}</CardDescription>
          </CardHeader>
          <CardContent>
            {card.value === undefined ? (
              <Loader2 className="h-4 w-4 animate-spin opacity-50" />
            ) : (
              <span
                className={cn(
                  "text-[28px] leading-none font-medium tracking-tight tabular-nums",
                  card.alert && card.value > 0 ? "text-destructive-text" : "text-foreground",
                )}
              >
                {number.format(card.value)}
              </span>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function duration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}

function since(iso: string | null): string {
  if (!iso) return "Never";
  return `${duration(Math.max(0, Date.now() - new Date(iso).getTime()))} ago`;
}

const RUNNER_STATUS: Record<
  DashboardRunnerStatus,
  {
    label: string;
    hint: string;
    variant: "secondary" | "outline" | "destructive";
  }
> = {
  never: {
    label: "No tick yet",
    hint: "The runner has never completed a tick. Start the worker, point cron at the tick endpoint, or check the app's startup log (internal).",
    variant: "outline",
  },
  failing: {
    label: "Failing",
    hint: "The last tick ended with an infrastructure error.",
    variant: "destructive",
  },
  delayed: {
    label: "Delayed",
    hint: "Ticks or due work are running later than the cadence allows.",
    variant: "destructive",
  },
  busy: {
    label: "Working",
    hint: "Ticks are on time and due work is being drained.",
    variant: "secondary",
  },
  idle: {
    label: "Idle",
    hint: "Ticks are on time and nothing is due.",
    variant: "secondary",
  },
};

function Fact({
  label,
  value,
  hint,
  alert,
}: {
  label: string;
  value: string;
  hint?: string;
  alert?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2">
      <span className="text-[11px] text-faint">{label}</span>
      <span
        className={cn(
          "text-[13px] font-medium tabular-nums",
          alert ? "text-destructive-text" : "text-foreground",
        )}
      >
        {value}
      </span>
      {hint ? <span className="text-[11px] text-faint">{hint}</span> : null}
    </div>
  );
}

function RunnerHealth({ runner }: { runner: DashboardRunner | undefined }) {
  if (!runner) {
    return (
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-[13px] font-medium text-foreground">Runner</h2>
        <div className="py-6 text-center">
          <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
        </div>
      </section>
    );
  }

  const status = RUNNER_STATUS[runner.status];

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[13px] font-medium text-foreground">Runner</h2>
        <Badge variant={status.variant}>{status.label}</Badge>
        <span className="font-mono text-[11px] text-faint">
          {runner.driver} · every {duration(runner.cadenceSec * 1000)} ·{" "}
          {duration(runner.tickBudgetMs)} budget
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-faint">{status.hint}</p>
      {runner.lastError && runner.status === "failing" ? (
        <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 font-mono text-[11px] text-destructive-text">
          {runner.lastError}
        </p>
      ) : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Fact
          label="Last successful tick"
          value={since(runner.lastSuccessAt)}
          hint={
            runner.lastTickAt && runner.lastTickAt !== runner.lastSuccessAt
              ? `Last attempt ${since(runner.lastTickAt)}`
              : undefined
          }
          alert={runner.status === "failing" || runner.status === "delayed"}
        />
        <Fact
          label="Last discovery"
          value={since(runner.lastDiscoveryAt)}
          hint={
            runner.nextCheckAt
              ? `Next check ${dateTime.format(new Date(runner.nextCheckAt))}`
              : undefined
          }
        />
        <Fact
          label="Discovery lag"
          value={runner.discoveryLagMs === null ? "None" : duration(runner.discoveryLagMs)}
          hint={`${number.format(runner.dueTriggers)} triggers due · ${number.format(runner.triggerErrors)} erroring`}
          alert={runner.triggerErrors > 0}
        />
        <Fact
          label="Backlog"
          value={number.format(runner.backlog)}
          hint={
            runner.backlogAgeMs === null
              ? "Nothing due"
              : `Oldest due ${duration(runner.backlogAgeMs)} ago`
          }
        />
        <Fact
          label="Waiting to retry"
          value={number.format(runner.held)}
          hint="Queued again after a failed attempt"
        />
        <Fact
          label="Blocked"
          value={number.format(runner.blocked)}
          hint="Held on lost access, or ended blocked in 7 days"
          alert={runner.blocked > 0}
        />
        <Fact
          label="Unconfirmed sends"
          value={number.format(runner.unknown)}
          hint="Awaiting a person to resolve"
          alert={runner.unknown > 0}
        />
      </div>
    </section>
  );
}

export function AutomationView() {
  const data: DashboardAutomation | null = useSystemData(
    rpc.dashboard.automation.queryOptions(),
    "Could not load automation",
  );

  return (
    <div className="flex flex-col gap-2">
      <RunnerHealth runner={data?.runner} />

      <StatRow
        cards={[
          {
            label: "Workflows",
            hint:
              data === null
                ? "Across every workspace"
                : `${number.format(data.workflows.enabled)} enabled`,
            value: data?.workflows.total,
          },
          {
            label: "Runs, 24h",
            hint: "Messages a workflow touched",
            value: data?.workflows.runs24h,
          },
          {
            label: "Runs, 7 days",
            hint: "Same, over the week",
            value: data?.workflows.runs7d,
          },
          {
            label: "Failures, 7 days",
            hint: "Runs that did not complete",
            value: data?.workflows.failures7d,
            alert: true,
          },
        ]}
      />

      <StatRow
        cards={[
          {
            label: "Queued",
            hint:
              data === null
                ? "Snoozes and scheduled sends"
                : `${number.format(data.scheduled.pendingSnoozes)} snoozes, ${number.format(data.scheduled.pendingSends)} sends`,
            value: data?.scheduled.pending,
          },
          {
            label: "Completed",
            hint: "All time",
            value: data?.scheduled.completed,
          },
          {
            label: "Failed",
            hint: "All time",
            value: data?.scheduled.failed,
            alert: true,
          },
        ]}
      />

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-[13px] font-medium text-foreground">Recent runs</h2>
        <p className="mt-0.5 text-[11px] text-faint">
          The last {data?.recentRuns.length ?? 10} workflow executions.
        </p>
        <div className="mt-3">
          {data === null ? (
            <div className="py-6 text-center">
              <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
            </div>
          ) : data.recentRuns.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-faint">No workflow has run yet.</p>
          ) : (
            <ScrollTable className="text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="text-right">Ran</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentRuns.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-foreground">{row.workflowName}</TableCell>
                    <TableCell className="max-w-64">
                      <span className="block truncate">{row.kind}</span>
                    </TableCell>
                    <TableCell title={row.error ?? undefined}>
                      {row.status === "completed" ? (
                        <Badge variant="secondary">OK</Badge>
                      ) : row.status === "pending" || row.status === "running" ? (
                        <Badge variant="outline">{row.status}</Badge>
                      ) : (
                        <Badge variant="destructive">{row.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-faint">
                      {dateTime.format(new Date(row.ranAt))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </ScrollTable>
          )}
        </div>
      </section>
    </div>
  );
}
