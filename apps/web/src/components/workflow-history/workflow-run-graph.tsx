"use client";

import { cn } from "@metis/ui/lib/utils";

import "@xyflow/react/dist/style.css";
import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  type NodeProps,
  type NodeTypes,
  type OnSelectionChangeFunc,
  ReactFlow,
  useNodesState,
} from "@xyflow/react";
import { Move } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { type CardDirectory, cardContext } from "@/components/workflow-graph/card-context";
import { flowEdges } from "@/components/workflow-graph/edges";
import { graphFitOptions } from "@/components/workflow-graph/fit";
import { NodeCard } from "@/components/workflow-graph/node-card";
import { runOverlay } from "@/components/workflow-graph/overlay";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { WorkflowRunDetail } from "@/server/schema";

import { buildRunNodes, type RunGraphNode } from "./run-graph-elements";
import { StatusIcon } from "./run-status";

function RunGraphNodeView({ data, selected }: NodeProps<RunGraphNode>) {
  return (
    <NodeCard
      node={data.node}
      inputs={data.inputs}
      outputs={data.outputs}
      lines={data.lines}
      status={data.status}
      selected={selected}
      connectable={false}
    />
  );
}

const nodeTypes: NodeTypes = { run: RunGraphNodeView };

const LEGEND: { status: string | null; label: string }[] = [
  { status: "completed", label: "Completed" },
  { status: "skipped", label: "Skipped" },
  { status: "waiting", label: "Waiting" },
  { status: "failed", label: "Failed" },
  { status: "blocked", label: "Blocked" },
  { status: "unknown", label: "Needs review" },
  { status: null, label: "Not reached" },
];

const COARSE_POINTER = "(pointer: coarse)";

function subscribeCoarsePointer(onChange: () => void) {
  const query = window.matchMedia(COARSE_POINTER);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribeCoarsePointer,
    () => window.matchMedia(COARSE_POINTER).matches,
    () => false,
  );
}

export function WorkflowRunGraph({
  run,
  directory,
  selectedId,
  onSelect,
  fill = false,
}: {
  run: WorkflowRunDetail;
  directory: CardDirectory;
  selectedId: string | null;
  onSelect: (nodeId: string | null) => void;
  fill?: boolean;
}) {
  const overlay = useMemo(() => runOverlay(run), [run]);
  const built = useMemo(
    () => buildRunNodes(run, overlay, cardContext(run.graph, directory), selectedId),
    [run, overlay, directory, selectedId],
  );
  const edges = useMemo(() => flowEdges(run.graph, overlay, { editable: false }), [run, overlay]);
  const coarse = useCoarsePointer();
  const { resolvedTheme } = useTheme();
  const isMobile = useIsMobile();
  const [moving, setMoving] = useState(false);
  const locked = coarse && !moving;
  const [nodes, setNodes, onNodesChange] = useNodesState<RunGraphNode>(built);

  useEffect(() => {
    setNodes((current) => {
      const measured = new Map(current.map((n) => [n.id, n.measured]));
      return built.map((n) => ({ ...n, measured: measured.get(n.id) }));
    });
  }, [built, setNodes]);

  const onSelectionChange = useCallback<OnSelectionChangeFunc<RunGraphNode>>(
    ({ nodes: picked }) => onSelect(picked[0]?.id ?? null),
    [onSelect],
  );

  return (
    <div className={cn("flex flex-col gap-2", fill && "h-full min-h-0")}>
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-border",
          fill ? "min-h-[360px] flex-1" : "h-[360px] sm:h-[440px]",
        )}
      >
        <ReactFlow
          onKeyDown={(event) => {
            if (
              event.key === " " &&
              event.target instanceof HTMLElement &&
              event.target.classList.contains("react-flow__node")
            ) {
              event.preventDefault();
            }
          }}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onSelectionChange={onSelectionChange}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable
          edgesFocusable={false}
          edgesReconnectable={false}
          elementsSelectable
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          zoomOnScroll={false}
          panOnDrag={!locked}
          zoomOnPinch={!locked}
          preventScrolling={false}
          minZoom={0.2}
          fitView
          fitViewOptions={graphFitOptions(isMobile, nodes, edges)}
          proOptions={{ hideAttribution: true }}
          colorMode={resolvedTheme === "dark" ? "dark" : "light"}
          className={cn("bg-background", locked && "[&_.react-flow__pane]:!touch-auto")}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            className="!bg-background"
          />
          <Controls className="!border-border !bg-surface" showInteractive={false}>
            {coarse && (
              <ControlButton
                aria-label={moving ? "Stop moving the graph" : "Move the graph"}
                aria-pressed={moving}
                title={moving ? "Stop moving the graph" : "Move the graph"}
                onClick={() => setMoving((on) => !on)}
                className={cn(moving && "!bg-primary/15")}
              >
                <Move />
              </ControlButton>
            )}
          </Controls>
        </ReactFlow>
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-faint">
        {LEGEND.map((entry) => (
          <li key={entry.label} className="flex items-center gap-1">
            <StatusIcon status={entry.status} className="size-3" />
            {entry.label}
          </li>
        ))}
        <li className="flex items-center gap-1">
          <StatusIcon status="pending" className="size-3" />
          In progress or sending
        </li>
        <li className="flex items-center gap-1">
          <span className="h-0.5 w-4 rounded bg-primary" />
          Path taken
        </li>
        <li className="flex items-center gap-1">
          <span className="w-4 border-border border-t-2 border-dashed" />
          Not taken
        </li>
      </ul>
    </div>
  );
}
