"use client";

import { Button } from "@metis/ui/components/button";
import { Checkbox } from "@metis/ui/components/checkbox";
import { useQuery } from "@tanstack/react-query";
import { startOfHour } from "date-fns";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { SidebarSection } from "@/components/sidebar-section";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";
import type { SessionCalendar, WorkspaceCalendar } from "@/server/schema";
import { workspaceSettingsPath } from "@/workspace/path";

import { useCalendar } from "./calendar-context";
import { CalendarSwitcher } from "./calendar-switcher";
import { calendarColor } from "./event-colors";
import { MiniMonth } from "./mini-month";

function groupByAccount(
  calendars: SessionCalendar[],
): { accountId: string; email: string; calendars: SessionCalendar[] }[] {
  const groups = new Map<string, SessionCalendar[]>();
  for (const calendar of calendars) {
    const list = groups.get(calendar.accountId) ?? [];
    list.push(calendar);
    groups.set(calendar.accountId, list);
  }
  return [...groups.entries()].map(([accountId, list]) => ({
    accountId,
    email: list[0]?.accountEmail ?? "",
    calendars: list,
  }));
}

export function CalendarSidebar() {
  const scope = useWorkspaceScope();
  const { calendars, accountName, hidden, toggleCalendar, date, setDate, setDraft } = useCalendar();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const attachedQuery = useQuery(rpc.workspaceCalendars.list.queryOptions({ input: scope }));
  const attached: WorkspaceCalendar[] | null =
    attachedQuery.data?.calendars ?? (attachedQuery.isError ? [] : null);

  const visible = useMemo(() => calendars.filter((c) => c.visible), [calendars]);
  const groups = useMemo(() => groupByAccount(visible), [visible]);
  const grouped = groups.length > 1;

  const mine = attached?.find((c) => c.ownedByMe) ?? null;

  function createAtNextHour() {
    const start = startOfHour(new Date(Date.now() + 60 * 60 * 1000));
    setDraft({
      start,
      end: new Date(start.getTime() + 60 * 60 * 1000),
      allDay: false,
    });
  }

  return (
    <aside
      className="flex w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r border-border bg-panel px-3 py-4"
      aria-label="Calendars"
    >
      <CalendarSwitcher calendars={attached} />

      <Button className="h-10 w-full rounded-[10px] tracking-[0.2px]" onClick={createAtNextHour}>
        <Plus strokeWidth={2.2} />
        New event
      </Button>

      <MiniMonth selected={date} onSelect={setDate} />

      <div className="flex flex-col gap-4">
        {groups.map((group) => {
          const rows = group.calendars.map((calendar) => (
            <label
              key={`${calendar.accountId}:${calendar.id}`}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-hover"
            >
              <Checkbox
                checked={!hidden.has(calendar.id)}
                onCheckedChange={() => toggleCalendar(calendar.id)}
                aria-label={`Show ${calendar.name}`}
                style={{
                  backgroundColor: hidden.has(calendar.id)
                    ? undefined
                    : calendarColor(calendar.id, calendar.color),
                  borderColor: calendarColor(calendar.id, calendar.color),
                }}
              />
              <span className="truncate text-[13px] text-muted-foreground">{calendar.name}</span>
            </label>
          ));
          if (!grouped) {
            return (
              <div key={group.accountId} className="space-y-px">
                {rows}
              </div>
            );
          }
          return (
            <SidebarSection
              key={group.accountId}
              label={accountName(group.accountId, group.email)}
              className="mb-0 px-0"
              collapsed={collapsed.has(group.accountId)}
              onToggle={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(group.accountId)) next.delete(group.accountId);
                  else next.add(group.accountId);
                  return next;
                })
              }
            >
              {rows}
            </SidebarSection>
          );
        })}

        {visible.length === 0 && attached !== null && (
          <div className="flex flex-col items-start gap-2 px-1.5">
            <p className="text-[12px] text-faint">
              {mine
                ? "None of your calendars are showing in this workspace yet."
                : "No calendars are showing in this workspace yet."}
            </p>
            {mine ? (
              <Link
                href={workspaceSettingsPath(
                  scope.workspaceSlug,
                  "calendars",
                  `?calendar=${encodeURIComponent(mine.calendarId)}`,
                )}
                className="text-[12px] text-primary underline-offset-2 hover:underline"
              >
                Choose which calendars to show
              </Link>
            ) : (
              <>
                <p className="text-[12px] text-faint">Ask someone in this workspace to add one.</p>
                <Link
                  href={workspaceSettingsPath(scope.workspaceSlug, "calendars")}
                  className="text-[12px] text-primary underline-offset-2 hover:underline"
                >
                  Calendar settings
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
