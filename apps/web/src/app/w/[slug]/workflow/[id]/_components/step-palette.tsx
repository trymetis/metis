"use client";

import { Button } from "@metis/ui/components/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@metis/ui/components/command";
import { cn } from "@metis/ui/lib/utils";
import { defaultFilter } from "cmdk";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useState } from "react";

import { CATEGORY_BADGE, NodeIcon } from "@/components/workflow-graph/node-meta";
import { allSteps, CATEGORY_LABELS, STEP_CATEGORIES, type StepDef } from "@/workflow/steps";

import { useEditorEnv } from "./editor-context";
import { STEP_DRAG_TYPE, useAddStep } from "./workflow-canvas";

const DECISION_STEPS = new Set(["ai.ask", "ai.branch"]);

function usePaletteGroups() {
  const { allowDecisionSteps } = useEditorEnv();
  const steps = allSteps().filter(
    (def) =>
      (def.scope === undefined || def.scope === "any") &&
      (allowDecisionSteps || !DECISION_STEPS.has(def.key)),
  );
  return STEP_CATEGORIES.map((category) => ({
    category,
    steps: steps.filter((def) => def.category === category),
  })).filter((group) => group.steps.length > 0);
}

function itemValue(def: StepDef): string {
  return `${def.label} ${CATEGORY_LABELS[def.category]} ${def.description}`;
}

function StepItem({
  def,
  onPick,
  draggable,
  compact = false,
}: {
  def: StepDef;
  onPick: (step: string) => void;
  draggable: boolean;
  compact?: boolean;
}) {
  return (
    <CommandItem
      value={itemValue(def)}
      onSelect={() => onPick(def.key)}
      draggable={draggable}
      onDragStart={(event: React.DragEvent) => {
        event.dataTransfer.setData(STEP_DRAG_TYPE, def.key);
        event.dataTransfer.effectAllowed = "copy";
      }}
      className={cn(
        "gap-2.5",
        compact ? "items-center py-1.5" : "items-start py-2",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      <span
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-md",
          !compact && "mt-0.5",
          CATEGORY_BADGE[def.category],
        )}
      >
        <NodeIcon step={def.key} className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] text-foreground">{def.label}</span>
        {!compact && (
          <span className="line-clamp-2 text-[11px] text-muted-foreground leading-snug">
            {def.description}
          </span>
        )}
      </span>
    </CommandItem>
  );
}

function StepList({ onPick, draggable }: { onPick: (step: string) => void; draggable: boolean }) {
  const groups = usePaletteGroups();
  return (
    <CommandList className="max-h-none">
      <CommandEmpty>No step matches.</CommandEmpty>
      {groups.map((group) => (
        <CommandGroup key={group.category} heading={CATEGORY_LABELS[group.category]}>
          {group.steps.map((def) => (
            <StepItem key={def.key} def={def} onPick={onPick} draggable={draggable} />
          ))}
        </CommandGroup>
      ))}
    </CommandList>
  );
}

export function FloatingPalette() {
  const addStep = useAddStep();
  const [open, setOpen] = useState(false);
  const label = open ? "Hide steps" : "Show steps";
  const toggle = (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-expanded={open}
      title={label}
      className="shrink-0"
      onClick={() => setOpen((value) => !value)}
    >
      {open ? <PanelLeftClose /> : <PanelLeftOpen />}
    </Button>
  );

  if (!open) {
    return (
      <div className="absolute top-3 left-3 z-10 rounded-xl border border-border bg-panel p-1 shadow-lg">
        {toggle}
      </div>
    );
  }

  return (
    <Command
      aria-label="Steps"
      className="absolute top-3 bottom-3 left-3 z-10 h-auto w-72 origin-top-left rounded-xl! border border-border bg-panel p-1 shadow-lg duration-150 animate-in fade-in-0 zoom-in-95"
      filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
    >
      <div className="flex items-center gap-1">
        {toggle}
        <div className="min-w-0 flex-1 *:data-[slot=command-input-wrapper]:p-0">
          <CommandInput placeholder="Search steps" />
        </div>
      </div>
      <p className="px-2 pt-2 pb-1 text-[11px] text-faint">
        Drag a step onto the canvas, or click it
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <StepList onPick={(step) => addStep(step)} draggable />
      </div>
    </Command>
  );
}

const QUICK_ADD_LIMIT = 10;
const TITLE_WEIGHT = 3;

function rankSteps(steps: readonly StepDef[], query: string): StepDef[] {
  const search = query.trim();
  if (!search) return [];
  return steps
    .map((def) => ({
      def,
      score: Math.max(
        defaultFilter(def.label, search) * TITLE_WEIGHT,
        defaultFilter(def.description, search),
      ),
    }))
    .filter((entry) => entry.score > 0)
    .toSorted((a, b) => b.score - a.score)
    .slice(0, QUICK_ADD_LIMIT)
    .map((entry) => entry.def);
}

export function QuickAdd({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const addStep = useAddStep();
  const steps = usePaletteGroups().flatMap((group) => group.steps);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("");
  const matches = rankSteps(steps, query);
  const values = matches.map(itemValue);
  const highlighted = values.includes(active) ? active : (values[0] ?? "");
  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
      title="Add step"
      description="Search every step you can add to this workflow"
    >
      <Command shouldFilter={false} value={highlighted} onValueChange={setActive}>
        <CommandInput placeholder="Add a step…" value={query} onValueChange={setQuery} />
        <CommandList>
          {!query.trim() ? (
            <p className="px-3 py-6 text-center text-[13px] text-faint">Type to search steps</p>
          ) : matches.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-faint">No step matches.</p>
          ) : (
            matches.map((def) => (
              <StepItem
                key={def.key}
                def={def}
                compact
                draggable={false}
                onPick={(step) => {
                  addStep(step);
                  onOpenChange(false);
                  setQuery("");
                }}
              />
            ))
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
