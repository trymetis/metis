"use client";

import { createContext, useContext } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

import { type GraphResources, newNode, newNodeId } from "@/workflow/graph";
import {
  edgeId,
  type GraphEdge,
  type GraphNode,
  type GraphSettings,
  nodeSchema,
  type WorkflowGraph,
} from "@/workflow/schema";
import { nodeOutputs } from "@/workflow/steps";

export interface Snapshot {
  name: string;
  enabled: boolean;
  graph: WorkflowGraph;
}

type Point = { x: number; y: number };

const HISTORY_LIMIT = 100;

interface EditorState extends Snapshot {
  selected: string[];
  past: Snapshot[];
  future: Snapshot[];
  saved: Snapshot;
  gesture: { depth: number; start: Snapshot | null };
}

interface EditorActions {
  update: (fn: (current: Snapshot) => Snapshot) => void;
  setGraph: (fn: (graph: WorkflowGraph) => WorkflowGraph) => void;
  setName: (name: string) => void;
  setEnabled: (enabled: boolean) => void;
  addNode: (step: string, position: Point, resources: GraphResources) => string;
  patchNode: (id: string, patch: Partial<GraphNode>) => void;
  replaceNode: (node: GraphNode) => void;
  removeNodes: (ids: string[]) => void;
  removeEdges: (ids: string[]) => void;
  connect: (edge: GraphEdge) => void;
  moveNodes: (positions: Record<string, Point>) => void;
  setSettings: (settings: GraphSettings) => void;
  paste: (nodes: GraphNode[], edges: GraphEdge[], offset: Point) => string[];
  select: (ids: string[]) => void;
  undo: () => void;
  redo: () => void;
  beginGesture: () => void;
  endGesture: () => void;
  markSaved: (snapshot: Snapshot) => void;
}

export type EditorStore = StoreApi<EditorState & EditorActions>;

function snapshotOf(state: Snapshot): Snapshot {
  return { name: state.name, enabled: state.enabled, graph: state.graph };
}

export function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  if (a === b) return true;
  return (
    a.name === b.name &&
    a.enabled === b.enabled &&
    (a.graph === b.graph || JSON.stringify(a.graph) === JSON.stringify(b.graph))
  );
}

const paramsSchema = nodeSchema.shape.params;
const STEP_REF = /\bsteps\.([A-Za-z_][A-Za-z0-9_]*)\b/g;

function renameStepRefs(
  params: GraphNode["params"],
  ids: ReadonlyMap<string, string>,
): GraphNode["params"] {
  const text = JSON.stringify(params);
  const renamed = text.replace(STEP_REF, (match, id: string) => {
    const next = ids.get(id);
    return next ? `steps.${next}` : match;
  });
  if (renamed === text) return params;
  const parsed = paramsSchema.safeParse(JSON.parse(renamed));
  return parsed.success ? parsed.data : params;
}

export function staleEdges(graph: WorkflowGraph): string[] {
  return graph.edges
    .filter((edge) => {
      const source = graph.nodes.find((n) => n.id === edge.source);
      return source && !nodeOutputs(source, graph).some((o) => o.id === edge.sourceHandle);
    })
    .map((edge) => edge.id);
}

function withoutNodes(graph: WorkflowGraph, ids: ReadonlySet<string>): WorkflowGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => !ids.has(n.id)),
    edges: graph.edges.filter((e) => !ids.has(e.source) && !ids.has(e.target)),
  };
}

export function createEditorStore(saved: Snapshot, opening: Snapshot = saved): EditorStore {
  return createStore<EditorState & EditorActions>()((set, get) => {
    const commit = (next: Snapshot) => {
      const state = get();
      const current = snapshotOf(state);
      if (sameSnapshot(current, next)) return;
      const recording = state.gesture.depth === 0;
      set({
        ...next,
        past: recording ? [...state.past, current].slice(-HISTORY_LIMIT) : state.past,
        future: recording ? [] : state.future,
      });
    };

    const restore = (from: "past" | "future") => {
      const state = get();
      const stack = state[from];
      const target = stack.at(-1);
      if (!target) return;
      const current = snapshotOf(state);
      const remaining = stack.slice(0, -1);
      const ids = new Set(target.graph.nodes.map((n) => n.id));
      set({
        ...target,
        selected: state.selected.filter((id) => ids.has(id)),
        past: from === "past" ? remaining : [...state.past, current],
        future: from === "future" ? remaining : [...state.future, current],
      });
    };

    return {
      ...opening,
      selected: [],
      past: [],
      future: [],
      saved,
      gesture: { depth: 0, start: null },

      update: (fn) => commit(fn(snapshotOf(get()))),
      setGraph: (fn) => get().update((s) => ({ ...s, graph: fn(s.graph) })),
      setName: (name) => get().update((s) => ({ ...s, name })),
      setEnabled: (enabled) => get().update((s) => ({ ...s, enabled })),

      addNode: (step, position, resources) => {
        const node = newNode(step, position, resources);
        get().setGraph((graph) => ({ ...graph, nodes: [...graph.nodes, node] }));
        set({ selected: [node.id] });
        return node.id;
      },

      patchNode: (id, patch) =>
        get().setGraph((graph) => ({
          ...graph,
          nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
        })),

      replaceNode: (node) =>
        get().setGraph((graph) => ({
          ...graph,
          nodes: graph.nodes.map((n) => (n.id === node.id ? node : n)),
        })),

      removeNodes: (ids) => {
        const gone = new Set(ids);
        if (!get().graph.nodes.some((n) => gone.has(n.id))) return;
        get().setGraph((graph) => withoutNodes(graph, gone));
        set((s) => ({ selected: s.selected.filter((id) => !gone.has(id)) }));
      },

      removeEdges: (ids) => {
        const gone = new Set(ids);
        if (!get().graph.edges.some((e) => gone.has(e.id))) return;
        get().setGraph((graph) => ({
          ...graph,
          edges: graph.edges.filter((e) => !gone.has(e.id)),
        }));
      },

      connect: (edge) =>
        get().setGraph((graph) =>
          graph.edges.some((e) => e.id === edge.id)
            ? graph
            : { ...graph, edges: [...graph.edges, edge] },
        ),

      setSettings: (settings) => get().setGraph((graph) => ({ ...graph, settings })),

      moveNodes: (positions) =>
        get().setGraph((graph) => ({
          ...graph,
          nodes: graph.nodes.map((n) => {
            const position = positions[n.id];
            return position ? { ...n, position } : n;
          }),
        })),

      paste: (nodes, edges, offset) => {
        const ids = new Map(nodes.map((n) => [n.id, newNodeId()]));
        const copies = nodes.map((n) => ({
          ...n,
          id: ids.get(n.id) ?? newNodeId(),
          params: renameStepRefs(n.params, ids),
          position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
        }));
        const links = edges.flatMap((e): GraphEdge[] => {
          const source = ids.get(e.source);
          const target = ids.get(e.target);
          if (!source || !target) return [];
          return [
            {
              ...e,
              source,
              target,
              id: edgeId(source, e.sourceHandle, target, e.targetHandle),
            },
          ];
        });
        get().setGraph((graph) => ({
          ...graph,
          nodes: [...graph.nodes, ...copies],
          edges: [...graph.edges, ...links],
        }));
        const selected = copies.map((n) => n.id);
        set({ selected });
        return selected;
      },

      select: (ids) => {
        const current = get().selected;
        if (current.length === ids.length && current.every((id, i) => id === ids[i])) return;
        set({ selected: ids });
      },

      undo: () => restore("past"),
      redo: () => restore("future"),

      beginGesture: () => {
        const { gesture } = get();
        set({
          gesture: {
            depth: gesture.depth + 1,
            start: gesture.depth === 0 ? snapshotOf(get()) : gesture.start,
          },
        });
      },

      endGesture: () => {
        const state = get();
        const { depth, start } = state.gesture;
        if (depth === 0) return;
        if (depth > 1) {
          set({ gesture: { depth: depth - 1, start } });
          return;
        }
        const changed = start !== null && !sameSnapshot(start, snapshotOf(state));
        set({
          gesture: { depth: 0, start: null },
          ...(changed && start
            ? { past: [...state.past, start].slice(-HISTORY_LIMIT), future: [] }
            : {}),
        });
      },

      markSaved: (snapshot) => set({ saved: snapshot }),
    };
  });
}

export const EditorStoreContext = createContext<EditorStore | null>(null);

export function useEditorStore(): EditorStore {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error("useEditorStore must be used inside the workflow editor");
  return store;
}

export function useEditor<T>(select: (state: EditorState & EditorActions) => T): T {
  return useStore(useEditorStore(), select);
}

export function useIsDirty(): boolean {
  return useEditor((s) => !sameSnapshot(snapshotOf(s), s.saved));
}

export { snapshotOf };
