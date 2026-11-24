"use client";

import { cn } from "@metis/ui/lib/utils";
import { Bot } from "lucide-react";

import { IconButton } from "@/components/icon-button";

export function AgentToggle({
  label,
  open,
  onToggle,
  className,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <IconButton
      label={label}
      variant="ghost"
      aria-pressed={open}
      onClick={onToggle}
      className={cn(
        "shrink-0",
        open && "bg-brand-soft text-primary hover:bg-brand-soft",
        className,
      )}
    >
      <Bot className="size-4" />
    </IconButton>
  );
}
