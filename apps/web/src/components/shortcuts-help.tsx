"use client";

import { Button } from "@metis/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@metis/ui/components/dialog";
import { X } from "lucide-react";

import type { ChordBindings } from "@/hooks/use-chord";
import { useWorkspaces } from "@/hooks/use-workspaces";

export type ShortcutRow = [keys: string[], label: string];

interface ShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefix: string;
  bindings: ChordBindings;
  unchorded: ShortcutRow[];
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-5.5 items-center justify-center rounded border border-border bg-panel px-1.5 py-0.5 font-mono text-[10px] text-foreground">
      {children}
    </kbd>
  );
}

export function ShortcutsHelp({
  open,
  onOpenChange,
  prefix,
  bindings,
  unchorded,
}: ShortcutsHelpProps) {
  const { workspaces } = useWorkspaces();

  const sections: { title: string; rows: ShortcutRow[] }[] = [
    {
      title: `${prefix} + key`,
      rows: Object.entries(bindings).map(([key, binding]) => [[prefix, key], binding.label]),
    },
    {
      title: "Without a prefix",
      rows: [...unchorded, [["?"], "Show this help"]],
    },
  ];
  if (workspaces.length > 1) {
    sections.push({
      title: "Workspaces",
      rows: workspaces.slice(0, 5).map((w, i) => [["Alt", `${i + 1}`], `Switch to ${w.name}`]),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-full max-w-2xl gap-0 rounded-[10px] border border-border bg-surface p-0 shadow-2xl sm:max-w-2xl"
      >
        <div className="flex items-center justify-between border-b border-border-soft px-5 py-4">
          <DialogTitle className="text-[20px] font-normal tracking-tight text-foreground">
            Keyboard shortcuts
          </DialogTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
            className="text-faint"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="columns-1 gap-8 p-5 md:columns-2">
          {sections.map((section) => (
            <div key={section.title} className="mb-6 break-inside-avoid">
              <div className="mb-2 text-[11px] uppercase tracking-[1.5px] text-faint">
                {section.title}
              </div>
              <ul className="space-y-2">
                {section.rows.map(([keys, label]) => (
                  <li key={label} className="flex items-center justify-between gap-3">
                    <span className="text-[12px] text-muted-foreground">{label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-border-soft px-5 py-3 text-[11px] text-faint">
          Press <kbd className="font-mono">Esc</kbd> to close
        </div>
      </DialogContent>
    </Dialog>
  );
}
