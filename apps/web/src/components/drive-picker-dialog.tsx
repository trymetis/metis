"use client";

import { Button } from "@metis/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@metis/ui/components/dialog";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";

import { DriveIcon } from "@/components/drive-icon";
import type { DriveProvider } from "@/connections/types";
import { driveName } from "@/drive/name";
import { useWorkspaceSlug } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";
import type { DriveEntryRow, WorkspaceDrive } from "@/server/schema";
import { ALL_DRIVES_SLUG } from "@/workspace/path";

interface Crumb {
  id: string | null;
  name: string;
}

export interface DrivePick {
  folderId: string;
  label: string;
}

export const SHARE_LINK_PROVIDERS: readonly DriveProvider[] = ["google", "microsoft"];

export function DrivePickerDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  mode,
  providers,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  mode: "folder" | "file";
  providers?: readonly DriveProvider[];
  onPick: (pick: DrivePick) => void;
}) {
  const workspaceSlug = useWorkspaceSlug();

  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, name: "Drives" }]);
  const [selectedFile, setSelectedFile] = useState<DriveEntryRow | null>(null);
  const drivesQuery = useQuery(
    rpc.workspaceDrives.list.queryOptions({ input: { workspaceSlug }, enabled: open }),
  );
  const drives: WorkspaceDrive[] = drivesQuery.data?.drives ?? [];

  const current = crumbs.at(-1) ?? { id: null, name: "Drives" };
  const entriesQuery = useQuery(
    rpc.drive.list.queryOptions({
      input: { workspaceSlug, driveSlug: ALL_DRIVES_SLUG, parentId: current.id },
      enabled: open,
    }),
  );
  const entries: DriveEntryRow[] = entriesQuery.data?.entries ?? [];
  const loading = entriesQuery.isPending && !entriesQuery.isError;
  const error = entriesQuery.isError ? "Could not read your drives" : null;

  const nameOf = (entry: DriveEntryRow) => {
    if (current.id !== null) return entry.name;
    const drive = drives.find((d) => d.driveId === entry.driveId);
    if (!drive) return entry.name;
    return driveName(drive, drives);
  };

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCrumbs([{ id: null, name: "Drives" }]);
      setSelectedFile(null);
    }
  }

  function enter(entry: DriveEntryRow) {
    setCrumbs((trail) => [...trail, { id: entry.id, name: nameOf(entry) }]);
    setSelectedFile(null);
  }

  function upTo(index: number) {
    setCrumbs(crumbs.slice(0, index + 1));
    setSelectedFile(null);
  }

  const shown =
    current.id === null && providers
      ? entries.filter((entry) => {
          const provider = drives.find((d) => d.driveId === entry.driveId)?.provider;
          return provider !== undefined && providers.includes(provider);
        })
      : entries;

  const canConfirm = mode === "folder" ? current.id !== null : selectedFile !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-1 text-[12px] text-faint">
          {crumbs.map((crumb, index) => (
            <span key={crumb.id ?? "root"} className="flex items-center gap-1 min-w-0">
              {index > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
              <button
                type="button"
                onClick={() => upTo(index)}
                className="truncate hover:text-foreground"
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        <div className="h-64 overflow-y-auto rounded-lg border border-border">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-faint" />
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center p-4 text-center text-[12px] text-faint">
              {error}
            </div>
          ) : shown.length === 0 ? (
            <div className="flex h-full items-center justify-center p-4 text-center text-[12px] text-faint">
              Nothing here
            </div>
          ) : (
            shown.map((entry) => {
              const picked = selectedFile?.id === entry.id;
              return (
                <button
                  type="button"
                  key={entry.id}
                  onClick={() =>
                    entry.kind === "folder"
                      ? enter(entry)
                      : mode === "file" && setSelectedFile(entry)
                  }
                  className={`flex w-full items-center gap-2.5 border-border/60 border-b px-3 py-2 text-left transition-colors hover:bg-hover ${
                    picked ? "bg-brand-soft" : ""
                  } ${entry.kind === "file" && mode === "folder" ? "opacity-50" : ""}`}
                >
                  <DriveIcon name={entry.name} kind={entry.kind} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                    {nameOf(entry)}
                  </span>
                  {entry.kind === "folder" && (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" />
                  )}
                </button>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canConfirm}
            onClick={() => {
              if (mode === "file" && selectedFile) {
                onPick({ folderId: selectedFile.id, label: selectedFile.name });
                return;
              }
              if (current.id) {
                onPick({ folderId: current.id, label: current.name });
              }
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
