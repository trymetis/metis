"use client";

import { Button } from "@metis/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@metis/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@metis/ui/components/field";
import { Input } from "@metis/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";
import { Switch } from "@metis/ui/components/switch";
import { Textarea } from "@metis/ui/components/textarea";
import { cn } from "@metis/ui/lib/utils";
import { format } from "date-fns";
import { CalendarDays, Clock, MapPin, Text, Users, Video } from "lucide-react";
import { useMemo, useState } from "react";

import { eventEnd, eventStart, viewerTimeZone } from "@/calendar/layout";
import { EmailRows, validateEmailRows } from "@/components/email-rows";
import { useWorkspacePath, useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc } from "@/lib/orpc";

import { useCalendar } from "./calendar-context";
import { DatePicker, TimePicker } from "./date-time-field";

const FIELD_CLASS =
  "rounded-none border-0 border-b border-border bg-transparent px-2.5 text-[13px] focus-visible:border-primary focus-visible:ring-0";

type GuestRow = { email: string };

const EMPTY_GUEST_ROW: GuestRow = { email: "" };

function guestRows(emails: string[]): GuestRow[] {
  return emails.length > 0 ? emails.map((email) => ({ email })) : [EMPTY_GUEST_ROW];
}

function toIso(date: Date, allDay: boolean): string {
  return allDay ? `${format(date, "yyyy-MM-dd")}T00:00:00.000Z` : date.toISOString();
}

export function EventDialog() {
  const scope = useWorkspaceScope();
  const calendarSlug = useWorkspacePath().calendarSlug ?? "all";
  const { draft, setDraft, editing, setEditing, calendars, accountName, refresh } = useCalendar();

  const open = draft !== null || editing !== null;
  const writable = useMemo(() => calendars.filter((c) => !c.readOnly), [calendars]);

  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState(() => new Date());
  const [end, setEnd] = useState(() => new Date());
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [guests, setGuests] = useState<GuestRow[]>([EMPTY_GUEST_ROW]);
  const [addMeeting, setAddMeeting] = useState(false);
  const [chosenTarget, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const primary = writable.find((c) => c.primary) ?? writable[0];
  const target = chosenTarget || (primary ? `${primary.accountId}::${primary.id}` : "");

  const seedDeps = [open, draft, editing] as const;
  const [seededDeps, setSeededDeps] = useState<typeof seedDeps | null>(null);
  if (seededDeps === null || seedDeps.some((dep, i) => dep !== seededDeps[i])) {
    setSeededDeps(seedDeps);
    if (open) setError(null);
    if (open && editing) {
      const from = eventStart(editing);
      const to = eventEnd(editing);
      setTitle(editing.title);
      setAllDay(editing.allDay);
      setStart(from);
      setEnd(to);
      setLocation(editing.location ?? "");
      setDescription(editing.description ?? "");
      setGuests(guestRows((editing.attendees ?? []).map((a) => a.email)));
      setAddMeeting(false);
      setTarget(`${editing.accountId}::${editing.calendarId}`);
    } else if (open && draft) {
      setTitle("");
      setAllDay(draft.allDay);
      setStart(draft.start);
      setEnd(draft.end);
      setLocation("");
      setDescription("");
      setGuests(guestRows(draft.attendees ?? []));
      setAddMeeting(false);
      setTarget("");
    }
  }

  const meetingProvider = useMemo(() => {
    const selected = writable.find((c) => `${c.accountId}::${c.id}` === target);
    if (selected?.provider === "google") return "Google Meet";
    if (selected?.provider === "microsoft") return "Teams meeting";
    return null;
  }, [writable, target]);

  function close() {
    setDraft(null);
    setEditing(null);
  }

  async function save() {
    const [accountId, calendarId] = target.split("::");
    if (!title.trim()) {
      setError("Give the event a title");
      return;
    }
    if (!accountId || !calendarId) {
      setError("Pick a calendar to save it to");
      return;
    }

    const { rows: guestRowsValid, error: guestError } = validateEmailRows(guests);
    if (guestError) {
      setError(guestError);
      return;
    }
    const attendees = guestRowsValid.map((r) => r.email);

    const startIso = toIso(start, allDay);
    const endIso = toIso(end, allDay);
    if (endIso <= startIso) {
      setError("The event has to end after it starts");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const base = {
        ...scope,
        calendarSlug,
        accountId,
        calendarId,
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        start: startIso,
        end: endIso,
        allDay,
        attendees: attendees.length > 0 ? attendees : undefined,
        timeZone: viewerTimeZone(),
      };

      if (editing) {
        await orpc.calendarEvents.update({ ...base, eventId: editing.id });
      } else {
        await orpc.calendarEvents.create({
          ...base,
          addMeeting: meetingProvider && addMeeting ? true : undefined,
        });
      }
      await refresh();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the event");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{editing ? "Edit event" : "New event"}</DialogTitle>
        </DialogHeader>

        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add title"
            aria-label="Event title"
            className={cn(FIELD_CLASS, "h-11 text-[18px]")}
          />

          <Row icon={Clock}>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <DatePicker
                  label="Starts on"
                  onChange={(next) => {
                    setStart(next);
                    if (end <= next) setEnd(new Date(next.getTime() + 60 * 60 * 1000));
                  }}
                  value={start}
                />
                {!allDay && (
                  <TimePicker
                    label="Starts at"
                    onChange={(next) => {
                      setStart(next);
                      if (end <= next) setEnd(new Date(next.getTime() + 60 * 60 * 1000));
                    }}
                    value={start}
                  />
                )}
                <span className="text-[13px] text-faint">–</span>
                {!allDay && (
                  <TimePicker after={start} label="Ends at" onChange={setEnd} value={end} />
                )}
                <DatePicker label="Ends on" onChange={setEnd} value={end} />
              </div>
              <label className="flex w-fit cursor-pointer items-center gap-2.5">
                <Switch
                  aria-label="All day"
                  checked={allDay}
                  onCheckedChange={(checked) => setAllDay(checked)}
                />
                <span className="text-[13px] text-muted-foreground">All day</span>
              </label>
              <span className="text-[11px] text-faint">Times are in {viewerTimeZone()}</span>
            </div>
          </Row>

          <Row icon={Users}>
            <EmailRows
              rows={guests}
              onChange={setGuests}
              emptyRow={EMPTY_GUEST_ROW}
              disabled={saving}
              placeholder="Add guest"
              label="Guest"
              addLabel="Add guest"
            />
          </Row>

          {!editing && meetingProvider && (
            <Row icon={Video}>
              <label className="flex h-9 w-fit cursor-pointer items-center gap-2.5">
                <Switch
                  aria-label={`Add ${meetingProvider}`}
                  checked={addMeeting}
                  onCheckedChange={(checked) => setAddMeeting(checked)}
                />
                <span className="text-[13px] text-muted-foreground">Add {meetingProvider}</span>
              </label>
            </Row>
          )}

          <Row icon={MapPin}>
            <Input
              className={FIELD_CLASS}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add location"
              aria-label="Location"
            />
          </Row>

          <Row icon={Text}>
            <Textarea
              className={cn(FIELD_CLASS, "min-h-0 resize-none py-1.5")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description"
              aria-label="Description"
              rows={3}
            />
          </Row>

          <Row icon={CalendarDays}>
            <Field>
              <FieldLabel className="sr-only">Calendar</FieldLabel>
              <Select
                value={target}
                onValueChange={(value) => setTarget(String(value))}
                items={writable.map((c) => ({
                  value: `${c.accountId}::${c.id}`,
                  label: `${c.name} · ${accountName(c.accountId, c.accountEmail)}`,
                }))}
              >
                <SelectTrigger aria-label="Calendar" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {writable.map((c) => (
                    <SelectItem key={`${c.accountId}::${c.id}`} value={`${c.accountId}::${c.id}`}>
                      {c.name} · {accountName(c.accountId, c.accountEmail)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {error && <FieldError>{error}</FieldError>}
            </Field>
          </Row>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Icon className="mt-2 h-4 w-4 shrink-0 text-faint" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
