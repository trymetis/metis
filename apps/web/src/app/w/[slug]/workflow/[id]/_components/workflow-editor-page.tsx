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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { setLeaveGuard } from "@/hooks/leave-guard";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";
import type { WorkflowDirectory, WorkflowOutput } from "@/server/schema";
import type { GraphTemplate } from "@/workflow/graph";
import { workflowEditPath, workflowPath } from "@/workspace/path";

import type { EditorWorkflowRef } from "./editor-context";
import { triggerInputs } from "./inputs-form";
import { WorkflowEditor } from "./workflow-editor";

const NO_WORKFLOWS: WorkflowOutput[] = [];
const NO_DIRECTORY: WorkflowDirectory = {
  mailboxes: [],
  calendars: [],
  drives: [],
  addressBooks: [],
  members: [],
};

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

export function WorkflowEditorPage({
  workflowId,
  template,
  allowDecisionSteps,
}: {
  workflowId: string;
  template: GraphTemplate | null;
  allowDecisionSteps: boolean;
}) {
  const scope = useWorkspaceScope();
  const router = useRouter();
  const queryClient = useQueryClient();
  const listOptions = rpc.workflows.list.queryOptions({ input: scope });
  const query = useQuery(listOptions);
  const workflows = query.data?.workflows ?? NO_WORKFLOWS;
  const directory = query.data?.directory ?? NO_DIRECTORY;
  const refs = useMemo(() => workflowRefs(workflows), [workflows]);
  const workflow = workflows.find((w) => w.id === workflowId) ?? null;
  const listHref = workflowPath(scope.workspaceSlug);
  const [initialTemplate] = useState(template);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const onDirtyChange = useCallback((next: boolean) => setDirty(next), []);

  useEffect(() => {
    if (template) router.replace(workflowEditPath(scope.workspaceSlug, workflowId));
  }, [template, router, scope.workspaceSlug, workflowId]);

  function guard(action: () => void) {
    if (dirty) setPending(() => action);
    else action();
  }

  useEffect(() => {
    if (!dirty) return;
    setLeaveGuard((href) => setPending(() => () => router.push(href)));
    return () => setLeaveGuard(null);
  }, [dirty, router]);

  function handleSaved(saved: WorkflowOutput) {
    queryClient.setQueryData(listOptions.queryKey, (old) =>
      old
        ? { ...old, workflows: (old.workflows ?? []).map((w) => (w.id === saved.id ? saved : w)) }
        : old,
    );
  }

  function handleDeleted(id: string) {
    queryClient.setQueryData(listOptions.queryKey, (old) =>
      old ? { ...old, workflows: (old.workflows ?? []).filter((w) => w.id !== id) } : old,
    );
    router.push(listHref);
  }

  if (query.isPending && !query.isError) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin opacity-50" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-[13px] text-faint">
          {query.error?.message || "This workflow does not exist, or you cannot see it."}
        </p>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={listHref} />}>
          Back to workflows
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full min-w-0">
      <WorkflowEditor
        directory={directory}
        allowDecisionSteps={allowDecisionSteps}
        workflows={refs}
        workflow={workflow}
        template={initialTemplate}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
        onDirtyChange={onDirtyChange}
        onNavigate={(href) => guard(() => router.push(href))}
      />

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
