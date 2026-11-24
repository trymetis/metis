"use client";

import { useEffect, useMemo } from "react";

import { useDriveNavigation } from "@/drive/navigation";
import { type ChordBindings, isTypingTarget, useChord } from "@/hooks/use-chord";

import type { DriveView } from "./drive-entries";

export const DRIVE_CHORD_PREFIX = "d";

export const DRIVE_UNCHORDED: [string[], string][] = [
  [["j", "n"], "Forward"],
  [["k", "p"], "Back"],
];

export function useDriveShortcuts({
  onNewFolder,
  onUpload,
  onViewChange,
  onRoot,
  onAllDrives,
  onToggleAgent,
  onPreview,
}: {
  onNewFolder: () => void;
  onUpload: () => void;
  onViewChange: (view: DriveView) => void;
  onRoot: () => void;
  onAllDrives: () => void;
  onToggleAgent?: () => void;
  onPreview: () => void;
}) {
  const { back, forward } = useDriveNavigation();

  const bindings = useMemo<ChordBindings>(
    () => ({
      n: { label: "New folder", run: onNewFolder },
      u: { label: "Upload", run: onUpload },
      s: {
        label: "Search",
        run: () => {
          document
            .querySelector<HTMLInputElement>('input[placeholder="Search this drive"]')
            ?.focus();
        },
      },
      l: { label: "List", run: () => onViewChange("list") },
      c: { label: "Compact grid", run: () => onViewChange("compact") },
      g: { label: "Large grid", run: () => onViewChange("large") },
      r: { label: "Drive root", run: onRoot },
      h: { label: "All drives", run: onAllDrives },
      p: { label: "Preview", run: onPreview },
      ...(onToggleAgent ? { a: { label: "Agent", run: onToggleAgent } } : {}),
    }),
    [onNewFolder, onUpload, onViewChange, onRoot, onAllDrives, onToggleAgent, onPreview],
  );

  const chord = useChord({ prefix: DRIVE_CHORD_PREFIX, bindings });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

      if (e.key === "j" || e.key === "n") {
        e.preventDefault();
        forward();
      } else if (e.key === "k" || e.key === "p") {
        e.preventDefault();
        back();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, forward]);

  return { ...chord, bindings };
}
