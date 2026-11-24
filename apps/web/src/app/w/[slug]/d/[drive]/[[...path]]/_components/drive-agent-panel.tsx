"use client";

import type { Data } from "@dnd-kit/core";
import { File } from "lucide-react";
import { useMemo } from "react";

import { type AgentFile, toAgentFile } from "@/ai/turn";
import { AgentPanel } from "@/components/agent/agent-panel";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { formatBytes } from "@/lib/utils";
import type { DriveEntryRow } from "@/server/schema";

const SUGGESTIONS = [
  "What's in this folder?",
  "Find the latest invoice",
  "Which files changed this week?",
  "Summarise the notes file here",
];

export const DRIVE_ENTRY_DRAG = "drive-entry";

function sizeLabel(kind: "file" | "folder", size: number | null | undefined) {
  if (kind === "folder") return "Folder";
  return size === null || size === undefined ? "" : formatBytes(size);
}

function describe(file: AgentFile) {
  return { title: file.name, subtitle: sizeLabel(file.kind, file.size) };
}

function fromDrag(data: Data | undefined): AgentFile | null {
  const entry: DriveEntryRow | undefined = data?.entry;
  return data?.type === DRIVE_ENTRY_DRAG && entry ? toAgentFile(entry) : null;
}

export function DriveAgentPanel({
  driveSlug,
  folderId,
  folderPath,
  entries,
  onClose,
  onRefresh,
  onOpenEntry,
}: {
  driveSlug: string;
  folderId: string | null;
  folderPath: string[];
  entries: DriveEntryRow[];
  onClose: () => void;
  onRefresh: () => void;
  onOpenEntry: (entry: DriveEntryRow) => void;
}) {
  const scope = useWorkspaceScope();
  const candidates = useMemo(() => entries.map(toAgentFile), [entries]);
  const body = useMemo(() => ({ ...scope, driveSlug }), [scope, driveSlug]);

  return (
    <AgentPanel
      kind="drive"
      slug={driveSlug}
      api="/api/ai/chat/drive"
      body={body}
      logTag="[drive-agent]"
      name="Drive AI"
      icon={File}
      placeholder="Ask about these files…"
      emptyLabel={() => "Ask about these files"}
      suggestions={() => SUGGESTIONS}
      open={null}
      candidates={candidates}
      describe={describe}
      picker={{
        title: "Attach a file",
        placeholder: "Attach a file…",
        emptyLabel: "Nothing in this folder",
      }}
      onOpenItem={(item) => {
        const found = entries.find((entry) => entry.id === item.id);
        if (found) onOpenEntry(found);
      }}
      fromDrag={fromDrag}
      turn={(items) => ({
        kind: "drive",
        folderId: folderId ?? undefined,
        folderPath,
        files: items,
      })}
      onTurnFinished={onRefresh}
      onClose={onClose}
    />
  );
}
