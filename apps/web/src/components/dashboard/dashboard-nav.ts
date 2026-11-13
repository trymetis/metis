import {
  Cable,
  ChartNoAxesColumn,
  History,
  LayoutDashboard,
  Plug,
  Settings2,
  UserRound,
  Users,
  Workflow,
} from "lucide-react";
import type { Route } from "next";
import type { ComponentType } from "react";

import { ACCOUNTS_NAV, ACCOUNTS_ROOT } from "./accounts-nav";
import {
  SYSTEM_DRIVERS_NAV,
  SYSTEM_EXPORTS_NAV,
  SYSTEM_HISTORY_NAV,
  SYSTEM_INSTANCE_NAV,
  SYSTEM_PROVIDERS_NAV,
  SYSTEM_ROOT,
  SYSTEM_UPDATES_NAV,
} from "./system-nav";

export type NavIcon = ComponentType<{ className?: string; strokeWidth?: number }>;

export interface NavEntry {
  href?: Route;
  label: string;
  icon?: NavIcon;
  children?: NavEntry[];
}

function link({ href, label, icon }: { href: Route; label: string; icon: NavIcon }): NavEntry {
  return { href, label, icon };
}

export function dashboardNav(opts: { updatesEnabled: boolean; owner: boolean }): NavEntry[] {
  return [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/usage", label: "AI usage", icon: ChartNoAxesColumn },
    { href: "/dashboard/connections", label: "Connections", icon: Cable },
    { href: ACCOUNTS_ROOT, label: "Accounts", icon: UserRound, children: ACCOUNTS_NAV.map(link) },
    { href: "/dashboard/workspaces", label: "Workspaces", icon: Users },
    { href: "/dashboard/automation", label: "Automation", icon: Workflow },
    { href: "/dashboard/mcp", label: "MCP clients", icon: Plug },
    { href: "/dashboard/audit", label: "Audit log", icon: History },
    {
      href: SYSTEM_ROOT,
      label: "System",
      icon: Settings2,
      children: [
        link(SYSTEM_INSTANCE_NAV),
        link(SYSTEM_HISTORY_NAV),
        ...(opts.updatesEnabled ? [link(SYSTEM_UPDATES_NAV)] : []),
        ...(opts.owner ? [link(SYSTEM_EXPORTS_NAV)] : []),
        { label: "Drivers", children: SYSTEM_DRIVERS_NAV.map(link) },
        {
          label: "Providers",
          children: SYSTEM_PROVIDERS_NAV.map(({ href, label, Mark }) => ({
            href,
            label,
            icon: Mark,
          })),
        },
      ],
    },
  ];
}
