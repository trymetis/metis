"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import { Spinner } from "@metis/ui/components/spinner";
import { addDays, format, parseISO } from "date-fns";
import { CalendarPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { viewerTimeZone } from "@/calendar/layout";
import { calendarName } from "@/connections/calendar-name";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc } from "@/lib/orpc";
import type { SummaryCardProps } from "@/mail/summary-catalog";
import { ALL_CALENDARS_SLUG } from "@/workspace/path";

import { CardAction, type CardActionIntent } from "./card-parts";
import { DATE_ONLY, parseWhen } from "./format";

interface WritableCalendar {
  accountId: string;
  calendarId: string;
  name: string;
  accountName: string;
}

const EMAIL = /[^\s<>(),;"]+@[^\s<>(),;"]+\.[^\s<>(),;"]+/;

function attendeeEmails(attendees: readonly string[]): string[] | undefined {
  const emails = [
    ...new Set(
      attendees.flatMap((attendee) => {
        const match = EMAIL.exec(attendee);
        return match ? [match[0].toLowerCase()] : [];
      }),
    ),
  ];
  return emails.length > 0 ? emails : undefined;
}

function eventTimes(props: SummaryCardProps<"Meeting">): {
  start: string;
  end: string;
  allDay: boolean;
} | null {
  const start = parseWhen(props.start);
  if (!start) return null;
  if (props.allDay || DATE_ONLY.test(props.start)) {
    const day = format(start, "yyyy-MM-dd");
    const endDay = parseWhen(props.end);
    const last = endDay && endDay > start ? format(endDay, "yyyy-MM-dd") : day;
    const exclusive = format(addDays(parseISO(last), last === day ? 1 : 0), "yyyy-MM-dd");
    return {
      start: `${day}T00:00:00.000Z`,
      end: `${exclusive}T00:00:00.000Z`,
      allDay: true,
    };
  }
  const end = parseWhen(props.end);
  return {
    start: start.toISOString(),
    end: (end && end > start ? end : new Date(start.getTime() + 3_600_000)).toISOString(),
    allDay: false,
  };
}

export function AddToCalendar({
  props,
  intent,
}: {
  props: SummaryCardProps<"Meeting">;
  intent?: CardActionIntent;
}) {
  const scope = useWorkspaceScope();
  const [calendars, setCalendars] = useState<WritableCalendar[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const times = eventTimes(props);

  function load() {
    if (calendars || loadError) return;
    Promise.all([
      orpc.calendarEvents.calendars({ ...scope, calendarSlug: ALL_CALENDARS_SLUG }),
      orpc.workspaceCalendars.list({ workspaceSlug: scope.workspaceSlug }),
    ])
      .then(([{ calendars: list }, { calendars: accounts }]) => {
        const accountName = (accountId: string, email: string) => {
          const account = accounts.find((a) => a.calendarId === accountId);
          return account ? calendarName(account, accounts) : email;
        };
        setCalendars(
          list
            .filter((c) => c.visible && !c.readOnly)
            .toSorted((a, b) => Number(b.primary) - Number(a.primary))
            .map((c) => ({
              accountId: c.accountId,
              calendarId: c.id,
              name: c.name,
              accountName: accountName(c.accountId, c.accountEmail),
            })),
        );
      })
      .catch(() => setLoadError(true));
  }

  async function add(target: WritableCalendar) {
    if (!times) return;
    setSaving(true);
    try {
      await orpc.calendarEvents.create({
        ...scope,
        calendarSlug: ALL_CALENDARS_SLUG,
        accountId: target.accountId,
        calendarId: target.calendarId,
        title: props.title,
        location: props.location ?? props.meetingUrl ?? undefined,
        description: props.meetingUrl ?? undefined,
        start: times.start,
        end: times.end,
        allDay: times.allDay,
        timeZone: props.timeZone ?? viewerTimeZone(),
        attendees: attendeeEmails(props.attendees),
      });
      toast.success(`Added to ${target.name}`);
    } catch {
      toast.error("Couldn't add the event");
    } finally {
      setSaving(false);
    }
  }

  if (!times) return null;

  return (
    <DropdownMenu onOpenChange={(open) => open && load()}>
      <DropdownMenuTrigger
        render={
          <CardAction intent={intent} icon={CalendarPlus} loading={saving}>
            Add to calendar
          </CardAction>
        }
      />
      <DropdownMenuContent align="start" className="w-64">
        {loadError || calendars?.length === 0 ? (
          <div className="px-2 py-1.5 text-[12px] text-faint">
            No calendar you can write to in this workspace
          </div>
        ) : !calendars ? (
          <div className="flex items-center gap-2 px-2 py-1.5 text-[12px] text-faint">
            <Spinner className="size-3" />
            Loading calendars…
          </div>
        ) : (
          calendars.map((c) => (
            <DropdownMenuItem key={`${c.accountId}::${c.calendarId}`} onClick={() => add(c)}>
              <div className="min-w-0">
                <div className="truncate text-[13px]">{c.name}</div>
                <div className="truncate text-[11px] text-faint">{c.accountName}</div>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
