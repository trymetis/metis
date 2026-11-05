"use client";

import {
  Combobox,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@metis/ui/components/combobox";

import { RemovableChip } from "@/components/removable-chip";
import type { McpAccess } from "@/server/schema";

type Workspace = McpAccess["workspaces"][number];

export function WorkspaceSelect({
  workspaces,
  selected,
  onChange,
}: {
  workspaces: readonly Workspace[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  const anchorRef = useComboboxAnchor();
  const chosen = new Set(selected);
  const value = workspaces.filter((w) => chosen.has(w.id));

  return (
    <Combobox
      multiple
      items={[...workspaces]}
      value={value}
      onValueChange={(next: Workspace[]) => onChange(next.map((w) => w.id))}
      itemToStringLabel={(w: Workspace) => w.name}
    >
      <ComboboxChips ref={anchorRef} className="w-full">
        {value.map((w) => (
          <RemovableChip key={w.id} label={w.name}>
            {w.name}
          </RemovableChip>
        ))}
        <ComboboxChipsInput
          aria-label="Workspaces this app can reach"
          placeholder={value.length === 0 ? "Add a workspace…" : "Add workspace"}
          className="min-w-28 bg-transparent py-0.5 text-xs text-foreground placeholder:text-faint"
        />
      </ComboboxChips>
      <ComboboxContent anchor={anchorRef}>
        <ComboboxEmpty>No workspace matches</ComboboxEmpty>
        <ComboboxList>
          {(w: Workspace) => (
            <ComboboxItem key={w.id} value={w} disabled={!w.aiAvailable}>
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {!w.aiAvailable && <span className="shrink-0 text-[11px] text-faint">AI off</span>}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
