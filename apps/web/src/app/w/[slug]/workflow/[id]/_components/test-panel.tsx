"use client";

import { Button } from "@metis/ui/components/button";
import { Textarea } from "@metis/ui/components/textarea";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Loader2, Pin, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { NodeIcon } from "@/components/workflow-graph/node-meta";
import { testOverlay } from "@/components/workflow-graph/overlay";
import { StatusIcon, statusLabel } from "@/components/workflow-history/run-status";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import type { TestWorkflowOutput } from "@/server/schema";
import { nodeTitle, stepDef } from "@/workflow/steps";
import type { Json } from "@/workflow/values";

import { useDiagnostics, useEditorEnv, useOverlay } from "./editor-context";
import { useEditor, useEditorStore } from "./editor-store";
import { FormSelect } from "./forms/form-select";
import { jsonOf } from "./forms/json";
import { InputsForm, type InputValues, triggerInputs } from "./inputs-form";

export interface ReplayTarget {
  runId: string;
  fromNodeId: string | null;
}

type EventMode = "sample" | "pinned" | "custom" | "inputs" | "none";

const MODE_LABELS: Record<EventMode, string> = {
  sample: "A recent item",
  pinned: "The pinned sample",
  custom: "An event I paste",
  inputs: "Inputs I fill in",
  none: "Nothing",
};

const ALL_STEPS = "__all";

export function TestPanel({
  replay,
  onReplayChange,
}: {
  replay: ReplayTarget | null;
  onReplayChange: (next: ReplayTarget | null) => void;
}) {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();
  const store = useEditorStore();
  const graph = useEditor((s) => s.graph);
  const select = useEditor((s) => s.select);
  const diagnostics = useDiagnostics();
  const { workflowId } = useEditorEnv();
  const { show, source } = useOverlay();
  const triggers = graph.nodes.filter((n) => stepDef(n.step)?.trigger);
  const [chosenTrigger, setTrigger] = useState<string | null>(null);
  const trigger = triggers.find((t) => t.id === chosenTrigger) ?? triggers[0] ?? null;
  const kind = trigger ? stepDef(trigger.step)?.trigger?.kind : undefined;

  const pinnedQuery = useQuery({
    ...rpc.workflows.samples.queryOptions({ input: { ...scope, id: workflowId ?? "" } }),
    enabled: !!workflowId,
  });
  const pinned = trigger ? pinnedQuery.data?.samples[trigger.id] : undefined;

  const modes: EventMode[] = [
    ...(kind === "feed" ? (["sample"] as const) : []),
    ...(pinned !== undefined ? (["pinned"] as const) : []),
    ...(kind === "manual" || kind === "call" || kind === "inbound" ? (["inputs"] as const) : []),
    ...(kind === "time" || kind === "once" ? (["none"] as const) : []),
    "custom",
  ];
  const [chosenMode, setMode] = useState<EventMode | null>(null);
  const mode = chosenMode && modes.includes(chosenMode) ? chosenMode : (modes[0] ?? "custom");

  const samples = useQuery({
    ...rpc.workflows.testSamples.queryOptions({
      input: {
        ...scope,
        graph: {
          version: graph.version,
          nodes: trigger ? [trigger] : graph.nodes,
          edges: [],
          settings: {},
        },
        triggerNodeId: trigger?.id ?? "",
      },
    }),
    enabled: !!trigger && kind === "feed" && mode === "sample" && !replay,
  });
  const [chosenSample, setSample] = useState<string | null>(null);
  const list = samples.data?.samples ?? [];
  const sampleId = list.find((s) => s.id === chosenSample)?.id ?? list[0]?.id;

  const [inputs, setInputs] = useState<InputValues>({});
  const [custom, setCustom] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TestWorkflowOutput | null>(null);

  function eventInput(): { event?: Json; sampleId?: string; inputs?: InputValues } | string {
    if (replay) return {};
    switch (mode) {
      case "sample":
        return sampleId ? { sampleId } : "Pick an item to test with";
      case "pinned":
        return { event: jsonOf(pinned) };
      case "inputs":
        return { inputs };
      case "none":
        return {};
      case "custom":
        try {
          return { event: jsonOf(JSON.parse(custom)) };
        } catch {
          return "Paste the event as JSON";
        }
    }
  }

  async function run() {
    if (!trigger) return;
    const chosen = eventInput();
    if (typeof chosen === "string") {
      setError(chosen);
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const tested = store.getState().graph;
      const output = await orpc.workflows.test({
        ...scope,
        graph: tested,
        triggerNodeId: trigger.id,
        ...chosen,
        ...(replay
          ? {
              replayRunId: replay.runId,
              ...(replay.fromNodeId ? { fromNodeId: replay.fromNodeId } : {}),
            }
          : {}),
      });
      setResult(output);
      show({ kind: "test" }, testOverlay(tested, output), false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The test run did not go through");
    } finally {
      setRunning(false);
    }
  }

  async function pin() {
    if (!workflowId || !trigger || !result) return;
    try {
      await orpc.workflows.pinSample({
        ...scope,
        id: workflowId,
        triggerNodeId: trigger.id,
        event: jsonOf(result.event),
      });
      await queryClient.invalidateQueries({ queryKey: rpc.workflows.samples.key() });
      toast.success("Pinned as this trigger's sample");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not pin the sample");
    }
  }

  const blocked = diagnostics.count > 0;
  const reached = result
    ? graph.nodes.filter((n) => result.steps.some((s) => s.nodeId === n.id))
    : [];
  const steps = graph.nodes.filter((n) => !stepDef(n.step)?.trigger);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto px-4 py-3">
      <p className="text-[12px] text-muted-foreground">
        Runs this version of the workflow, saved or not, and changes nothing: steps that change
        something report what they would do. AI steps still call the model.
      </p>
      {triggers.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Add a trigger to test from.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {replay ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border-soft bg-surface px-2.5 py-1.5 text-[12px]">
              <span className="font-medium">Replaying run {replay.runId.slice(0, 8)}</span>
              <span className="text-muted-foreground">with its trigger event,</span>
              <FormSelect
                label="Run from"
                className="w-56"
                value={replay.fromNodeId ?? ALL_STEPS}
                onValueChange={(id) =>
                  onReplayChange({ ...replay, fromNodeId: id === ALL_STEPS ? null : id })
                }
                options={[
                  { value: ALL_STEPS, label: "from the start" },
                  ...steps.map((n) => ({ value: n.id, label: `from ${nodeTitle(n)}` })),
                ]}
              />
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Stop replaying"
                className="ml-auto"
                onClick={() => onReplayChange(null)}
              >
                <X />
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              {triggers.length > 1 && trigger && (
                <FormSelect
                  label="Start from"
                  className="w-56"
                  value={trigger.id}
                  onValueChange={setTrigger}
                  options={triggers.map((t) => ({ value: t.id, label: nodeTitle(t) }))}
                />
              )}
              {modes.length > 1 && (
                <FormSelect
                  label="Test with"
                  className="w-48"
                  value={mode}
                  onValueChange={setMode}
                  options={modes.map((value) => ({ value, label: MODE_LABELS[value] }))}
                />
              )}
              {mode === "sample" && (
                <div className="min-w-0 flex-1">
                  {samples.isPending ? (
                    <p className="text-[12px] text-faint">Loading recent items…</p>
                  ) : samples.isError ? (
                    <p className="text-[12px] text-destructive-text">{samples.error.message}</p>
                  ) : list.length === 0 ? (
                    <p className="text-[12px] text-faint">Nothing there to test with yet.</p>
                  ) : (
                    <FormSelect
                      label="Sample"
                      value={sampleId ?? ""}
                      onValueChange={setSample}
                      options={list.map((s) => ({
                        value: s.id,
                        label: s.subtitle ? `${s.title} — ${s.subtitle}` : s.title,
                      }))}
                    />
                  )}
                </div>
              )}
            </div>
          )}
          {!replay && mode === "inputs" && (
            <InputsForm
              fields={triggerInputs(trigger ?? undefined)}
              value={inputs}
              onChange={setInputs}
            />
          )}
          {!replay && mode === "custom" && (
            <Textarea
              aria-label="Event"
              value={custom}
              spellCheck={false}
              onChange={(e) => setCustom(e.target.value)}
              placeholder='{ "subject": "Invoice 42" }'
              className="min-h-20 font-mono text-[12px]"
            />
          )}
          <div>
            <Button size="sm" onClick={run} disabled={running || blocked}>
              {running ? <Loader2 className="animate-spin" /> : <FlaskConical />}
              Run test
            </Button>
          </div>
        </div>
      )}
      {blocked && (
        <p className="text-[12px] text-destructive-text">
          Fix the problems in the workflow before testing it.
        </p>
      )}
      {error && <p className="text-[13px] text-destructive-text">{error}</p>}
      {result && source?.kind === "test" && (
        <section aria-label="Test result" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
            <StatusIcon status={result.status} className="size-3.5" />
            <span className="font-medium">{statusLabel(result.status)}</span>
            {workflowId && result.event !== null && result.event !== undefined && (
              <Button size="xs" variant="ghost" className="ml-auto" onClick={() => void pin()}>
                <Pin /> Pin this event
              </Button>
            )}
          </div>
          {result.error && <p className="text-[12px] text-destructive-text">{result.error}</p>}
          <ul className="flex flex-col">
            {reached.map((node) => {
              const lines = result.steps.filter((s) => s.nodeId === node.id);
              const items = result.items.filter((i) => i.nodeId === node.id).length;
              return (
                <li key={node.id}>
                  <button
                    type="button"
                    onClick={() => select([node.id])}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] hover:bg-hover"
                  >
                    <NodeIcon
                      step={node.step}
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                    <span className="w-40 shrink-0 truncate">{nodeTitle(node)}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {lines
                        .map(
                          (line) =>
                            `${statusLabel(line.status)}${line.detail ? `: ${line.detail}` : ""}`,
                        )
                        .join(" · ")}
                    </span>
                    {items > 0 && <span className="shrink-0 text-[12px] text-faint">×{items}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
