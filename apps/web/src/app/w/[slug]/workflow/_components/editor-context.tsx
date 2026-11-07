"use client";

import { createContext, useContext, useMemo } from "react";

import { cardContext } from "@/components/workflow-graph/card-context";
import type { GraphOverlay } from "@/components/workflow-graph/overlay";
import type { WorkflowDirectory, WorkflowOutput } from "@/server/schema";
import type { GraphResources } from "@/workflow/graph";
import type { WorkflowGraph, WorkflowSourceState } from "@/workflow/schema";
import type { CardContext, ResourceKind } from "@/workflow/steps";
import { analyzeGraph, type NodeTypes, validateGraph } from "@/workflow/validation";

import { useLabelOptions } from "./label-options";

export interface EditorWorkflowRef {
  id: string;
  name: string;
  callable: boolean;
  inputs: string[];
}

export interface EditorEnv {
  workflowId: string | null;
  workflow: WorkflowOutput | null;
  directory: WorkflowDirectory;
  resources: GraphResources;
  allowDecisionSteps: boolean;
  sources: ReadonlyMap<string, WorkflowSourceState>;
  workflows: readonly EditorWorkflowRef[];
}

export interface Diagnostics {
  byNode: ReadonlyMap<string, string[]>;
  general: string[];
  count: number;
  types: ReadonlyMap<string, NodeTypes>;
}

export type OverlaySource = { kind: "run"; runId: string } | { kind: "test" };

export interface OverlayState {
  overlay: GraphOverlay | null;
  source: OverlaySource | null;
  live: boolean;
  show: (source: OverlaySource, overlay: GraphOverlay, live: boolean) => void;
  clear: () => void;
}

export const EditorEnvContext = createContext<EditorEnv | null>(null);
export const DiagnosticsContext = createContext<Diagnostics>({
  byNode: new Map(),
  general: [],
  count: 0,
  types: new Map(),
});
export const OverlayContext = createContext<OverlayState | null>(null);

export function useEditorEnv(): EditorEnv {
  const env = useContext(EditorEnvContext);
  if (!env) throw new Error("useEditorEnv must be used inside the workflow editor");
  return env;
}

export function useDiagnostics(): Diagnostics {
  return useContext(DiagnosticsContext);
}

export function useOverlay(): OverlayState {
  const overlay = useContext(OverlayContext);
  if (!overlay) throw new Error("useOverlay must be used inside the workflow editor");
  return overlay;
}

export function directoryResources(
  directory: WorkflowDirectory,
  timezone?: string,
): GraphResources {
  return {
    mailbox: directory.mailboxes.map((m) => ({ id: m.id, label: m.email })),
    calendar: directory.calendars.map((c) => ({ id: c.id, label: c.email })),
    drive: directory.drives.map((d) => ({ id: d.id, label: d.name })),
    addressbook: directory.addressBooks.map((a) => ({ id: a.id, label: a.name })),
    timezone,
  };
}

function resourceIds(
  directory: WorkflowDirectory,
  aiOnly: boolean,
): Record<ResourceKind, string[]> {
  const pick = (list: WorkflowDirectory["mailboxes"]) =>
    list.filter((entry) => !aiOnly || entry.aiEnabled).map((entry) => entry.id);
  return {
    mailbox: pick(directory.mailboxes),
    calendar: pick(directory.calendars),
    drive: pick(directory.drives),
    addressbook: pick(directory.addressBooks),
  };
}

export function diagnose(graph: WorkflowGraph, env: EditorEnv): Diagnostics {
  const { types } = analyzeGraph(graph);
  const result = validateGraph(graph, {
    kind: env.workflow?.kind ?? "user",
    allowedResources: resourceIds(env.directory, false),
    aiResources: resourceIds(env.directory, true),
    allowDecisionSteps: env.allowDecisionSteps,
    workflows: env.workflows.filter((w) => w.id !== env.workflowId),
  });
  if (result.ok) return { byNode: new Map(), general: [], count: 0, types };
  const byNode = new Map<string, string[]>();
  const general: string[] = [];
  for (const error of result.errors) {
    if (error.nodeId && graph.nodes.some((n) => n.id === error.nodeId)) {
      const list = byNode.get(error.nodeId) ?? [];
      if (!list.includes(error.message)) list.push(error.message);
      byNode.set(error.nodeId, list);
    } else if (!general.includes(error.message)) {
      general.push(error.message);
    }
  }
  const count = general.length + [...byNode.values()].reduce((sum, list) => sum + list.length, 0);
  return { byNode, general, count, types };
}

export function useCardContext(graph: WorkflowGraph): CardContext {
  const { directory, workflows } = useEditorEnv();
  const labels = useLabelOptions();
  return useMemo(
    () =>
      cardContext(graph, {
        directory,
        workflows,
        labelName: (key: string) => labels.find((l) => l.value === key)?.label ?? key,
      }),
    [graph, directory, workflows, labels],
  );
}
