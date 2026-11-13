"use client";

import { Button } from "@metis/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@metis/ui/components/collapsible";
import { cn } from "@metis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { dashboardNav, type NavEntry } from "@/components/dashboard/dashboard-nav";
import { useDashboardRole } from "@/components/dashboard/dashboard-role";
import { GuardedLink } from "@/components/dashboard/guarded-link";
import { ResponsiveAside } from "@/components/mobile-aside";
import { SourceLink } from "@/components/source-link";
import { rpc } from "@/lib/orpc";
import type { SourceInfo } from "@/source-info";
import { workspaceRootPath } from "@/workspace/path";

import { PreflightBar } from "./preflight-bar";

function navItemClass(active: boolean, nested: boolean) {
  return cn(
    "flex items-center rounded-md px-2.5 text-[13px] transition-colors",
    nested ? "gap-2 py-1.25" : "gap-2.5 py-1.75",
    active
      ? "bg-brand-soft text-primary"
      : "text-muted-foreground hover:bg-hover hover:text-foreground",
  );
}

function NavLink({
  entry,
  href,
  pathname,
  nested,
  className,
}: {
  entry: NavEntry;
  href: NonNullable<NavEntry["href"]>;
  pathname: string;
  nested: boolean;
  className?: string;
}) {
  const active = pathname === href;
  const Icon = entry.icon;
  return (
    <GuardedLink
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(navItemClass(active, nested), className)}
    >
      {Icon && (
        <Icon className={cn("shrink-0", nested ? "h-3.5 w-3.5" : "h-4 w-4")} strokeWidth={1.75} />
      )}
      <span className="truncate">{entry.label}</span>
    </GuardedLink>
  );
}

function NavSection({
  entry,
  href,
  pathname,
  nested,
}: {
  entry: NavEntry;
  href: NonNullable<NavEntry["href"]>;
  pathname: string;
  nested: boolean;
}) {
  const inSection = pathname === href || pathname.startsWith(`${href}/`);
  const [open, setOpen] = useState(inSection);
  const [wasInSection, setWasInSection] = useState(inSection);

  if (inSection !== wasInSection) {
    setWasInSection(inSection);
    if (inSection) setOpen(true);
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-px">
        <NavLink
          entry={entry}
          href={href}
          pathname={pathname}
          nested={nested}
          className="min-w-0 flex-1"
        />
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={open ? `Collapse ${entry.label}` : `Expand ${entry.label}`}
              className="text-muted-foreground"
            />
          }
        >
          <ChevronRight
            className={cn("transition-transform", open && "rotate-90")}
            strokeWidth={1.75}
          />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="mt-px ml-4.5 flex flex-col gap-px border-l border-border pl-2">
          <NavEntries entries={entry.children ?? []} pathname={pathname} nested />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function NavEntries({
  entries,
  pathname,
  nested,
}: {
  entries: NavEntry[];
  pathname: string;
  nested: boolean;
}) {
  return entries.map((entry) => {
    const key = entry.href ?? entry.label;
    if (!entry.href) {
      return (
        <div key={key} className="flex flex-col gap-px">
          <p className="mt-2 mb-0.5 px-2.5 text-[10px] font-medium tracking-wide text-faint uppercase">
            {entry.label}
          </p>
          <NavEntries entries={entry.children ?? []} pathname={pathname} nested={nested} />
        </div>
      );
    }
    if (entry.children) {
      return (
        <NavSection key={key} entry={entry} href={entry.href} pathname={pathname} nested={nested} />
      );
    }
    return (
      <NavLink key={key} entry={entry} href={entry.href} pathname={pathname} nested={nested} />
    );
  });
}

export function DashboardSidebar({ source }: { source: SourceInfo }) {
  const pathname = usePathname();
  const updatesEnabled =
    useQuery(rpc.dashboard.system.updatesEnabled.queryOptions()).data?.enabled ?? false;
  const owner = useDashboardRole().role === "owner";

  return (
    <ResponsiveAside label="Dashboard">
      <aside
        className="sticky top-10 flex h-[calc(100dvh-5rem)] w-52 shrink-0 flex-col pt-1 max-md:static max-md:h-full max-md:w-full max-md:p-4"
        aria-label="Dashboard"
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <GuardedLink
            href={workspaceRootPath()}
            className="mb-4 flex items-center gap-1.5 text-[13px] text-faint transition-colors hover:text-muted-foreground"
          >
            Back
          </GuardedLink>

          <h1 className="mb-4 font-serif text-[22px] font-medium tracking-tight text-foreground">
            Dashboard
          </h1>

          <nav className="flex flex-col gap-px">
            <NavEntries
              entries={dashboardNav({ updatesEnabled, owner })}
              pathname={pathname}
              nested={false}
            />
          </nav>
        </div>
        <PreflightBar />
        <SourceLink source={source} className="mt-3 shrink-0 px-2.5" />
      </aside>
    </ResponsiveAside>
  );
}
