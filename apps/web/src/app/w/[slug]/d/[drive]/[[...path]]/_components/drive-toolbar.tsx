"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@metis/ui/components/breadcrumb";
import { Button } from "@metis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import { ChevronDown, FolderPlus, Grid3x3, LayoutGrid, List, Upload } from "lucide-react";

import { AgentToggle } from "@/components/agent/agent-toggle";
import { MobileAsideTrigger } from "@/components/mobile-aside";
import { SearchInput } from "@/components/search-input";

import { DRIVE_VIEWS, type DriveView } from "./drive-entries";

const VIEW_OPTIONS: Record<DriveView, { label: string; icon: typeof List }> = {
  list: { label: "List", icon: List },
  compact: { label: "Compact grid", icon: Grid3x3 },
  large: { label: "Large grid", icon: LayoutGrid },
};

export interface Crumb {
  id: string | null;
  name: string;
}

export function DriveToolbar({
  crumbs,
  query,
  view,
  onNavigate,
  onQueryChange,
  onViewChange,
  onNewFolder,
  onUpload,
  showAgentToggle,
  agentOpen,
  onToggleAgent,
}: {
  crumbs: Crumb[];
  query: string;
  view: DriveView;
  onNavigate: (index: number) => void;
  onQueryChange: (value: string) => void;
  onViewChange: (view: DriveView) => void;
  onNewFolder: () => void;
  onUpload: () => void;
  showAgentToggle: boolean;
  agentOpen: boolean;
  onToggleAgent: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
      <MobileAsideTrigger className="-ml-1.5 size-8 shrink-0" />
      <Breadcrumb className="min-w-40 flex-1 overflow-hidden">
        <BreadcrumbList>
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <BreadcrumbItem key={crumb.id ?? "root"}>
                {last ? (
                  <BreadcrumbPage className="truncate">{crumb.name}</BreadcrumbPage>
                ) : (
                  <>
                    <BreadcrumbLink
                      render={
                        <button
                          type="button"
                          onClick={() => onNavigate(index)}
                          className="truncate"
                        >
                          {crumb.name}
                        </button>
                      }
                    />
                    <BreadcrumbSeparator />
                  </>
                )}
              </BreadcrumbItem>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <SearchInput
        label="Search this drive"
        placeholder="Search this drive"
        value={query}
        onValueChange={onQueryChange}
        className="w-56"
      />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              aria-label={`View: ${VIEW_OPTIONS[view].label}`}
              title={`View: ${VIEW_OPTIONS[view].label}`}
              className="gap-1 px-2"
            >
              <CurrentViewIcon view={view} />
              <ChevronDown className="size-3" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuRadioGroup
            value={view}
            onValueChange={(next) => {
              const picked = DRIVE_VIEWS.find((option) => option === next);
              if (picked) onViewChange(picked);
            }}
          >
            {DRIVE_VIEWS.map((option) => {
              const { label, icon: Icon } = VIEW_OPTIONS[option];
              return (
                <DropdownMenuRadioItem key={option} value={option}>
                  <Icon className="size-3.5" />
                  {label}
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="outline" size="sm" onClick={onNewFolder}>
        <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
        New folder
      </Button>

      <Button size="sm" onClick={onUpload}>
        <Upload className="mr-1.5 h-3.5 w-3.5" />
        Upload
      </Button>

      {showAgentToggle && (
        <AgentToggle label="Drive AI" open={agentOpen} onToggle={onToggleAgent} />
      )}
    </div>
  );
}

function CurrentViewIcon({ view }: { view: DriveView }) {
  const Icon = VIEW_OPTIONS[view].icon;
  return <Icon className="h-4 w-4" />;
}
