"use client";

import { Button } from "@metis/ui/components/button";
import { cn } from "@metis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { ExternalLink, FlaskConical, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { IconButton } from "@/components/icon-button";
import { runOverlay } from "@/components/workflow-graph/overlay";
import { StatusIcon, statusLabel } from "@/components/workflow-history/run-status";
import { RunWaits } from "@/components/workflow-history/run-waits";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";
import type { WorkflowRun } from "@/server/schema";
import { workflowRunPath } from "@/workspace/path";

import { useEditorEnv, useOverlay } from "./editor-context";

const ACTIVE = new Set<WorkflowRun["status"]>(["pending", "running", "waiting"]);
const POLL_MS = 2_000;

function stopping(run: Pick<WorkflowRun, "status" | "finishedAt">): boolean {
  return run.status === "cancelled" && !run.finishedAt;
}

function live(run: Pick<WorkflowRun, "status" | "finishedAt">): boolean {
  return ACTIVE.has(run.status) || stopping(run);
}

function when(run: WorkflowRun): string {
  const at = run.startedAt ?? run.dueAt;
  return formatDistanceToNowStrict(new Date(at), { addSuffix: true });
}

export function RunsPanel({
  selectedRunId,
  onSelectRun,
  revision,
  onReplay,
}: {
  selectedRunId: string | null;
  onSelectRun: (runId: string | null) => void;
  revision: number | null;
  onReplay: (runId: string) => void;
}) {
  const scope = useWorkspaceScope();
  const { workflowId } = useEditorEnv();
  const { show, clear, source } = useOverlay();

  const runs = useQuery({
    ...rpc.workflows.runs.queryOptions({
      input: { ...scope, workflowId: workflowId ?? undefined, limit: 20 },
    }),
    enabled: !!workflowId,
    refetchInterval: (query) => (query.state.data?.runs.some(live) ? POLL_MS : false),
  });

  const detail = useQuery({
    ...rpc.workflows.getRun.queryOptions({
      input: { ...scope, runId: selectedRunId ?? "" },
    }),
    enabled: !!selectedRunId,
    refetchInterval: (query) => {
      const run = query.state.data?.run;
      return !run || live(run) ? POLL_MS : false;
    },
  });

  const run = detail.data?.run ?? null;
  useEffect(() => {
    if (!run || run.id !== selectedRunId) return;
    show({ kind: "run", runId: run.id }, runOverlay(run), live(run));
  }, [run, selectedRunId, show]);

  useEffect(() => {
    if (!selectedRunId && source?.kind === "run") clear();
  }, [selectedRunId, source, clear]);

  if (!workflowId) {
    return (
      <p className="px-4 py-3 text-[13px] text-muted-foreground">
        Save the workflow to run it. Until then, try it with a test run.
      </p>
    );
  }

  const list = runs.data?.runs ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {run && run.id === selectedRunId && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-border-soft border-b px-4 py-2 text-[12px]">
          <StatusIcon status={stopping(run) ? "running" : run.status} className="size-3.5" />
          <span className="font-medium">Showing run {run.id.slice(0, 8)} on the canvas</span>
          {revision !== null && run.revision !== revision && (
            <span className="text-brand-text">It ran an earlier version of this workflow.</span>
          )}
          {run.upgraded && (
            <span className="text-muted-foreground">From before the workflow engine upgrade.</span>
          )}
          {run.error && <span className="truncate text-destructive-text">{run.error}</span>}
          <span className="ml-auto flex items-center gap-1">
            {!run.upgraded && (
              <Button size="xs" variant="ghost" onClick={() => onReplay(run.id)}>
                <FlaskConical /> Replay in a test
              </Button>
            )}
            <IconButton
              label="Details"
              size="icon-xs"
              nativeButton={false}
              render={<Link href={workflowRunPath(scope.workspaceSlug, run.id, true)} />}
            >
              <ExternalLink className="size-3.5" />
            </IconButton>
            <IconButton label="Hide" size="icon-xs" onClick={() => onSelectRun(null)}>
              <X className="size-3.5" />
            </IconButton>
          </span>
        </div>
      )}
      {run && run.id === selectedRunId && run.waits.some((w) => w.status === "open") && (
        <div className="shrink-0 border-border-soft border-b px-4">
          <RunWaits run={run} openOnly />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {runs.isPending ? (
          <div className="flex justify-center py-4">
            <Loader2 className="size-4 animate-spin opacity-50" />
          </div>
        ) : list.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-muted-foreground">
            No runs yet. Press Run now, or wait for a trigger to fire.
          </p>
        ) : (
          <ul aria-label="Recent runs" className="flex flex-col py-1">
            {list.map((entry) => {
              const failed = entry.steps.filter((s) => s.status === "failed").length;
              const done = entry.steps.filter((s) => s.status === "completed").length;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    aria-pressed={entry.id === selectedRunId}
                    onClick={() => onSelectRun(entry.id === selectedRunId ? null : entry.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-4 py-1.5 text-left text-[13px] transition-colors hover:bg-hover",
                      entry.id === selectedRunId && "bg-active",
                    )}
                  >
                    <StatusIcon
                      status={stopping(entry) ? "running" : entry.status}
                      className="size-3.5"
                    />
                    <span className="w-20 shrink-0 capitalize">
                      {stopping(entry) ? "stopping" : statusLabel(entry.status)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {done} step{done === 1 ? "" : "s"} done
                      {failed > 0 && ` · ${failed} failed`}
                      {entry.error && ` · ${entry.error}`}
                    </span>
                    <span className="shrink-0 text-[12px] text-faint">{when(entry)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
