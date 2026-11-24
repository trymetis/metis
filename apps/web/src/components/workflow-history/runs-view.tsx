"use client";

import { Button } from "@metis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import { ScrollArea } from "@metis/ui/components/scroll-area";
import { cn } from "@metis/ui/lib/utils";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { ArrowLeft, ChevronDown, History, Loader2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { StatusIcon } from "@/components/workflow-history/run-status";
import { usePollingRefresh } from "@/hooks/use-polling-refresh";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";
import type { WorkflowOutput, WorkflowRun } from "@/server/schema";
import type { RunStatus } from "@/workflow/schema";
import { stepLabel } from "@/workflow/steps";
import { workflowEditPath, workflowPath, workflowRunPath } from "@/workspace/path";

const PAGE_SIZE = 50;

const STATUS_FILTERS: { key: string; label: string; statuses: RunStatus[] | null }[] = [
  { key: "all", label: "All", statuses: null },
  { key: "failed", label: "Failed", statuses: ["failed", "blocked", "partial"] },
  { key: "waiting", label: "Waiting", statuses: ["waiting"] },
  { key: "running", label: "Running", statuses: ["pending", "running"] },
  { key: "completed", label: "Completed", statuses: ["completed"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
];

const NO_WORKFLOWS: WorkflowOutput[] = [];

function WorkflowFilter({
  workflows,
  chosen,
  onChange,
}: {
  workflows: readonly WorkflowOutput[];
  chosen: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const label =
    chosen.length === 0
      ? "All workflows"
      : chosen.length === 1
        ? (workflows.find((w) => w.id === chosen[0])?.name ?? "1 workflow")
        : `${chosen.length} workflows`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="max-w-56 max-md:w-full">
            <span className="truncate">{label}</span>
            <ChevronDown className="size-3.5" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
        <DropdownMenuItem onClick={() => onChange([])}>All workflows</DropdownMenuItem>
        <DropdownMenuSeparator />
        {workflows.map((w) => (
          <DropdownMenuCheckboxItem
            key={w.id}
            checked={chosen.includes(w.id)}
            closeOnClick={false}
            onCheckedChange={(on) =>
              onChange(on ? [...chosen, w.id] : chosen.filter((id) => id !== w.id))
            }
          >
            <span className="truncate">{w.name}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RunRow({ run, href }: { run: WorkflowRun; href: ReturnType<typeof workflowRunPath> }) {
  const stopping = run.status === "cancelled" && !run.finishedAt;
  return (
    <li>
      <Link
        href={href}
        className="block rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <div className="flex items-center gap-2">
          <StatusIcon status={stopping ? "running" : run.status} />
          <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
            {run.workflowName}
          </span>
          <span className="ml-auto shrink-0 text-[11px] text-faint">
            {formatDistanceToNowStrict(new Date(run.finishedAt ?? run.startedAt ?? run.dueAt), {
              addSuffix: true,
            })}
          </span>
        </div>
        <p className="mt-1 truncate text-[13px] text-muted-foreground">
          {stopping ? "stopping" : run.status}
          {run.attempts > 1 && ` · attempt ${run.attempts}`}
          {run.upgraded && " · from before the upgrade"}
        </p>
        {run.error && (
          <p className="truncate font-mono text-[11px] text-destructive-text">{run.error}</p>
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
}

export function RunsView({ workflowId }: { workflowId?: string }) {
  const scope = useWorkspaceScope();
  const workflowsQuery = useQuery(rpc.workflows.list.queryOptions({ input: scope }));
  const workflows = workflowsQuery.data?.workflows ?? NO_WORKFLOWS;
  const [statusKey, setStatusKey] = useState("all");
  const [chosen, setChosen] = useState<string[]>([]);
  const statuses = STATUS_FILTERS.find((f) => f.key === statusKey)?.statuses ?? undefined;
  const workflowIds = workflowId ? [workflowId] : chosen.length > 0 ? chosen : undefined;
  const fixed = workflowId ? workflows.find((w) => w.id === workflowId) : undefined;

  const runsQuery = useInfiniteQuery(
    rpc.workflows.runs.infiniteOptions({
      input: (cursor: string | undefined) => ({
        ...scope,
        ...(workflowIds ? { workflowIds } : {}),
        ...(statuses ? { statuses } : {}),
        ...(cursor ? { cursor } : {}),
        limit: PAGE_SIZE,
      }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  );
  const runsData = runsQuery.data;
  const runs: WorkflowRun[] = useMemo(
    () => runsData?.pages.flatMap((page) => page.runs) ?? [],
    [runsData],
  );
  const loading = runsQuery.isPending && !runsQuery.isError;

  usePollingRefresh(async () => {
    await runsQuery.refetch({ cancelRefetch: false });
  });

  const backHref = workflowId
    ? workflowEditPath(scope.workspaceSlug, workflowId)
    : workflowPath(scope.workspaceSlug);

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-border-soft border-b px-6 py-4">
        <Button
          aria-label={workflowId ? "Back to the workflow" : "Back to workflows"}
          nativeButton={false}
          render={<Link href={backHref} />}
          size="icon-sm"
          variant="ghost"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex size-9 items-center justify-center rounded-lg bg-brand-soft">
          <History className="size-4.5 text-brand-text" />
        </div>
        <div className="min-w-40 flex-1">
          <h1 className="font-medium text-foreground text-lg">Runs</h1>
          <p className="truncate text-faint text-xs">
            {workflowId ? (fixed?.name ?? "") : "Every workflow in this workspace"}
          </p>
        </div>
        {!workflowId && (
          <WorkflowFilter workflows={workflows} chosen={chosen} onChange={setChosen} />
        )}
      </header>

      <div
        role="group"
        aria-label="Status"
        className="flex shrink-0 flex-wrap gap-1.5 border-border-soft border-b px-6 py-2.5"
      >
        {STATUS_FILTERS.map((filter) => (
          <Button
            key={filter.key}
            size="xs"
            variant={statusKey === filter.key ? "secondary" : "ghost"}
            aria-pressed={statusKey === filter.key}
            onClick={() => setStatusKey(filter.key)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-3xl px-6 py-6">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin opacity-50" />
            </div>
          ) : (
            <>
              {runs.length === 0 && !runsQuery.hasNextPage ? (
                <p className="py-10 text-center text-[13px] text-faint">
                  {statuses || chosen.length > 0
                    ? "No runs match these filters."
                    : "No runs recorded yet. Runs appear here once a trigger fires."}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {runs.map((run) => (
                    <RunRow
                      key={run.id}
                      run={run}
                      href={workflowRunPath(scope.workspaceSlug, run.id, Boolean(workflowId))}
                    />
                  ))}
                </ul>
              )}
              {runsQuery.hasNextPage && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={runsQuery.isFetchingNextPage}
                    onClick={() => void runsQuery.fetchNextPage()}
                  >
                    {runsQuery.isFetchingNextPage && <Loader2 className="animate-spin" />}
                    Load older runs
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
