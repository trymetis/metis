"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@metis/ui/components/card";
import {
  BookUser,
  CalendarDays,
  HardDrive,
  Loader2,
  type LucideIcon,
  Mail,
  UserRound,
  Users,
} from "lucide-react";

import { useSystemData } from "@/components/dashboard/system-client";
import { rpc } from "@/lib/orpc";
import type { DashboardStats } from "@/server/schema";

const STAT_CARDS: {
  key: keyof DashboardStats;
  label: string;
  hint: string;
  icon: LucideIcon;
}[] = [
  {
    key: "users",
    label: "Users",
    hint: "Accounts on this instance",
    icon: UserRound,
  },
  {
    key: "workspaces",
    label: "Workspaces",
    hint: "Personal and shared",
    icon: Users,
  },
  {
    key: "mailboxes",
    label: "Mailboxes",
    hint: "Connected across all accounts",
    icon: Mail,
  },
  {
    key: "calendars",
    label: "Calendars",
    hint: "Connected across all accounts",
    icon: CalendarDays,
  },
  {
    key: "drives",
    label: "Drives",
    hint: "Connected across all accounts",
    icon: HardDrive,
  },
  {
    key: "addressBooks",
    label: "Address books",
    hint: "Connected across all accounts",
    icon: BookUser,
  },
];

export function StatCards() {
  const stats: DashboardStats | null = useSystemData(
    rpc.dashboard.stats.queryOptions(),
    "Could not load the stats",
  );

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {STAT_CARDS.map(({ key, label, hint, icon: Icon }) => (
        <Card key={key} size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
              {label}
            </CardTitle>
            <CardDescription className="text-[11px] text-faint">{hint}</CardDescription>
          </CardHeader>
          <CardContent>
            {stats === null ? (
              <Loader2 className="h-4 w-4 animate-spin opacity-50" />
            ) : (
              <span className="font-serif text-[32px] leading-none font-medium tracking-tight text-foreground tabular-nums">
                {stats[key].toLocaleString()}
              </span>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
