"use client";

import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { LucideIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

export function AgentDragContext({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  const [label, setLabel] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active }) => {
        const next: unknown = active.data.current?.label;
        setLabel(typeof next === "string" ? next : null);
      }}
      onDragEnd={() => setLabel(null)}
      onDragCancel={() => setLabel(null)}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {label && (
          <div className="flex max-w-70 items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5 shadow-lg">
            <Icon className="size-3 shrink-0 text-faint" strokeWidth={1.75} />
            <span className="min-w-0 truncate text-[12px] text-foreground">{label}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
