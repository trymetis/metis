"use client";

import { Button } from "@metis/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@metis/ui/components/tooltip";
import { BotOff, X } from "lucide-react";
import Link from "next/link";

import { workspaceSettingsPath } from "@/workspace/path";

const RESOURCE_SETTINGS = {
  mailbox: { href: "/settings/mailboxes", label: "Your mailboxes" },
  calendar: { href: "/settings/calendars", label: "Your calendars" },
  drive: { href: "/settings/drives", label: "Your drives" },
  addressbook: { href: "/settings/address-books", label: "Your address books" },
} as const;

export function AgentDisabled({
  scopeLabel,
  workspaceSlug,
  reason,
  resource,
  onClose,
}: {
  scopeLabel: string;
  workspaceSlug: string;
  reason: "workspace" | "resource";
  resource: keyof typeof RESOURCE_SETTINGS;
  onClose?: () => void;
}) {
  const body =
    reason === "workspace"
      ? "This workspace has AI turned off, so the assistant is unavailable here."
      : `AI is turned off for ${scopeLabel}, so the assistant has nothing it can read.`;

  const href =
    reason === "workspace"
      ? workspaceSettingsPath(workspaceSlug, "general")
      : RESOURCE_SETTINGS[resource].href;

  const cta = reason === "workspace" ? "Workspace settings" : RESOURCE_SETTINGS[resource].label;

  return (
    <TooltipProvider delay={200}>
      <div className="flex h-full w-full flex-col border-border border-l bg-panel">
        <div className="flex items-center gap-2.5 border-border-soft border-b px-4 py-3.5">
          <div className="flex-1">
            <p className="font-medium font-serif text-[16px] text-foreground">Metis AI</p>
            <p className="text-[11px] text-faint">Unavailable</p>
          </div>
          {onClose && (
            <Button aria-label="Close assistant" onClick={onClose} size="icon-sm" variant="ghost">
              <X className="size-4" />
            </Button>
          )}
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <Tooltip>
            <TooltipTrigger
              render={
                <span aria-label={body}>
                  <BotOff className="size-10 text-faint opacity-40" />
                </span>
              }
            />
            <TooltipContent>{body}</TooltipContent>
          </Tooltip>
          <p className="font-serif text-muted-foreground text-sm">Assistant turned off</p>
          <p className="max-w-[16rem] text-[12px] text-faint">{body}</p>
          <Button
            className="mt-1"
            nativeButton={false}
            render={<Link href={href}>{cta}</Link>}
            size="sm"
            variant="outline"
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
