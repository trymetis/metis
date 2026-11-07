"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metis/ui/components/tooltip";
import {
  BookUser,
  CalendarDays,
  ChevronDown,
  HardDrive,
  History,
  Inbox,
  LayoutGrid,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import Link from "next/link";

import type { WorkspaceItem } from "@/hooks/use-workspaces";
import { getInitials } from "@/lib/utils";
import { workspaceSettingsPath } from "@/workspace/path";

interface WorkspaceMenuTileProps {
  workspace: WorkspaceItem | undefined;
  workspaceSlug: string;
}

export function WorkspaceMenuTile({ workspace, workspaceSlug }: WorkspaceMenuTileProps) {
  const name = workspace?.name ?? "Workspace";
  const canSeeActivity = workspace?.role === "owner" || workspace?.role === "admin";

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={`${name} menu`}
                  className="relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-brand-soft text-[13px] font-medium tracking-wide text-primary transition-colors hover:bg-hover"
                >
                  <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl">
                    {workspace?.logo ? (
                      // oxlint-disable-next-line nextjs/no-img-element --tiny data-URL logo, next/image adds nothing
                      <img src={workspace.logo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      getInitials(name).slice(0, 2)
                    )}
                  </span>
                  <span className="absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full border-[1.5px] border-panel bg-surface text-muted-foreground">
                    <ChevronDown className="size-2" strokeWidth={3} />
                  </span>
                </button>
              }
            />
          }
        />
        <TooltipContent side="right" className="pointer-coarse:hidden">
          {name}
          {workspace && <span className="text-muted-foreground">· {workspace.role}</span>}
        </TooltipContent>
      </Tooltip>

      <DropdownMenuContent side="right" align="start" className="w-56">
        <div className="px-2 py-1.5">
          <p className="truncate text-xs font-medium text-foreground">{name}</p>
          {workspace && (
            <p className="text-[10px] uppercase tracking-[1px] text-faint">{workspace.role}</p>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href={workspaceSettingsPath(workspaceSlug, "general")} />}>
          <SlidersHorizontal />
          General
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={workspaceSettingsPath(workspaceSlug, "members")} />}>
          <Users />
          Members
        </DropdownMenuItem>
        <DropdownMenuItem
          render={<Link href={workspaceSettingsPath(workspaceSlug, "mailboxes")} />}
        >
          <Inbox />
          Mailboxes
        </DropdownMenuItem>
        <DropdownMenuItem
          render={<Link href={workspaceSettingsPath(workspaceSlug, "calendars")} />}
        >
          <CalendarDays />
          Calendars
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={workspaceSettingsPath(workspaceSlug, "drives")} />}>
          <HardDrive />
          Drives
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={workspaceSettingsPath(workspaceSlug, "contacts")} />}>
          <BookUser />
          Contacts
        </DropdownMenuItem>
        {canSeeActivity && (
          <DropdownMenuItem
            render={<Link href={workspaceSettingsPath(workspaceSlug, "activity")} />}
          >
            <History />
            Activity
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/settings/workspaces" />}>
          <LayoutGrid />
          All workspaces
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
