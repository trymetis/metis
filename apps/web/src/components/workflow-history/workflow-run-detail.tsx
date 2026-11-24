"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@metis/ui/components/alert-dialog";
import { Badge } from "@metis/ui/components/badge";
import { Button } from "@metis/ui/components/button";
import { cn } from "@metis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceStrict } from "date-fns";
import { ArrowLeft, CircleSlash, Loader2, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { IconButton } from "@/components/icon-button";
import type { CardDirectory } from "@/components/workflow-graph/card-context";
import { usePollingRefresh } from "@/hooks/use-polling-refresh";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import type { WorkflowRunDetail } from "@/server/schema";
import { nodeOutputs, nodeTitle, type StepOutput, stepLabel } from "@/workflow/steps";
import { workflowRunsPath } from "@/workspace/path";

import { JsonBlock } from "./json-block";
import { ResolveDispatchDialog, resolveCopyFor } from "./resolve-dispatch-dialog";
import { type RunNode, StatusIcon, statusLabel, stepState } from "./run-status";
import { RunWaits } from "./run-waits";
import { WorkflowRunGraph } from "./workflow-run-graph";

type RunItem = RunNode["items"][number];

const INPUT_STATES: Record<string, string> = {
  settled: "finished",
  waiting: "waiting",
  pending: "not finished",
  blocked: "blocked",
  failed: "failed",
};

const NEEDS_ATTENTION = new Set(["failed", "blocked", "unknown"]);

const SOURCE_LABELS: Record<WorkflowRunDetail["trigger"]["source"], string> = {
  manual: "Run manually",
  schedule: "Schedule fired",
  once: "One-time trigger fired",
  feed: "Something changed",
  app: "App event",
  inbound: "Inbound request",
  call: "Called by another workflow",
};

function runStatusLabel(status: string): string {
  const label = statusLabel(status);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function when(iso: string | null): string {
  return iso ? format(new Date(iso), "PPp") : "—";
}

function took(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  return formatDistanceStrict(new Date(start), new Date(end));
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-border-soft px-6 py-2 not-last:border-r">
      <dt className="text-[11px] text-faint">{label}</dt>
      <dd className="truncate text-[13px] text-foreground">{children}</dd>
    </div>
  );
}

function RunFacts({ run }: { run: WorkflowRunDetail }) {
  const { trigger } = run;
  const duration = took(run.startedAt, run.finishedAt);
  return (
    <dl
      aria-label="Run facts"
      className="flex shrink-0 flex-wrap border-border-soft border-b max-sm:[&>div]:basis-1/2"
    >
      <Fact label="Trigger">
        {trigger.step && trigger.step !== "trigger.manual"
          ? `${SOURCE_LABELS[trigger.source]} · ${stepLabel(trigger.step)}`
          : SOURCE_LABELS[trigger.source]}
      </Fact>
      {run.startedAt ? (
        <Fact label="Started">{when(run.startedAt)}</Fact>
      ) : (
        <Fact label="Due">{when(run.dueAt)}</Fact>
      )}
      {duration && <Fact label="Took">{duration}</Fact>}
      {run.attempts > 1 && <Fact label="Attempt">{run.attempts}</Fact>}
    </dl>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-faint">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </>
  );
}

function person(who: WorkflowRunDetail["principal"]): string {
  return who ? `${who.name} (${who.email})` : "A former member";
}

function RunMoreDetails({ run }: { run: WorkflowRunDetail }) {
  const { trigger } = run;
  const scheduled = trigger.source === "schedule" || trigger.source === "once";
  return (
    <section aria-label="More about this run" className="flex flex-col gap-2">
      <h2 className="font-medium text-[13px] text-muted-foreground">More about this run</h2>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[12px]">
        {scheduled && (
          <Detail label="Scheduled for">{when(trigger.firedFor ?? trigger.scheduledFor)}</Detail>
        )}
        {trigger.missed > 0 && (
          <Detail label="Missed runs">{trigger.missed} merged into this one</Detail>
        )}
        {trigger.source === "manual" && (
          <Detail label="Started by">{person(trigger.requestedBy)}</Detail>
        )}
        <Detail label="Runs as">{person(run.principal)}</Detail>
        <Detail label="Revision">
          {run.revision} · saved by {run.revisionAuthor?.name ?? "a former member"},{" "}
          {when(run.revisionCreatedAt)}
          {run.currentRevision === null ? (
            <span className="block text-brand-text">Workflow deleted since</span>
          ) : (
            run.currentRevision !== run.revision && (
              <span className="block text-brand-text">Edited since</span>
            )
          )}
        </Detail>
        <Detail label="Run ID">
          <span className="font-mono text-[11px]">{run.id}</span>
        </Detail>
      </dl>
    </section>
  );
}

function ResolveItem({
  runId,
  step,
  item,
  onDone,
}: {
  runId: string;
  step: string;
  item: RunItem;
  onDone: () => Promise<void>;
}) {
  const scope = useWorkspaceScope();
  return (
    <ResolveDispatchDialog
      copy={resolveCopyFor(step)}
      load={() => orpc.workflows.unconfirmedStep({ ...scope, runId, stepRunId: item.id })}
      submit={(stepRunId, decision) =>
        orpc.workflows.resolveStep({ ...scope, runId, stepRunId, decision })
      }
      onDone={() => void onDone()}
    />
  );
}

function ItemRow({
  item,
  outputs,
  detailed,
  runId,
  step,
  onResolved,
}: {
  item: RunItem;
  outputs: StepOutput[];
  detailed: boolean;
  runId: string;
  step: string;
  onResolved: () => Promise<void>;
}) {
  const copy = resolveCopyFor(step);
  const duration = took(item.startedAt, item.finishedAt);
  const routed = (item.outputs ?? []).flatMap((handle) => {
    const label = outputs.find((output) => output.id === handle)?.label;
    return label ? [label] : [];
  });
  return (
    <li className="flex flex-wrap items-start gap-x-2 gap-y-0.5 py-1.5">
      <StatusIcon status={item.status} className="mt-0.5 size-3.5" />
      <div className="min-w-48 flex-1">
        <p className="text-[12px] text-muted-foreground">
          {item.inputs && item.status === "pending"
            ? "Waiting for inputs"
            : statusLabel(item.status)}
          {item.attempts > 1 && ` · ${item.attempts} attempts`}
          {item.operation && ` · ${item.operation}`}
        </p>
        {item.title && (
          <p className="truncate text-[12px] text-foreground">
            {item.title}
            {item.subtitle && <span className="text-faint"> · {item.subtitle}</span>}
          </p>
        )}
        {item.wakeAt && item.status === "waiting" && (
          <p className="text-[12px] text-faint">wakes {when(item.wakeAt)}</p>
        )}
        {routed.length > 0 ? (
          <p className="truncate text-[12px] text-faint">
            {routed.join(", ")}
            {item.decision && ` · ${Math.round(item.decision.probability * 100)}%`}
            {item.decision?.score !== undefined && ` · score ${item.decision.score.toFixed(2)}`}
          </p>
        ) : (
          item.detail && <p className="truncate text-[12px] text-faint">{item.detail}</p>
        )}
        {item.error &&
          (item.inputs && item.status === "pending" ? (
            <p className="text-[12px] text-faint">{item.error}</p>
          ) : (
            <p className="break-words font-mono text-[11px] text-destructive-text">{item.error}</p>
          ))}
        {item.resolution && (
          <p className="text-[12px] text-faint">
            {item.resolution.outcome === "verified" ? "Confirmed" : "Closed"} by{" "}
            {item.resolution.resolvedBy?.name ?? "a former member"}
            {item.resolution.outcome === "closed" &&
              item.resolution.reason &&
              ` — ${copy.reasons[item.resolution.reason]}`}
            {item.resolution.note && `: ${item.resolution.note}`} ·{" "}
            {when(item.resolution.resolvedAt)}
          </p>
        )}
        {item.inputs && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {item.inputs.map((input) => (
              <Badge key={input.port} variant="outline">
                Input {input.port + 1}: {INPUT_STATES[input.state] ?? input.state} · {input.count}{" "}
                {input.count === 1 ? "item" : "items"}
              </Badge>
            ))}
          </div>
        )}
        {detailed && (
          <div className="mt-1 flex flex-col gap-1">
            <JsonBlock label="Input" value={item.input} />
            <JsonBlock label="Output" value={item.output} />
          </div>
        )}
      </div>
      <span className="ml-auto shrink-0 text-[11px] text-faint">
        {when(item.startedAt)}
        {duration && ` · ${duration}`}
      </span>
      {item.resolvable && <ResolveItem runId={runId} step={step} item={item} onDone={onResolved} />}
    </li>
  );
}

function NodeCard({
  node,
  graph,
  runId,
  onResolved,
  selected = false,
  onClose,
  onPick,
}: {
  node: RunNode;
  graph: WorkflowRunDetail["graph"];
  runId: string;
  onResolved: () => Promise<void>;
  selected?: boolean;
  onClose?: () => void;
  onPick?: () => void;
}) {
  const { status, label } = stepState(node);
  const graphNode = graph.nodes.find((entry) => entry.id === node.nodeId);
  const outputs = graphNode ? nodeOutputs(graphNode, graph) : [];
  const Root = onClose ? "div" : "li";
  return (
    <Root
      className={cn(
        "rounded-xl border border-border bg-surface px-4 py-3",
        !node.reached && "opacity-60",
        selected && "border-primary/50",
      )}
    >
      <div className="flex items-center gap-2">
        <StatusIcon status={status} />
        {onPick ? (
          <button
            type="button"
            onClick={onPick}
            className="min-w-0 truncate text-left text-[13px] font-medium text-foreground hover:underline"
          >
            {graphNode ? nodeTitle(graphNode) : stepLabel(node.step)}
          </button>
        ) : (
          <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
            {graphNode ? nodeTitle(graphNode) : stepLabel(node.step)}
          </span>
        )}
        {graphNode?.title && (
          <span className="shrink-0 text-[12px] text-muted-foreground">{stepLabel(node.step)}</span>
        )}
        <span className="ml-auto shrink-0 text-[11px] text-faint">{label}</span>
        {onClose && (
          <IconButton label="Close step detail" onClick={onClose} size="icon-xs">
            <X className="size-3.5" />
          </IconButton>
        )}
      </div>
      {node.lines.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {node.lines.map((line, i) => (
            <Badge
              // oxlint-disable-next-line react/no-array-index-key --lines are positional per node
              key={i}
              variant={NEEDS_ATTENTION.has(line.status) ? "destructive" : "outline"}
            >
              {statusLabel(line.status)}
              {line.count > 1 && ` ×${line.count}`}
              {line.detail && ` · ${line.detail}`}
            </Badge>
          ))}
        </div>
      )}
      {!onPick && node.items.length > 0 && (
        <ul className="mt-2 divide-y divide-border-soft border-border-soft border-t">
          {node.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              outputs={outputs}
              detailed={selected}
              runId={runId}
              step={node.step}
              onResolved={onResolved}
            />
          ))}
        </ul>
      )}
    </Root>
  );
}

function CancelRunButton({ run, onDone }: { run: WorkflowRunDetail; onDone: () => Promise<void> }) {
  const scope = useWorkspaceScope();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = run.status === "running";

  const cancel = async () => {
    setBusy(true);
    try {
      const result = await orpc.workflows.cancelRun({
        ...scope,
        runId: run.id,
      });
      if (result.state === "finished") toast.info(result.message);
      else toast.success(result.message);
      setOpen(false);
      await onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That run could not be cancelled");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <AlertDialogTrigger
        render={
          <Button variant="outline" size="sm" className="shrink-0">
            <CircleSlash className="size-3.5" />
            Cancel run
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this run?</AlertDialogTitle>
          <AlertDialogDescription>
            {active
              ? "This run is executing now. It stops before its next step, but a step already in progress — a send included — cannot be called back and may still complete. Nothing already done at the provider is undone."
              : "This run has not started its next attempt yet, so none of its remaining steps will run."}{" "}
            The workflow stays enabled, and completed steps stay in the history.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep running</AlertDialogCancel>
          <Button variant="destructive" disabled={busy} onClick={cancel}>
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            Cancel run
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const RESUMABLE = new Set<WorkflowRunDetail["status"]>(["failed", "partial", "blocked"]);
const ACTIVE = new Set<WorkflowRunDetail["status"]>(["pending", "running", "waiting"]);

function RetryRunButton({ run, onDone }: { run: WorkflowRunDetail; onDone: () => Promise<void> }) {
  const scope = useWorkspaceScope();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const retry = async () => {
    setBusy(true);
    try {
      const result = await orpc.workflows.resumeRun({
        ...scope,
        runId: run.id,
      });
      if (result.state === "resumed") toast.success(result.message);
      else toast.error(result.message);
      setOpen(false);
      await onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That run could not be retried");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <AlertDialogTrigger
        render={
          <Button variant="outline" size="sm" className="shrink-0">
            <RotateCcw className="size-3.5" />
            Retry failed steps
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Retry this run?</AlertDialogTitle>
          <AlertDialogDescription>
            The steps that failed or were blocked run again on the revision that originally
            executed, on the next tick. Steps that completed keep their results and are not
            repeated, so nothing already sent or changed at the provider is done twice. A send with
            an unconfirmed outcome has to be resolved first.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Not now</AlertDialogCancel>
          <Button disabled={busy} onClick={retry}>
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            Retry failed steps
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function WorkflowRunDetailView({
  runId,
  fromWorkflow,
}: {
  runId: string;
  fromWorkflow: boolean;
}) {
  const scope = useWorkspaceScope();
  const query = useQuery(rpc.workflows.getRun.queryOptions({ input: { ...scope, runId } }));
  const run: WorkflowRunDetail | null = query.data?.run ?? null;
  const missing = query.isError && !query.data;
  const loading = query.isPending && !query.isError;
  const load = useCallback(async () => {
    await refreshQuery(rpc.workflows.getRun.queryKey({ input: { ...scope, runId } }));
  }, [scope, runId]);

  const stopping = run?.status === "cancelled" && !run.finishedAt;
  const cancellable = !!run && ACTIVE.has(run.status);

  usePollingRefresh(async () => {
    if (cancellable || stopping) {
      await load();
    }
  }, 15_000);

  const list = useQuery(rpc.workflows.list.queryOptions({ input: scope }));
  const directory = useMemo<CardDirectory>(
    () => ({ directory: list.data?.directory ?? null, workflows: list.data?.workflows ?? [] }),
    [list.data],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = run?.nodes.find((node) => node.nodeId === selectedId);

  const trigger = run?.trigger;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-3 border-border-soft border-b px-6 py-4">
        <Button
          aria-label="Back to runs"
          nativeButton={false}
          render={
            <Link
              href={workflowRunsPath(
                scope.workspaceSlug,
                fromWorkflow && run ? run.workflowId : undefined,
              )}
            />
          }
          size="icon-sm"
          variant="ghost"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="min-w-0 truncate font-medium text-foreground text-lg">
          {run?.workflowName ?? "Workflow run"}
        </h1>
        {run && (
          <Badge variant="outline" data-run-status="" className="shrink-0 gap-1">
            <StatusIcon status={stopping ? "running" : run.status} className="size-3" />
            {stopping ? "Stopping" : runStatusLabel(run.status)}
          </Badge>
        )}
        <span className="flex-1" />
        {run && cancellable && <CancelRunButton run={run} onDone={load} />}
        {run && !run.error && RESUMABLE.has(run.status) && !run.upgraded && (
          <RetryRunButton run={run} onDone={load} />
        )}
      </header>
      {run && <RunFacts run={run} />}
      {run?.error && (
        <div
          role="alert"
          className="flex shrink-0 items-center gap-3 border-destructive/25 border-b bg-destructive/8 px-6 py-2"
        >
          <p className="min-w-0 flex-1 break-words font-mono text-[12px] text-destructive-text">
            {run.error}
          </p>
          {RESUMABLE.has(run.status) && !run.upgraded && <RetryRunButton run={run} onDone={load} />}
        </div>
      )}
      {stopping && (
        <p className="shrink-0 border-border-soft border-b bg-panel px-6 py-2 text-[12px] text-muted-foreground">
          Cancelled while running — it stops before its next step. A step that was already in
          progress may still finish; its outcome appears below once the worker lets go.
        </p>
      )}
      {run?.upgraded && (
        <p className="shrink-0 border-border-soft border-b bg-panel px-6 py-2 text-[12px] text-muted-foreground">
          This run happened before the workflow engine was upgraded. It is kept as history and
          cannot be retried.
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="size-5 animate-spin opacity-50" />
        </div>
      ) : missing || !run || !trigger ? (
        <p className="py-10 text-center text-[13px] text-faint">
          This run does not exist or is not visible to you.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 max-lg:flex-col max-lg:overflow-y-auto">
          <section aria-label="Graph" className="flex min-w-0 flex-1 flex-col gap-2 p-4 lg:min-h-0">
            <p className="text-[11px] text-faint">
              Revision {run.revision} as it ran · select a step for its detail
            </p>
            <div className="min-h-0 flex-1">
              <WorkflowRunGraph
                run={run}
                directory={directory}
                selectedId={selectedId}
                onSelect={setSelectedId}
                fill
              />
            </div>
          </section>
          <aside
            aria-label="Run details"
            className="flex flex-col gap-4 border-border-soft p-4 max-lg:border-t lg:w-95 lg:shrink-0 lg:overflow-y-auto lg:border-l"
          >
            <RunMoreDetails run={run} />
            {run.waits.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="font-medium text-[13px] text-muted-foreground">Waits</h2>
                <div className="rounded-xl border border-border bg-surface px-4 py-1">
                  <RunWaits run={run} />
                </div>
              </section>
            )}
            {selected ? (
              <section aria-label="Selected step" aria-live="polite">
                <NodeCard
                  node={selected}
                  graph={run.graph}
                  runId={run.id}
                  onResolved={load}
                  selected
                  onClose={() => setSelectedId(null)}
                />
              </section>
            ) : (
              <section className="flex flex-col gap-2">
                <h2 className="font-medium text-[13px] text-muted-foreground">Steps</h2>
                <ol className="flex flex-col gap-2">
                  {run.nodes.map((node) => (
                    <NodeCard
                      key={node.nodeId}
                      node={node}
                      graph={run.graph}
                      runId={run.id}
                      onResolved={load}
                      onPick={() => setSelectedId(node.nodeId)}
                    />
                  ))}
                </ol>
              </section>
            )}
            {(trigger.event !== undefined || run.output !== undefined) && (
              <section className="flex flex-col gap-2">
                <JsonBlock label="Trigger event" value={trigger.event} />
                <JsonBlock label="Run output" value={run.output} />
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
