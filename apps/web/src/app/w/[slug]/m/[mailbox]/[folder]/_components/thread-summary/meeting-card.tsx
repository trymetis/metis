"use client";

import { Badge } from "@metis/ui/components/badge";
import { ButtonGroup, ButtonGroupText } from "@metis/ui/components/button-group";
import { cn } from "@metis/ui/lib/utils";
import {
  CalendarCheck,
  CalendarDays,
  Check,
  CircleHelp,
  Clock,
  Globe,
  type LucideIcon,
  MapPin,
  TriangleAlert,
  UserRound,
  Users,
  Video,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc } from "@/lib/orpc";
import type { SummaryCardProps } from "@/mail/summary-catalog";
import type { CalendarEventDto } from "@/server/schema";
import { WRITABLE_ATTENDEE_RESPONSES } from "@/types/calendar";
import { ALL_CALENDARS_SLUG } from "@/workspace/path";

import { AddToCalendar } from "./add-to-calendar";
import {
  CardAction,
  CardLink,
  CardShell,
  cardLabelClassName,
  Detail,
  Details,
  Title,
  CompactShell,
} from "./card-parts";
import { directionsUrl, formatRange, hostOf, humanize } from "./format";
import { useCalendarMatch } from "./use-calendar-match";

type Response = (typeof WRITABLE_ATTENDEE_RESPONSES)[number];

const RESPONSES: Record<Response, { label: string; icon: LucideIcon }> = {
  accepted: { label: "Yes", icon: Check },
  tentative: { label: "Maybe", icon: CircleHelp },
  declined: { label: "No", icon: X },
};

const MAX_GUESTS = 4;

function Rsvp({ event }: { event: CalendarEventDto }) {
  const scope = useWorkspaceScope();
  const [response, setResponse] = useState(event.myResponse);
  const [saving, setSaving] = useState<Response | null>(null);

  async function respond(next: Response) {
    setSaving(next);
    try {
      await orpc.calendarEvents.respond({
        ...scope,
        calendarSlug: ALL_CALENDARS_SLUG,
        accountId: event.accountId,
        calendarId: event.calendarId,
        eventId: event.id,
        response: next,
      });
      setResponse(next);
    } catch {
      toast.error("Couldn't send your response");
    } finally {
      setSaving(null);
    }
  }

  return (
    <ButtonGroup aria-label="Going?">
      <ButtonGroupText className={cn(cardLabelClassName, "text-muted-foreground")}>
        Going?
      </ButtonGroupText>
      {WRITABLE_ATTENDEE_RESPONSES.map((option) => {
        const { label, icon } = RESPONSES[option];
        return (
          <CardAction
            key={option}
            intent={response === option ? "primary" : "secondary"}
            icon={icon}
            loading={saving === option}
            aria-pressed={response === option}
            disabled={saving !== null}
            onClick={() => respond(option)}
          >
            {label}
          </CardAction>
        );
      })}
    </ButtonGroup>
  );
}

export function MeetingCard({ props }: { props: SummaryCardProps<"Meeting"> }) {
  const cancelled = props.status === "cancelled";
  const when = formatRange(props.start, props.end);
  const match = useCalendarMatch(props);
  const directions = directionsUrl(props.location);
  const conflicts = match?.conflicts ?? [];
  const onCalendar = match?.event ?? null;
  const extraGuests = props.attendees.length - MAX_GUESTS;
  const meetingHost = props.meetingUrl ? hostOf(props.meetingUrl) : null;

  return (
    <CardShell
      icon={Video}
      label="Meeting"
      aside={
        <>
          {props.status !== "scheduled" ? (
            <Badge variant={cancelled ? "destructive" : "outline"}>{humanize(props.status)}</Badge>
          ) : onCalendar ? (
            <Badge variant="outline">
              <CalendarCheck />
              On your calendar
            </Badge>
          ) : null}
          {!cancelled &&
            (onCalendar ? (
              <Rsvp event={onCalendar} />
            ) : (
              <AddToCalendar props={props} intent="primary" />
            ))}
        </>
      }
    >
      <Title>
        <span className={cn(cancelled && "line-through")}>{props.title}</span>
      </Title>
      <Details columns="two">
        {when && (
          <Detail icon={Clock} label="When">
            {when}
          </Detail>
        )}
        {props.timeZone && !props.allDay && (
          <Detail icon={Globe} label="Time zone">
            {props.timeZone.replace(/_/g, " ")}
          </Detail>
        )}
        {props.location && (
          <Detail
            icon={MapPin}
            label="Where"
            action={
              !cancelled &&
              directions && (
                <CardLink href={directions} icon={MapPin} iconOnly>
                  Directions
                </CardLink>
              )
            }
          >
            {props.location}
          </Detail>
        )}
        {meetingHost && (
          <Detail
            icon={Video}
            label="Online"
            action={
              !cancelled &&
              props.meetingUrl && (
                <CardLink href={props.meetingUrl} intent="primary" icon={Video}>
                  Join
                </CardLink>
              )
            }
          >
            {meetingHost}
          </Detail>
        )}
        {props.organizer && (
          <Detail icon={UserRound} label="Organizer">
            {props.organizer}
          </Detail>
        )}
        {onCalendar?.calendarName && (
          <Detail icon={CalendarDays} label="Calendar">
            {onCalendar.calendarName}
          </Detail>
        )}
        {props.attendees.length > 0 && (
          <Detail icon={Users} label="Guests" wide>
            {props.attendees.slice(0, MAX_GUESTS).join(", ")}
            {extraGuests > 0 && ` +${extraGuests}`}
          </Detail>
        )}
      </Details>
      {conflicts.length > 0 && (
        <p className="mt-2.5 flex items-center gap-1.5 text-[12px] text-destructive-text">
          <TriangleAlert className="size-3.5 shrink-0" />
          Conflicts with {conflicts.map((c) => c.title).join(", ")}
        </p>
      )}
    </CardShell>
  );
}

export function MeetingCompact({ props }: { props: SummaryCardProps<"Meeting"> }) {
  const cancelled = props.status === "cancelled";
  const when = formatRange(props.start, props.end);
  const onCalendar = useCalendarMatch(props)?.event ?? null;
  return (
    <CompactShell>
      <Video aria-hidden className="size-3.5 shrink-0 text-primary" />
      <span className={cn("min-w-0 truncate font-medium", cancelled && "line-through")}>
        {props.title}
      </span>
      {when && (
        <span className="flex shrink-0 items-center gap-1 text-[12px] text-faint">
          <Clock aria-hidden className="size-3" />
          {when}
        </span>
      )}
      {props.location && (
        <span className="flex min-w-0 items-center gap-1 text-[12px] text-faint">
          <MapPin aria-hidden className="size-3 shrink-0" />
          <span className="truncate">{props.location}</span>
        </span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {props.status !== "scheduled" ? (
          <Badge variant={cancelled ? "destructive" : "outline"}>{humanize(props.status)}</Badge>
        ) : onCalendar ? (
          <Badge variant="outline">
            <CalendarCheck />
            On your calendar
          </Badge>
        ) : null}
        {!cancelled && !onCalendar && <AddToCalendar props={props} />}
        {!cancelled && props.meetingUrl && (
          <CardLink href={props.meetingUrl} icon={Video}>
            Join
          </CardLink>
        )}
      </span>
    </CompactShell>
  );
}
