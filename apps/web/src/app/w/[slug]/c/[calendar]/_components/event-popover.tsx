"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@metis/ui/components/alert-dialog";
import { Avatar, AvatarFallback } from "@metis/ui/components/avatar";
import { Button } from "@metis/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@metis/ui/components/dialog";
import { cn } from "@metis/ui/lib/utils";
import { format, isValid } from "date-fns";
import {
  CalendarDays,
  Check,
  MapPin,
  Pencil,
  Phone,
  Trash2,
  UserRound,
  Users,
  Video,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { meetingAddress } from "@/calendar/conference";
import { eventEnd, eventStart, formatEventTime } from "@/calendar/layout";
import { CopyButton } from "@/components/copy-button";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc } from "@/lib/orpc";
import { getInitials } from "@/lib/utils";
import type { AttendeeResponse, ConferencePhone } from "@/types/calendar";

import { useCalendar } from "./calendar-context";
import { useEventColor } from "./event-colors";

const RESPONSES: { key: AttendeeResponse; label: string }[] = [
  { key: "accepted", label: "Yes" },
  { key: "declined", label: "No" },
  { key: "tentative", label: "Maybe" },
];

export function EventPopover() {
  const scope = useWorkspaceScope();
  const { selected, setSelected, setEditing, refresh, calendars, accountName } = useCalendar();
  const colorFor = useEventColor();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!selected) return null;

  const event = selected;
  const start = eventStart(event);
  const end = eventEnd(event);
  const conference = event.conference;
  const meetingId =
    conference?.meetingId && !event.meetingUrl?.includes(conference.meetingId)
      ? conference.meetingId
      : undefined;
  const source = calendars.find(
    (c) => c.id === event.calendarId && c.accountId === event.accountId,
  );
  const ownEmail = (event.accountEmail ?? source?.accountEmail)?.toLowerCase();
  const organizing = Boolean(ownEmail) && event.organizer?.email.toLowerCase() === ownEmail;
  const canRespond = !organizing && source?.provider !== "zoho";

  async function run(fn: () => Promise<unknown>, failure: string) {
    setBusy(true);
    try {
      await fn();
      await refresh();
      setSelected(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : failure);
    } finally {
      setBusy(false);
    }
  }

  const scopeArgs = {
    ...scope,
    calendarSlug: event.accountSlug ?? "all",
    accountId: event.accountId,
    calendarId: event.calendarId,
    eventId: event.id,
  };

  async function respond(response: AttendeeResponse) {
    setBusy(true);
    try {
      await orpc.calendarEvents.respond({ ...scopeArgs, response });
      setSelected({ ...event, myResponse: response });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send your response");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) setSelected(null);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <div className="flex shrink-0 items-center justify-end gap-0.5 px-3 pt-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Edit event"
            onClick={() => {
              setEditing(event);
              setSelected(null);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete event"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setSelected(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 gap-3 overflow-y-auto px-5 pb-5">
          <span
            className="mt-1.5 h-3 w-3 shrink-0 rounded-[3px]"
            style={{ backgroundColor: colorFor(event) }}
          />

          <div className="min-w-0 flex-1">
            <DialogTitle className="wrap-break-word font-serif text-[20px] leading-snug font-medium tracking-tight text-foreground">
              {event.title}
            </DialogTitle>
            {isValid(start) && (
              <p className="mt-1 text-[13px] text-muted-foreground">
                {format(start, "EEEE, d MMMM")}
                {!event.allDay && isValid(end) && ` · ${formatEventTime(event)}`}
              </p>
            )}
            {event.recurring && <p className="text-[12px] text-faint">Repeats</p>}

            <div className="mt-4 flex flex-col gap-3">
              {event.meetingUrl && (
                <Row icon={Video}>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex min-w-0 items-center gap-1">
                      <a
                        href={event.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-[13px] text-primary underline-offset-2 hover:underline"
                      >
                        {conference?.name ? `Join with ${conference.name}` : "Join the meeting"}
                      </a>
                      <CopyButton
                        value={event.meetingUrl}
                        label="Copy meeting link"
                        className="-my-1 size-6 shrink-0"
                      />
                    </div>
                    <span className="truncate text-[12px] text-muted-foreground">
                      {meetingAddress(event.meetingUrl)}
                    </span>
                    {meetingId && (
                      <span className="text-[12px] text-muted-foreground">
                        Meeting ID: {meetingId}
                      </span>
                    )}
                    {conference?.passcode && (
                      <span className="text-[12px] text-muted-foreground">
                        Passcode: {conference.passcode}
                      </span>
                    )}
                  </div>
                </Row>
              )}

              {conference?.phones && (
                <Row icon={Phone}>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    {conference.phones.slice(0, 4).map((phone) => (
                      <div
                        key={`${phone.number}${phone.pin ?? ""}`}
                        className="flex min-w-0 flex-col"
                      >
                        <a
                          href={telHref(phone)}
                          className="truncate text-[13px] text-primary underline-offset-2 hover:underline"
                        >
                          {phone.number}
                        </a>
                        {(phone.label || phone.pin) && (
                          <span className="truncate text-[12px] text-muted-foreground">
                            {[phone.label, phone.pin && `PIN: ${phone.pin}`]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </Row>
              )}

              {event.location && (
                <Row icon={MapPin}>
                  <span className="wrap-break-word text-[13px] text-muted-foreground">
                    {event.location}
                  </span>
                </Row>
              )}

              {event.organizer && (
                <Row icon={UserRound}>
                  <span className="truncate text-[13px] text-muted-foreground">
                    Organized by {event.organizer.name || event.organizer.email}
                  </span>
                </Row>
              )}

              {event.attendees && event.attendees.length > 0 && (
                <Row icon={Users}>
                  <div className="flex min-w-0 flex-col gap-2">
                    <span className="text-[13px] text-muted-foreground">
                      {event.attendees.length} guest
                      {event.attendees.length === 1 ? "" : "s"}
                    </span>
                    {event.attendees.slice(0, 8).map((attendee) => (
                      <div key={attendee.email} className="flex min-w-0 items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[10px]">
                            {getInitials(attendee.name || attendee.email)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate text-[12px] text-muted-foreground">
                          {attendee.name || attendee.email}
                        </span>
                        {attendee.response === "accepted" && (
                          <Check className="h-3 w-3 shrink-0 text-primary" />
                        )}
                      </div>
                    ))}
                  </div>
                </Row>
              )}

              {event.description && (
                <p className="min-w-0 wrap-break-word whitespace-pre-wrap text-[13px] text-muted-foreground">
                  {event.description.slice(0, 600)}
                </p>
              )}

              <Row icon={CalendarDays}>
                <span className="truncate text-[13px] text-muted-foreground">
                  {source?.name ??
                    event.calendarName ??
                    accountName(event.accountId, event.accountEmail)}
                </span>
              </Row>
            </div>
          </div>
        </div>

        {event.attendees && event.attendees.length > 0 && canRespond && (
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-border px-5 py-3">
            <span className="text-[13px] text-muted-foreground">Going?</span>
            {RESPONSES.map(({ key, label }) => {
              const mine = event.myResponse === key;
              return (
                <Button
                  aria-pressed={mine}
                  key={key}
                  variant={mine ? "default" : "outline"}
                  size="sm"
                  disabled={busy}
                  onClick={() => respond(key)}
                >
                  {mine && <Check className="size-3.5" />}
                  {label}
                </Button>
              );
            })}
          </div>
        )}
      </DialogContent>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {event.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              It is removed from {source?.name ?? "the calendar"}. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => {
                setConfirmDelete(false);
                void run(() => orpc.calendarEvents.delete(scopeArgs), "Could not delete the event");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function telHref(phone: ConferencePhone): string {
  const digits = phone.number.replace(/[^\d+]/g, "");
  return phone.pin ? `tel:${digits},,${phone.pin.replace(/\D/g, "")}#` : `tel:${digits}`;
}

function Row({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className={cn("flex min-w-0 items-start gap-3")}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-faint" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
