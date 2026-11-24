"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { memo, useMemo } from "react";

import { NodeCard } from "@/components/workflow-graph/node-card";
import { nodePorts } from "@/components/workflow-graph/ports";
import type { GraphNode } from "@/workflow/schema";
import { cardLines } from "@/workflow/steps";

import { useCardContext, useDiagnostics, useOverlay } from "./editor-context";
import { useEditor } from "./editor-store";

export type StepFlowNode = Node<{ node: GraphNode }, "step">;

export const StepNode = memo(function StepNode({ id, data, selected }: NodeProps<StepFlowNode>) {
  const graph = useEditor((s) => s.graph);
  const removeNodes = useEditor((s) => s.removeNodes);
  const ctx = useCardContext(graph);
  const diagnostics = useDiagnostics();
  const problems = diagnostics.byNode.get(id);
  const { overlay } = useOverlay();
  const ports = useMemo(
    () => nodePorts(data.node, graph, diagnostics.types, { spareInput: true }),
    [data.node, graph, diagnostics.types],
  );
  const lines = useMemo(() => cardLines(data.node, ctx), [data.node, ctx]);

  return (
    <NodeCard
      node={data.node}
      inputs={ports.inputs}
      outputs={ports.outputs}
      lines={lines}
      problem={problems?.[0] ?? null}
      status={overlay?.nodes.get(id)?.status ?? null}
      selected={selected}
      connectable
      onRemove={() => removeNodes([id])}
    />
  );
});
