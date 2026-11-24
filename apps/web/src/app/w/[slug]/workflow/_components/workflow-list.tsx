"use client";

import { Button } from "@metis/ui/components/button";
import { Switch } from "@metis/ui/components/switch";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { ArrowLeft, History, ListChecks, Loader2, Plus, WorkflowIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { SearchInput } from "@/components/search-input";
import { cardContext } from "@/components/workflow-graph/card-context";
import { StatusIcon } from "@/components/workflow-history/run-status";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import type { WorkflowDirectory, WorkflowOutput } from "@/server/schema";
import { cardLines, stepDef, stepLabel } from "@/workflow/steps";
import { workflowEditPath, workflowRunsPath, workspacePath } from "@/workspace/path";

import { ApprovalsSheet } from "./approvals-sheet";
import { NewWorkflowDialog } from "./new-workflow-dialog";

const NO_WORKFLOWS: WorkflowOutput[] = [];
const NO_DIRECTORY: WorkflowDirectory = {
  mailboxes: [],
  calendars: [],
  drives: [],
  addressBooks: [],
  members: [],
};

function ago(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
}

function triggerSummary(
  flow: WorkflowOutput,
  directory: WorkflowDirectory,
  workflows: readonly WorkflowOutput[],
): string {
  const ctx = cardContext(flow.graph, { directory, workflows });
  return flow.graph.nodes
    .filter((node) => stepDef(node.step)?.trigger)
    .map((node) => {
      const first = cardLines(node, ctx)[0]?.text;
      return first ? `${stepLabel(node.step)} · ${first}` : stepLabel(node.step);
    })
    .join(", ");
}

export function WorkflowList() {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();
  const listOptions = rpc.workflows.list.queryOptions({ input: scope });
  const query = useQuery(listOptions);
  const workflows = query.data?.workflows ?? NO_WORKFLOWS;
  const directory = query.data?.directory ?? NO_DIRECTORY;
  const lastRuns = query.data?.lastRuns;
  const approvals = useQuery(rpc.workflows.approvals.queryOptions({ input: scope }));
  const pendingApprovals = approvals.data?.approvals.length ?? 0;
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [toggling, setToggling] = useState<string | null>(null);

  const needle = search.trim().toLowerCase();
  const shown = useMemo(
    () => (needle ? workflows.filter((w) => w.name.toLowerCase().includes(needle)) : workflows),
    [workflows, needle],
  );

  async function toggle(flow: WorkflowOutput, enabled: boolean) {
    setToggling(flow.id);
    try {
      await orpc.workflows.toggle({ ...scope, id: flow.id, enabled });
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : `Could not turn ${enabled ? "on" : "off"} "${flow.name}"`,
      );
    } finally {
      setToggling(null);
      await queryClient.invalidateQueries({ queryKey: listOptions.queryKey });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-border-soft border-b px-6 py-4">
        <Button
          aria-label="Back to mail"
          nativeButton={false}
          render={<Link href={workspacePath(scope.workspaceSlug)} />}
          size="icon-sm"
          variant="ghost"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="mr-auto font-medium text-[22px] leading-tight tracking-tight text-foreground">
          Workflows
        </h1>
        <Button variant="outline" size="sm" onClick={() => setApprovalsOpen(true)}>
          <ListChecks />
          Approvals
          {pendingApprovals > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
              {pendingApprovals}
            </span>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={workflowRunsPath(scope.workspaceSlug)} />}
        >
          <History />
          Runs
        </Button>
      </header>

      <div className="flex shrink-0 items-center gap-2 border-border-soft border-b px-6 py-3">
        <SearchInput
          label="Search workflows"
          placeholder="Search workflows"
          value={search}
          onValueChange={setSearch}
          className="max-w-sm"
        />
        <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}>
          <Plus />
          New workflow
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.isPending && !query.isError ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin opacity-50" />
          </div>
        ) : query.isError ? (
          <p className="px-6 py-6 text-[13px] text-destructive-text">
            {query.error.message || "Could not load your workflows"}
          </p>
        ) : shown.length === 0 ? (
          <p className="px-6 py-10 text-center text-[13px] text-faint">
            {needle ? "No workflow matches that search." : "No workflows yet."}
          </p>
        ) : (
          <ul aria-label="Workflows">
            {shown.map((flow) => {
              const last = lastRuns?.find((r) => r.workflowId === flow.id);
              return (
                <li
                  key={flow.id}
                  className="flex items-center gap-4 border-border-soft border-b px-6 py-3 transition-colors hover:bg-hover"
                >
                  <WorkflowIcon
                    className={`size-4 shrink-0 ${flow.enabled ? "text-primary" : "text-faint"}`}
                  />
                  <Link
                    href={workflowEditPath(scope.workspaceSlug, flow.id)}
                    className="min-w-0 flex-1"
                  >
                    <span className="block truncate font-medium text-[13px] text-foreground">
                      {flow.name}
                    </span>
                    <span className="block truncate text-[12px] text-faint">
                      {triggerSummary(flow, directory, workflows)}
                    </span>
                  </Link>
                  <span className="hidden w-40 shrink-0 md:block">
                    {last ? (
                      <Link
                        href={workflowRunsPath(scope.workspaceSlug, flow.id)}
                        className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
                        title={`Last run ${last.status}`}
                      >
                        <StatusIcon status={last.status} className="size-3.5" />
                        <span className="truncate">{ago(last.at)}</span>
                      </Link>
                    ) : (
                      <span className="text-[12px] text-faint">Never run</span>
                    )}
                  </span>
                  <span className="hidden w-32 shrink-0 truncate text-[12px] text-faint lg:block">
                    Updated {ago(flow.updatedAt)}
                  </span>
                  <Switch
                    checked={flow.enabled}
                    disabled={toggling === flow.id}
                    onCheckedChange={(on) => void toggle(flow, on)}
                    aria-label={`Turn ${flow.name} ${flow.enabled ? "off" : "on"}`}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ApprovalsSheet open={approvalsOpen} onOpenChange={setApprovalsOpen} />
      <NewWorkflowDialog open={creating} onOpenChange={setCreating} directory={directory} />
    </div>
  );
}
