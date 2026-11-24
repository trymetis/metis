"use client";

import { Button } from "@metis/ui/components/button";
import { cn } from "@metis/ui/lib/utils";
import { Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import { cva } from "class-variance-authority";
import { CircleAlert, X } from "lucide-react";
import { useEffect } from "react";

import { StatusIcon } from "@/components/workflow-history/run-status";
import type { GraphNode, StepStatus } from "@/workflow/schema";
import { type CardLine, nodeTitle, stepCategory, stepDef, stepLabel } from "@/workflow/steps";

import { CATEGORY_BADGE, NodeIcon, PORT_HANDLE, type PortTone } from "./node-meta";

export interface CardPort {
  id: string | null;
  label: string;
  tone: PortTone;
}

export interface CardStatus {
  status: StepStatus | null;
  count: number;
  detail: string | null;
}

const cardVariants = cva(
  "group/card relative w-64 rounded-xl border bg-surface text-foreground shadow-sm transition-[box-shadow,opacity,border-color]",
  {
    variants: {
      tone: {
        plain: "border-border",
        problem: "border-destructive-text/50",
        completed: "border-status-success/70",
        failed: "border-destructive-text/70",
        attention: "border-brand-text/70",
        active: "border-primary/60",
        skipped: "border-border border-dashed opacity-75",
        idle: "border-border border-dashed opacity-50",
      },
      selected: {
        true: "ring-2 ring-primary ring-offset-2 ring-offset-background",
        false: "",
      },
    },
    defaultVariants: { tone: "plain", selected: false },
  },
);

type Tone = NonNullable<Parameters<typeof cardVariants>[0]>["tone"];

function toneOf(status: CardStatus | null | undefined, problem: boolean): Tone {
  if (!status) return problem ? "problem" : "plain";
  switch (status.status) {
    case null:
      return "idle";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "blocked":
    case "unknown":
      return "attention";
    case "skipped":
      return "skipped";
    default:
      return "active";
  }
}

const LINE_TONE = {
  plain: "text-foreground/85",
  muted: "text-muted-foreground",
  warn: "text-brand-text",
} as const;

const handleClass = "!size-2.5 !border-2 !border-surface";

function PortRow({
  port,
  side,
  connectable,
}: {
  port: CardPort;
  side: "in" | "out";
  connectable: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex h-5 items-center px-3 text-[11px] text-muted-foreground",
        side === "out" && "justify-end",
      )}
    >
      <Handle
        type={side === "in" ? "target" : "source"}
        position={side === "in" ? Position.Left : Position.Right}
        id={port.id ?? undefined}
        isConnectable={connectable}
        title={port.label}
        className={cn(handleClass, PORT_HANDLE[port.tone])}
      />
      <span className="truncate">{port.label}</span>
    </div>
  );
}

export function NodeCard({
  node,
  inputs,
  outputs,
  lines,
  problem,
  status,
  selected = false,
  connectable,
  onRemove,
}: {
  node: GraphNode;
  inputs: CardPort[];
  outputs: CardPort[];
  lines: CardLine[];
  problem?: string | null;
  status?: CardStatus | null;
  selected?: boolean;
  connectable: boolean;
  onRemove?: () => void;
}) {
  const updateNodeInternals = useUpdateNodeInternals();
  const portKey = [...inputs, ...outputs].map((port) => port.id ?? "in").join("|");
  useEffect(() => {
    updateNodeInternals(node.id);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- React Flow must re-measure handles when the port set changes
  }, [portKey, node.id, updateNodeInternals]);

  const title = nodeTitle(node);
  const kind = stepLabel(node.step);

  return (
    <div className={cardVariants({ tone: toneOf(status, !!problem), selected })}>
      <div className="flex items-center gap-2 border-border-soft border-b px-3 py-2">
        <span
          className={cn(
            "relative grid size-6 shrink-0 place-items-center rounded-md",
            CATEGORY_BADGE[stepCategory(node.step)],
          )}
        >
          <NodeIcon step={node.step} className="size-3.5" />
          {stepDef(node.step)?.effect === "dispatch" && (
            <span
              role="img"
              aria-label="Sends or creates"
              title="Sends or creates"
              className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary ring-2 ring-surface"
            />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-[13px] leading-tight">{title}</p>
          {title !== kind && (
            <p className="truncate text-[10px] text-faint leading-tight">{kind}</p>
          )}
        </div>
        {node.onError && node.onError !== "fail" && (
          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {node.onError === "branch" ? "On error: branch" : "On error: continue"}
          </span>
        )}
        {node.skip && (
          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            Skipped
          </span>
        )}
        {status && (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            <StatusIcon status={status.status} className="size-3.5" />
            {status.count > 1 ? `×${status.count}` : null}
          </span>
        )}
        {onRemove && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="nodrag opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100 pointer-coarse:opacity-100"
            aria-label="Remove step"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
          >
            <X />
          </Button>
        )}
      </div>

      {(inputs.length > 0 || outputs.length > 0 || lines.length > 0) && (
        <div className="flex flex-col gap-1.5 py-2">
          {(inputs.length > 0 || outputs.length > 0) && (
            <div className="grid grid-cols-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                {inputs.map((port) => (
                  <PortRow key={port.id ?? "in"} port={port} side="in" connectable={connectable} />
                ))}
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                {outputs.map((port) => (
                  <PortRow
                    key={port.id ?? "out"}
                    port={port}
                    side="out"
                    connectable={connectable}
                  />
                ))}
              </div>
            </div>
          )}
          {lines.length > 0 && (
            <ul className="flex flex-col gap-0.5 px-3">
              {lines.map((line, index) => (
                <li
                  // oxlint-disable-next-line react/no-array-index-key -- card lines are positional and may repeat
                  key={index}
                  title={line.text}
                  className={cn(
                    "truncate text-xs",
                    LINE_TONE[line.tone ?? "plain"],
                    line.mono && "font-mono text-[11px]",
                  )}
                >
                  {line.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {status?.detail && (
        <p
          title={status.detail}
          className={cn(
            "line-clamp-2 border-border-soft border-t px-3 py-1.5 text-[11px]",
            status.status === "failed" ? "text-destructive-text" : "text-muted-foreground",
          )}
        >
          {status.detail}
        </p>
      )}

      {problem && (
        <p className="flex items-start gap-1.5 border-border-soft border-t px-3 py-1.5 text-[11px] text-destructive-text">
          <CircleAlert className="mt-px size-3 shrink-0" />
          <span className="line-clamp-2">{problem}</span>
        </p>
      )}
    </div>
  );
}
