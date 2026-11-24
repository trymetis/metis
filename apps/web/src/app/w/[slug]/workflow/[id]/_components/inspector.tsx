"use client";

import { Alert, AlertDescription, AlertTitle } from "@metis/ui/components/alert";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@metis/ui/components/field";
import { Input } from "@metis/ui/components/input";
import { ScrollArea } from "@metis/ui/components/scroll-area";
import { Separator } from "@metis/ui/components/separator";
import { Switch } from "@metis/ui/components/switch";
import { cn } from "@metis/ui/lib/utils";
import { Braces, CircleAlert, Copy, MoreHorizontal, MousePointerClick, Trash2 } from "lucide-react";
import { type FocusEvent, useState } from "react";
import { toast } from "sonner";

import { IconButton } from "@/components/icon-button";
import { CATEGORY_BADGE, NodeIcon } from "@/components/workflow-graph/node-meta";
import { JsonBlock } from "@/components/workflow-history/json-block";
import { StatusIcon, statusLabel } from "@/components/workflow-history/run-status";
import { isTypingTarget } from "@/hooks/use-chord";
import { branchQuestion, nodeQuestions } from "@/workflow/decision";
import type { Binding } from "@/workflow/expr";
import {
  type GraphNode,
  MAX_STEP_TITLE,
  ON_ERROR,
  type OnError,
  type WorkflowGraph,
} from "@/workflow/schema";
import { nodeOutputs, nodeTitle, stepDef } from "@/workflow/steps";

import { useDiagnostics, useOverlay } from "./editor-context";
import { staleEdges, useEditor, useEditorStore } from "./editor-store";
import { FormSelect } from "./forms/form-select";
import { ParamField, visibleParams } from "./forms/param-field";
import { TriggerDetails } from "./trigger-details";
import { WorkflowSettings } from "./workflow-settings";

const PASTE_OFFSET = { x: 32, y: 32 };

const ON_ERROR_LABELS: Record<OnError, string> = {
  fail: "Fail the run",
  branch: "Route the item to an Error output",
  continue: "Pass the item on unchanged",
};

const EMPTY_SCOPE = { trigger: { kind: "json" as const }, item: null, steps: {} };

function useTypingAsOneStep() {
  const store = useEditorStore();
  return {
    onFocus: (event: FocusEvent) => {
      if (isTypingTarget(event.target) || event.target.getAttribute("role") === "slider") {
        store.getState().beginGesture();
      }
    },
    onBlur: (event: FocusEvent) => {
      if (isTypingTarget(event.target) || event.target.getAttribute("role") === "slider") {
        store.getState().endGesture();
      }
    },
  };
}

function Problems({ problems }: { problems: string[] }) {
  if (problems.length === 0) return null;
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>
        {problems.length === 1
          ? "Something needs attention"
          : `${problems.length} things need attention`}
      </AlertTitle>
      <AlertDescription>
        {problems.map((problem) => (
          <p key={problem}>{problem}</p>
        ))}
      </AlertDescription>
    </Alert>
  );
}

function StepResults({ node }: { node: GraphNode }) {
  const { overlay, source } = useOverlay();
  const graph = useEditor((s) => s.graph);
  const result = overlay?.nodes.get(node.id);
  if (!result || !source) return null;
  const outputs = nodeOutputs(node, graph);
  const heading = source.kind === "test" ? "In the test run" : "In the selected run";
  return (
    <section className="flex flex-col gap-2" aria-label={heading}>
      <h3 className="flex items-center gap-1.5 font-medium text-[13px]">
        <StatusIcon status={result.status.status} className="size-3.5" />
        {heading}
        <span className="font-normal text-muted-foreground">
          · {result.status.status === null ? "not reached" : statusLabel(result.status.status)}
        </span>
      </h3>
      {result.status.detail && (
        <p className="text-[12px] text-muted-foreground">{result.status.detail}</p>
      )}
      {result.items.length > 0 && (
        <ul className="flex flex-col divide-y divide-border-soft rounded-lg border border-border-soft">
          {result.items.map((item) => {
            const routed = item.outputs
              .map((handle) => outputs.find((o) => o.id === handle)?.label)
              .filter(Boolean);
            return (
              <li key={item.id} className="flex items-start gap-2 px-2.5 py-2">
                <StatusIcon status={item.status} className="mt-0.5 size-3.5" />
                <div className="flex min-w-0 flex-1 flex-col gap-1 text-[12px]">
                  {item.title && <p className="truncate text-foreground">{item.title}</p>}
                  {item.subtitle && <p className="truncate text-faint">{item.subtitle}</p>}
                  {routed.length > 0 && (
                    <p className="text-muted-foreground">→ {routed.join(", ")}</p>
                  )}
                  {item.detail && <p className="text-muted-foreground">{item.detail}</p>}
                  {item.error && (
                    <p className="break-words font-mono text-[11px] text-destructive-text">
                      {item.error}
                    </p>
                  )}
                  <JsonBlock label="Input" value={item.input} />
                  <JsonBlock label="Output" value={item.output} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const BOOLEAN_THRESHOLDS = new Set(["yesAt", "noAt"]);

function shownParams(node: GraphNode, graph: WorkflowGraph) {
  const params = visibleParams(node);
  if (node.step !== "ai.branch") return params;
  const asked = branchQuestion(graph, node.id);
  if (!asked) return [];
  const boolean = asked.question.type === "boolean";
  return params.filter(([name]) => BOOLEAN_THRESHOLDS.has(name) === boolean);
}

function BranchQuestion({ node }: { node: GraphNode }) {
  const graph = useEditor((s) => s.graph);
  const asked = branchQuestion(graph, node.id);
  if (!asked) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Connect this step to a question on an Ask step.
      </p>
    );
  }
  const index = nodeQuestions(asked.ask).findIndex((q) => q.id === asked.question.id);
  return (
    <div className="flex flex-col gap-1">
      <p className="rounded-lg border border-border-soft bg-surface px-3 py-2 text-[13px]">
        <span className="text-muted-foreground">Q{index + 1}: </span>
        {asked.question.instructions || "(no question text yet)"}
      </p>
      <p className="text-[11px] text-muted-foreground">Anything below goes to Unsure.</p>
    </div>
  );
}

async function copyReference(id: string) {
  try {
    await navigator.clipboard.writeText(`steps.${id}`);
    toast.success("Reference copied");
  } catch {
    toast.error("Could not copy");
  }
}

function StepInspector({ node }: { node: GraphNode }) {
  const store = useEditorStore();
  const graph = useEditor((s) => s.graph);
  const diagnostics = useDiagnostics();
  const problems = diagnostics.byNode.get(node.id) ?? [];
  const scope = diagnostics.types.get(node.id)?.scope ?? EMPTY_SCOPE;
  const def = stepDef(node.step);
  const [pending, setPending] = useState<{ node: GraphNode; edgeIds: string[] } | null>(null);
  const titleId = `step-title-${node.id}`;
  const skipId = `step-skip-${node.id}`;
  const errorId = `step-error-${node.id}`;

  if (!def) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Problems problems={["This step no longer exists; remove it"]} />
        <Button size="sm" variant="ghost" onClick={() => store.getState().removeNodes([node.id])}>
          <Trash2 /> Delete
        </Button>
      </div>
    );
  }

  const shownAtField = Object.entries(def.params).flatMap(([name, spec]) => {
    const bound = node.params[name] ?? spec.default;
    return bound && bound.kind !== "literal" ? [`${spec.label}: `] : [];
  });

  const apply = (next: GraphNode) => {
    const after = { ...graph, nodes: graph.nodes.map((n) => (n.id === next.id ? next : n)) };
    const stale = staleEdges(after);
    if (stale.length > 0) setPending({ node: next, edgeIds: stale });
    else store.getState().replaceNode(next);
  };
  const patch = (fields: Partial<GraphNode>) => apply({ ...node, ...fields });
  const setParam = (name: string, binding: Binding | undefined) => {
    const params = { ...node.params };
    if (binding) params[name] = binding;
    else delete params[name];
    apply({ ...node, params });
  };
  const changes = def.effect === "write" || def.effect === "dispatch";

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-md",
            CATEGORY_BADGE[def.category],
          )}
        >
          <NodeIcon step={node.step} className="size-3.5" />
        </span>
        <h2 className="min-w-0 flex-1 truncate font-medium text-[15px]">{nodeTitle(node)}</h2>
        <div className="-mr-2 flex shrink-0 items-center gap-0.5">
          <IconButton
            label="Duplicate"
            onClick={() => store.getState().paste([node], [], PASTE_OFFSET)}
          >
            <Copy className="size-4" />
          </IconButton>
          <IconButton label="Delete" onClick={() => store.getState().removeNodes([node.id])}>
            <Trash2 className="size-4" />
          </IconButton>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="More step actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => void copyReference(node.id)}>
                <Braces />
                Copy reference
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Problems
        problems={problems.filter(
          (problem) => !shownAtField.some((label) => problem.startsWith(label)),
        )}
      />

      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor={titleId}>Name</FieldLabel>
          <Input
            className="text-[13px]"
            id={titleId}
            value={node.title ?? ""}
            maxLength={MAX_STEP_TITLE}
            placeholder={def.label}
            onChange={(e) => patch({ title: e.target.value || undefined })}
          />
        </Field>
        {changes && (
          <Field orientation="horizontal" className="justify-between">
            <div className="flex flex-col gap-0.5">
              <FieldLabel htmlFor={skipId}>Skip this step</FieldLabel>
              <FieldDescription>Items pass straight through without the change.</FieldDescription>
            </div>
            <Switch
              id={skipId}
              checked={!!node.skip}
              onCheckedChange={(skip) => patch({ skip: skip || undefined })}
            />
          </Field>
        )}
        {!def.trigger && (
          <Field>
            <FieldLabel htmlFor={errorId}>When this step fails</FieldLabel>
            <FormSelect
              id={errorId}
              label="When this step fails"
              value={node.onError ?? "fail"}
              onValueChange={(onError) =>
                patch({ onError: onError === "fail" ? undefined : onError })
              }
              options={ON_ERROR.map((value) => ({ value, label: ON_ERROR_LABELS[value] }))}
            />
          </Field>
        )}
      </FieldGroup>

      {Object.keys(def.params).length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-4">
            {node.step === "ai.branch" && <BranchQuestion node={node} />}
            {shownParams(node, graph).map(([name, spec]) => (
              <ParamField
                key={name}
                node={node}
                name={name}
                spec={spec}
                scope={scope}
                graph={graph}
                onChange={(binding) => setParam(name, binding)}
              />
            ))}
          </div>
        </>
      )}

      {def.trigger && <TriggerDetails node={node} />}

      <StepResults node={node} />

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove connections?</AlertDialogTitle>
            <AlertDialogDescription>
              This change removes {pending?.edgeIds.length ?? 0} connection(s) from outputs this
              step no longer has.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pending) return;
                const gone = new Set(pending.edgeIds);
                store.getState().setGraph((current) => ({
                  ...current,
                  nodes: current.nodes.map((n) => (n.id === pending.node.id ? pending.node : n)),
                  edges: current.edges.filter((e) => !gone.has(e.id)),
                }));
                setPending(null);
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SelectionInspector({ ids }: { ids: string[] }) {
  const store = useEditorStore();
  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="font-medium text-[15px]">{ids.length} steps selected</h2>
      <p className="text-[13px] text-muted-foreground">
        Drag any of them to move them together, or copy them with Ctrl/⌘ C.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const { graph } = store.getState();
            const chosen = new Set(ids);
            store.getState().paste(
              graph.nodes.filter((n) => chosen.has(n.id)),
              graph.edges.filter((e) => chosen.has(e.source) && chosen.has(e.target)),
              PASTE_OFFSET,
            );
          }}
        >
          <Copy /> Duplicate
        </Button>
        <Button size="sm" variant="ghost" onClick={() => store.getState().removeNodes(ids)}>
          <Trash2 /> Delete
        </Button>
      </div>
    </div>
  );
}

function WorkflowInspector() {
  const graph = useEditor((s) => s.graph);
  const select = useEditor((s) => s.select);
  const diagnostics = useDiagnostics();
  const flagged = graph.nodes.filter((n) => diagnostics.byNode.has(n.id));

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start gap-3">
        <MousePointerClick className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-[13px] text-muted-foreground">
          Select a step to edit it. Drag from a step's output on the right to another step's input
          on the left to connect them.
        </p>
      </div>
      <p className="text-[12px] text-faint">
        {graph.nodes.length} step{graph.nodes.length === 1 ? "" : "s"} · {graph.edges.length}{" "}
        connection{graph.edges.length === 1 ? "" : "s"}
      </p>
      {diagnostics.count === 0 ? (
        <p className="text-[13px] text-status-success">Ready to save: no problems found.</p>
      ) : (
        <section className="flex flex-col gap-2" aria-label="Problems">
          <h3 className="font-medium text-[13px]">
            {diagnostics.count === 1 ? "1 problem" : `${diagnostics.count} problems`}
          </h3>
          {diagnostics.general.map((problem) => (
            <p key={problem} className="text-[13px] text-destructive-text">
              {problem}
            </p>
          ))}
          <ul className="flex flex-col gap-1">
            {flagged.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => select([node.id])}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-hover"
                >
                  <NodeIcon step={node.step} className="mt-0.5 size-3.5 shrink-0" />
                  <span className="min-w-0 text-[13px]">
                    <span className="font-medium">{nodeTitle(node)}</span>
                    <span className="block text-[12px] text-destructive-text">
                      {diagnostics.byNode.get(node.id)?.[0]}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Separator />
      <WorkflowSettings />
    </div>
  );
}

export function Inspector() {
  const selected = useEditor((s) => s.selected);
  const graph = useEditor((s) => s.graph);
  const typing = useTypingAsOneStep();
  const general = useDiagnostics().general;
  const present = graph.nodes.filter((n) => selected.includes(n.id));
  const node = present.length === 1 ? present[0] : undefined;

  return (
    <ScrollArea className="h-full bg-panel" {...typing}>
      <div aria-label="Inspector" role="region">
        {present.length > 0 && general.length > 0 && (
          <div className="px-4 pt-4">
            <Problems problems={general} />
          </div>
        )}
        {node ? (
          <StepInspector key={node.id} node={node} />
        ) : present.length > 1 ? (
          <SelectionInspector ids={present.map((n) => n.id)} />
        ) : (
          <WorkflowInspector />
        )}
      </div>
    </ScrollArea>
  );
}
