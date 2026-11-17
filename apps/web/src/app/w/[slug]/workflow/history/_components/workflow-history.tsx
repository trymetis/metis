"use client";

import { Button } from "@metis/ui/components/button";
import { ScrollArea } from "@metis/ui/components/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";
import { cn } from "@metis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { ArrowLeft, History, Loader2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { StatusIcon } from "@/components/workflow-history/run-status";
import { usePollingRefresh } from "@/hooks/use-polling-refresh";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";
import type { WorkflowOutput, WorkflowRun } from "@/server/schema";
import { stepLabel } from "@/workflow/steps";
import { workflowPath } from "@/workspace/path";

const ALL_WORKFLOWS = "all";

export function WorkflowHistoryView() {
  const scope = useWorkspaceScope();
  const workflowsQuery = useQuery(rpc.workflows.list.queryOptions({ input: scope }));
  const workflowsData = workflowsQuery.data;
  const workflows: WorkflowOutput[] = useMemo(
    () => workflowsData?.workflows ?? [],
    [workflowsData],
  );
  const [workflowFilter, setWorkflowFilter] = useState<string>(ALL_WORKFLOWS);
  const runsQuery = useQuery(
    rpc.workflows.runs.queryOptions({
      input:
        workflowFilter === ALL_WORKFLOWS
          ? { ...scope, limit: 100 }
          : { ...scope, workflowId: workflowFilter, limit: 100 },
    }),
  );
  const runs: WorkflowRun[] = runsQuery.data?.runs ?? [];
  const loading = runsQuery.isPending && !runsQuery.isError;

  const filterItems = useMemo(
    () => [
      { value: ALL_WORKFLOWS, label: "All workflows" },
      ...workflows.map((w) => ({ value: w.id, label: w.name })),
    ],
    [workflows],
  );

  usePollingRefresh(async () => {
    await runsQuery.refetch({ cancelRefetch: false });
  });

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-border-soft border-b px-6 py-4">
        <Button
          aria-label="Back to workflows"
          nativeButton={false}
          render={<Link href={workflowPath(scope.workspaceSlug)} />}
          size="icon-sm"
          variant="ghost"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex size-9 items-center justify-center rounded-lg bg-brand-soft">
          <History className="size-4.5 text-brand-text" />
        </div>
        <div className="min-w-40 flex-1">
          <h1 className="font-medium text-foreground text-lg">Workflow activity</h1>
          <p className="text-faint text-xs">
            Every workflow run in this workspace — refreshes automatically.
          </p>
        </div>
        <Select
          items={filterItems}
          value={workflowFilter}
          onValueChange={(v) => {
            if (v) setWorkflowFilter(v);
          }}
        >
          <SelectTrigger className="min-w-44 max-md:w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {filterItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-3xl px-6 py-6">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin opacity-50" />
            </div>
          ) : runs.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-faint">
              No runs recorded yet. Runs appear here once a trigger fires.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {runs.map((run) => {
                const stopping = run.status === "cancelled" && !run.finishedAt;
                return (
                  <li key={run.id}>
                    <Link
                      href={workflowPath(scope.workspaceSlug, `history/${run.id}`)}
                      className="block rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <div className="flex items-center gap-2">
                        <StatusIcon status={stopping ? "running" : run.status} />
                        <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
                          {run.workflowName}
                        </span>
                        <span className="ml-auto shrink-0 text-[11px] text-faint">
                          {formatDistanceToNowStrict(
                            new Date(run.finishedAt ?? run.startedAt ?? run.dueAt),
                            { addSuffix: true },
                          )}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[13px] text-muted-foreground">
                        {stopping ? "stopping" : run.status}
                        {run.attempts > 1 && ` · attempt ${run.attempts}`}
                        {run.upgraded && " · from before the upgrade"}
                      </p>
                      {run.error && (
                        <p className="truncate font-mono text-[11px] text-destructive-text">
                          {run.error}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {run.steps.map((step, i) => (
                          <span
                            // oxlint-disable-next-line react/no-array-index-key --steps are positional per run
                            key={`${step.nodeId}-${i}`}
                            title={step.detail ?? step.status}
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[11px]",
                              step.status === "completed"
                                ? "border-border bg-panel text-muted-foreground"
                                : step.status === "skipped" || step.status === "waiting"
                                  ? "border-border-soft bg-panel text-faint"
                                  : "border-destructive/40 bg-destructive/10 text-destructive-text",
                            )}
                          >
                            {stepLabel(step.step)}
                            {step.count > 1 && ` ×${step.count}`}
                            {step.status === "unknown" && " ?"}
                            {step.status === "failed" && " ✕"}
                            {step.status === "waiting" && " …"}
                          </span>
                        ))}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
