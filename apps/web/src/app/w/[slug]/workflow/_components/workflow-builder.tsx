"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@metis/ui/components/alert-dialog";
import { Button } from "@metis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import { cn } from "@metis/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, History, ListChecks, Loader2, Plus, WorkflowIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { ResponsiveAside } from "@/components/mobile-aside";
import { useWorkspacePath, useWorkspaceScope } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";
import type { WorkflowDirectory, WorkflowOutput } from "@/server/schema";
import type { GraphTemplate } from "@/workflow/graph";
import { GRAPH_TEMPLATES, TEMPLATE_LABELS } from "@/workflow/graph";
import { workflowPath, workspacePath, workspaceRootPath } from "@/workspace/path";

import { ApprovalsSheet } from "./approvals-sheet";
import type { EditorWorkflowRef } from "./editor-context";
import { triggerInputs } from "./inputs-form";
import { WorkflowEditor } from "./workflow-editor";

type Selection = { mode: "new"; template: GraphTemplate } | { mode: "workflow"; id: string } | null;

const NO_WORKFLOWS: WorkflowOutput[] = [];
const NO_DIRECTORY: WorkflowDirectory = {
  mailboxes: [],
  calendars: [],
  drives: [],
  addressBooks: [],
  members: [],
};

interface WorkflowBuilderProps {
  allowDecisionSteps: boolean;
  initialWorkflowId: string | null;
}

function workflowRefs(workflows: readonly WorkflowOutput[]): EditorWorkflowRef[] {
  return workflows.map((w) => ({
    id: w.id,
    name: w.name,
    callable: w.callable,
    inputs: triggerInputs(w.graph.nodes.find((n) => n.step === "trigger.call")).map(
      (field) => field.name,
    ),
  }));
}

export function WorkflowBuilder({ allowDecisionSteps, initialWorkflowId }: WorkflowBuilderProps) {
  const { workspaceSlug } = useWorkspacePath();
  const scope = useWorkspaceScope();
  const inboxHref = workspaceSlug ? workspacePath(workspaceSlug) : workspaceRootPath();
  const queryClient = useQueryClient();
  const listOptions = rpc.workflows.list.queryOptions({ input: scope });
  const query = useQuery(listOptions);
  const workflows: WorkflowOutput[] = query.data?.workflows ?? NO_WORKFLOWS;
  const directory = query.data?.directory ?? NO_DIRECTORY;
  const refs = useMemo(() => workflowRefs(workflows), [workflows]);
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const approvals = useQuery(rpc.workflows.approvals.queryOptions({ input: scope }));
  const pendingApprovals = approvals.data?.approvals.length ?? 0;
  const loading = query.isPending && !query.isError;
  const loadError = query.error ? query.error.message || "Could not load your workflows" : null;
  const [chosen, setSelection] = useState<Selection>(() =>
    initialWorkflowId ? { mode: "workflow", id: initialWorkflowId } : null,
  );
  const firstWorkflow = query.data?.workflows?.[0];
  const selection: Selection =
    chosen ??
    (query.data
      ? firstWorkflow
        ? { mode: "workflow", id: firstWorkflow.id }
        : { mode: "new", template: "blank" }
      : null);
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const onDirtyChange = useCallback((next: boolean) => setDirty(next), []);

  function guard(action: () => void) {
    if (dirty) setPending(() => action);
    else action();
  }

  function setWorkflows(update: (list: WorkflowOutput[]) => WorkflowOutput[]) {
    queryClient.setQueryData(listOptions.queryKey, (old) =>
      old ? { ...old, workflows: update(old.workflows ?? []) } : old,
    );
  }

  const selectedWorkflow =
    selection?.mode === "workflow" ? (workflows.find((w) => w.id === selection.id) ?? null) : null;

  function handleSaved(saved: WorkflowOutput) {
    setWorkflows((prev) => {
      const exists = prev.some((w) => w.id === saved.id);
      return exists ? prev.map((w) => (w.id === saved.id ? saved : w)) : [...prev, saved];
    });
    setSelection({ mode: "workflow", id: saved.id });
  }

  function handleDeleted(id: string) {
    const next = workflows.filter((w) => w.id !== id);
    setWorkflows(() => next);
    const first = next[0];
    setSelection(first ? { mode: "workflow", id: first.id } : { mode: "new", template: "blank" });
  }

  const canvasKey =
    selection?.mode === "workflow" ? selection.id : `new:${selection?.template ?? "blank"}`;

  return (
    <div className="flex h-full w-full">
      <ResponsiveAside label="Workflows" closeKey={canvasKey}>
        <aside className="flex h-full w-56 shrink-0 flex-col border-border border-r bg-panel">
          <div className="flex items-center gap-2 border-border-soft border-b px-3 py-2.5">
            <Link
              href={inboxHref}
              onClick={(event) => {
                if (!dirty) return;
                event.preventDefault();
                guard(() => router.push(inboxHref));
              }}
              aria-label="Back to mail"
              className="flex size-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-hover hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <span className="flex-1 font-medium font-serif text-foreground text-sm">Workflows</span>
          </div>

          <div className="p-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-2 text-[12px] transition-colors hover:bg-hover",
                      selection?.mode === "new"
                        ? "bg-brand-soft text-primary"
                        : "text-muted-foreground",
                    )}
                  />
                }
              >
                <Plus className="size-3.5" /> New workflow
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                {GRAPH_TEMPLATES.map((template) => (
                  <DropdownMenuItem
                    key={template}
                    onClick={() => guard(() => setSelection({ mode: "new", template }))}
                  >
                    {TEMPLATE_LABELS[template]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-4 animate-spin opacity-50" />
              </div>
            ) : loadError ? (
              <p className="px-2 py-3 text-[12px] text-destructive-text">{loadError}</p>
            ) : workflows.length === 0 ? (
              <p className="px-2 py-3 text-[12px] text-faint">
                No workflows yet. Build one on the canvas, or start from a template.
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {workflows.map((flow) => {
                  const active = selection?.mode === "workflow" && selection.id === flow.id;
                  return (
                    <li key={flow.id}>
                      <button
                        type="button"
                        onClick={() => guard(() => setSelection({ mode: "workflow", id: flow.id }))}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-hover",
                          active && "bg-active",
                        )}
                      >
                        <WorkflowIcon
                          className={cn(
                            "size-3.5 shrink-0",
                            flow.enabled ? "text-primary" : "text-faint",
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                          {flow.name}
                        </span>
                        {!flow.enabled && <span className="text-[10px] text-faint">off</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex shrink-0 flex-col gap-1.5 border-border-soft border-t p-2">
            <button
              type="button"
              onClick={() => setApprovalsOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-2 text-[12px] text-muted-foreground transition-colors hover:bg-hover"
            >
              <ListChecks className="size-3.5" /> Approvals
              {pendingApprovals > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                  {pendingApprovals}
                </span>
              )}
            </button>
            <Link
              href={workspaceSlug ? workflowPath(workspaceSlug, "history") : workspaceRootPath()}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-2 text-[12px] text-muted-foreground transition-colors hover:bg-hover"
            >
              <History className="size-3.5" /> Activity
            </Link>
          </div>
        </aside>
      </ResponsiveAside>

      <div className="min-h-0 min-w-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin opacity-50" />
          </div>
        ) : (
          <WorkflowEditor
            key={canvasKey}
            directory={directory}
            allowDecisionSteps={allowDecisionSteps}
            workflows={refs}
            workflow={selectedWorkflow}
            template={selection?.mode === "new" ? selection.template : "blank"}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
            onDirtyChange={onDirtyChange}
          />
        )}
      </div>

      <ApprovalsSheet open={approvalsOpen} onOpenChange={setApprovalsOpen} />

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This workflow has changes you have not saved. They are lost if you leave it now.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const action = pending;
                setPending(null);
                setDirty(false);
                action?.();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
