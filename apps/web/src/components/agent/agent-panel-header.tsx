"use client";

import { Eraser, Sparkles, X } from "lucide-react";

import { IconButton } from "@/components/icon-button";

import { type AgentScopeKind, useAgentScopeName } from "./use-scope-name";

export function AgentPanelHeader({
  kind,
  slug,
  onClear,
  onClose,
}: {
  kind: AgentScopeKind;
  slug: string;
  onClear?: () => void;
  onClose: () => void;
}) {
  const name = useAgentScopeName(kind, slug);
  return (
    <div className="flex items-center gap-2 border-border-soft border-b px-4 py-3">
      <Sparkles className="size-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 truncate font-medium text-[14px] text-foreground">{name}</p>
      {onClear && (
        <IconButton label="Clear chat" onClick={onClear}>
          <Eraser className="size-4" />
        </IconButton>
      )}
      <IconButton label="Close assistant" onClick={onClose}>
        <X className="size-4" />
      </IconButton>
    </div>
  );
}
