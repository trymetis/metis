"use client";

import "@xyflow/react/dist/style.css";
import { Button } from "@metis/ui/components/button";
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  type Connection,
  type Edge,
  type EdgeChange,
  type IsValidConnection,
  MiniMap,
  type NodeChange,
  Panel,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import { LayoutGrid, Map as MapIcon, Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { useTheme } from "next-themes";
import {
  createContext,
  type DragEvent,
  type RefObject,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { flowEdges } from "@/components/workflow-graph/edges";
import { graphFitOptions } from "@/components/workflow-graph/fit";
import { CATEGORY_COLOR } from "@/components/workflow-graph/node-meta";
import { isMobileViewport, useIsMobile } from "@/hooks/use-is-mobile";
import { CARD_WIDTH, flowHandle, layoutGraph } from "@/workflow/graph";
import { edgeId, mergeInputIndex, type WorkflowGraph } from "@/workflow/schema";
import { isStepKey, nodeTitle, stepCategory, stepDef } from "@/workflow/steps";

import { useEditorEnv, useOverlay } from "./editor-context";
import { useEditor, useEditorStore } from "./editor-store";
import { StepNode, type StepFlowNode } from "./step-node";

export const STEP_DRAG_TYPE = "application/x-metis-workflow-step";
const SNAP = 16;

const nodeTypes = { step: StepNode };

export const CanvasElementContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

type LiveFields = Partial<Pick<StepFlowNode, "measured" | "position" | "dragging">>;

function liveFields(node: StepFlowNode): LiveFields {
  return node.dragging
    ? { measured: node.measured, position: node.position, dragging: true }
    : { measured: node.measured };
}

function withLive(base: StepFlowNode[], live: ReadonlyMap<string, LiveFields>): StepFlowNode[] {
  return base.map((node) => {
    const fields = live.get(node.id);
    return fields ? { ...node, ...fields } : node;
  });
}

function reaches(graph: WorkflowGraph, from: string, to: string): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || seen.has(id)) continue;
    if (id === to) return true;
    seen.add(id);
    for (const edge of graph.edges) if (edge.source === id) stack.push(edge.target);
  }
  return false;
}

export function connectionProblem(graph: WorkflowGraph, connection: Connection | Edge): boolean {
  if (!connection.source || !connection.target) return true;
  if (connection.source === connection.target) return true;
  const source = graph.nodes.find((n) => n.id === connection.source);
  const target = graph.nodes.find((n) => n.id === connection.target);
  if (!source || !target) return true;
  const targetDef = stepDef(target.step);
  if (!targetDef || targetDef.trigger) return true;
  const fromQuestion =
    source.step === "ai.ask" && flowHandle(connection.sourceHandle).startsWith("q:");
  if (fromQuestion !== (target.step === "ai.branch")) return true;
  if (reaches(graph, target.id, source.id)) return true;
  if (targetDef.merge === "append" || targetDef.merge === "join") {
    if (mergeInputIndex(connection.targetHandle) < 0) return true;
    return graph.edges.some(
      (e) =>
        e.target === target.id &&
        (e.targetHandle === connection.targetHandle ||
          (e.source === source.id && e.sourceHandle === flowHandle(connection.sourceHandle))),
    );
  }
  return graph.edges.some((e) => e.target === target.id);
}

export function useAddStep() {
  const rf = useReactFlow();
  const canvas = useContext(CanvasElementContext);
  const store = useEditorStore();
  const { resources } = useEditorEnv();
  return (step: string, at?: { x: number; y: number }) => {
    const rect = canvas?.current?.getBoundingClientRect();
    const screen = at ?? {
      x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
      y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
    };
    const point = rf.screenToFlowPosition(screen);
    const position = {
      x: Math.round((point.x - CARD_WIDTH / 2) / SNAP) * SNAP,
      y: Math.round((point.y - 40) / SNAP) * SNAP,
    };
    return store.getState().addNode(step, position, resources);
  };
}

export function useTidyLayout() {
  const rf = useReactFlow();
  const store = useEditorStore();
  return useCallback(() => {
    store
      .getState()
      .setGraph((graph) => layoutGraph(graph, (id) => rf.getNode(id)?.measured?.height ?? 120));
    requestAnimationFrame(
      () =>
        void rf.fitView({
          ...graphFitOptions(isMobileViewport(), rf.getNodes(), rf.getEdges()),
          duration: 200,
        }),
    );
  }, [rf, store]);
}

function CanvasButton({
  label,
  pressed,
  onClick,
  className,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={className}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function CanvasControls({
  minimap,
  onMinimap,
  onTidy,
}: {
  minimap: boolean;
  onMinimap: () => void;
  onTidy: () => void;
}) {
  const rf = useReactFlow();
  return (
    <Panel
      position="top-right"
      className="!m-3 flex items-center gap-0.5 rounded-xl border border-border bg-panel p-1 shadow-lg"
    >
      <CanvasButton label="Zoom In" onClick={() => void rf.zoomIn({ duration: 200 })}>
        <ZoomIn />
      </CanvasButton>
      <CanvasButton label="Zoom Out" onClick={() => void rf.zoomOut({ duration: 200 })}>
        <ZoomOut />
      </CanvasButton>
      <CanvasButton
        label="Fit View"
        onClick={() =>
          void rf.fitView({
            ...graphFitOptions(isMobileViewport(), rf.getNodes(), rf.getEdges()),
            duration: 200,
          })
        }
      >
        <Maximize />
      </CanvasButton>
      <CanvasButton label="Tidy up the layout" onClick={onTidy}>
        <LayoutGrid />
      </CanvasButton>
      <CanvasButton
        label={minimap ? "Hide the minimap" : "Show the minimap"}
        pressed={minimap}
        onClick={onMinimap}
        className="max-md:hidden"
      >
        <MapIcon />
      </CanvasButton>
    </Panel>
  );
}

export function WorkflowCanvas() {
  const graph = useEditor((s) => s.graph);
  const selected = useEditor((s) => s.selected);
  const store = useEditorStore();
  const canvas = useContext(CanvasElementContext);
  const { overlay, live: animate } = useOverlay();
  const { resolvedTheme } = useTheme();
  const isMobile = useIsMobile();
  const addStep = useAddStep();
  const tidy = useTidyLayout();
  const [minimap, setMinimap] = useState(true);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const base = useMemo(
    (): StepFlowNode[] =>
      graph.nodes.map((node) => ({
        id: node.id,
        type: "step",
        position: node.position,
        data: { node },
        selected: selectedSet.has(node.id),
        ariaLabel: nodeTitle(node),
      })),
    [graph.nodes, selectedSet],
  );
  const [live, setLive] = useState<ReadonlyMap<string, LiveFields>>(() => new Map());
  const nodes = useMemo(() => withLive(base, live), [base, live]);

  const onNodesChange = useCallback(
    (changes: NodeChange<StepFlowNode>[]) => {
      const moved = Object.fromEntries(
        changes.flatMap((c) =>
          c.type === "position" && c.dragging === false && c.position && !live.get(c.id)?.dragging
            ? [[c.id, c.position]]
            : [],
        ),
      );
      if (Object.keys(moved).length > 0) store.getState().moveNodes(moved);
      setLive((prev) => {
        const next = applyNodeChanges(changes, withLive(base, prev));
        return new Map(next.map((n) => [n.id, liveFields(n)]));
      });
      const picks = changes.flatMap((c) => (c.type === "select" ? [c] : []));
      if (picks.length > 0) {
        const next = new Set(store.getState().selected);
        for (const pick of picks) {
          if (pick.selected) next.add(pick.id);
          else next.delete(pick.id);
        }
        store.getState().select([...next]);
      }
    },
    [base, live, store],
  );

  const [pickedEdges, setPickedEdges] = useState<ReadonlySet<string>>(() => new Set());
  const edges = useMemo(
    () => flowEdges(graph, overlay, { editable: true, animate, selected: pickedEdges }),
    [graph, overlay, animate, pickedEdges],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setPickedEdges((prev) => {
        const current = edges.map((e) => ({ ...e, selected: prev.has(e.id) }));
        const next = applyEdgeChanges(changes, current);
        return new Set(next.filter((e) => e.selected).map((e) => e.id));
      }),
    [edges],
  );

  const isValidConnection: IsValidConnection = useCallback(
    (connection) => !connectionProblem(graph, connection),
    [graph],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const handle = flowHandle(connection.sourceHandle);
      store.getState().connect({
        id: edgeId(connection.source, handle, connection.target, connection.targetHandle),
        source: connection.source,
        sourceHandle: handle,
        target: connection.target,
        ...(connection.targetHandle ? { targetHandle: connection.targetHandle } : {}),
      });
    },
    [store],
  );

  const onDrop = useCallback(
    (event: DragEvent) => {
      const step = event.dataTransfer.getData(STEP_DRAG_TYPE);
      if (!isStepKey(step)) return;
      event.preventDefault();
      addStep(step, { x: event.clientX, y: event.clientY });
    },
    [addStep],
  );

  return (
    <div
      ref={canvas}
      className="relative size-full"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(STEP_DRAG_TYPE)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeDragStop={(_event, _node, dragged) =>
          store.getState().moveNodes(Object.fromEntries(dragged.map((n) => [n.id, n.position])))
        }
        onNodesDelete={(deleted) => store.getState().removeNodes(deleted.map((n) => n.id))}
        onEdgesDelete={(deleted) => store.getState().removeEdges(deleted.map((e) => e.id))}
        onPaneClick={() => store.getState().select([])}
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode={["Meta", "Control", "Shift"]}
        snapToGrid
        snapGrid={[SNAP, SNAP]}
        minZoom={0.2}
        maxZoom={1.5}
        fitView
        fitViewOptions={graphFitOptions(isMobile, nodes, edges)}
        proOptions={{ hideAttribution: true }}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        className="bg-background"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={SNAP}
          size={1}
          className="!bg-background"
        />
        <CanvasControls minimap={minimap} onMinimap={() => setMinimap((on) => !on)} onTidy={tidy} />
        {minimap && (
          <MiniMap<StepFlowNode>
            pannable
            zoomable
            className="!m-3 overflow-hidden !rounded-xl !border !border-border !bg-panel !shadow-lg max-md:hidden"
            nodeColor={(node) => CATEGORY_COLOR[stepCategory(node.data.node.step)]}
            maskColor="rgba(0,0,0,0.35)"
          />
        )}
      </ReactFlow>
    </div>
  );
}
