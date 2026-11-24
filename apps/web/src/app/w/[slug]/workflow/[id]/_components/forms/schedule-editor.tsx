"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@metis/ui/components/combobox";
import { Field, FieldDescription, FieldLabel } from "@metis/ui/components/field";
import { Input } from "@metis/ui/components/input";
import { useMemo, useState } from "react";

import { useNow } from "@/hooks/use-now";
import {
  clockTime,
  nextCronRuns,
  parseSchedule,
  type Schedule,
  scheduleCron,
  type ScheduleMode,
  WEEKDAY_NAMES,
} from "@/workflow/cron";

import { FormSelect } from "./form-select";

const MODE_OPTIONS: { value: ScheduleMode; label: string }[] = [
  { value: "hourly", label: "Every hour" },
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Every weekday" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
  { value: "custom", label: "Custom (cron)" },
];

const DAY_OPTIONS = WEEKDAY_NAMES.map((name, index) => ({ value: String(index), label: name }));

export function zones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["Etc/UTC"];
  }
}

function switchMode(current: Schedule, mode: ScheduleMode, cron: string): Schedule {
  const hour = "hour" in current ? current.hour : 9;
  const minute = "minute" in current ? current.minute : 0;
  switch (mode) {
    case "hourly":
      return { mode, minute };
    case "daily":
    case "weekdays":
      return { mode, hour, minute };
    case "weekly":
      return { mode, day: "day" in current ? current.day : 1, hour, minute };
    case "monthly":
      return { mode, date: "date" in current ? current.date : 1, hour, minute };
    case "custom":
      return { mode, cron };
  }
}

function parseTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function TimezoneSelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (timezone: string) => void;
}) {
  const timeZones = useMemo(() => zones(), []);
  return (
    <Combobox
      items={timeZones}
      value={value || null}
      onValueChange={(timezone: string | null) => {
        if (timezone) onChange(timezone);
      }}
    >
      <ComboboxInput id={id} placeholder="Search time zones" className="w-full text-[13px]" />
      <ComboboxContent>
        <ComboboxEmpty>No time zone matches</ComboboxEmpty>
        <ComboboxList>
          {(zone: string) => (
            <ComboboxItem key={zone} value={zone}>
              {zone}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export function ScheduleEditor({
  cron,
  timezone,
  onChange,
}: {
  cron: string;
  timezone: string;
  onChange: (cron: string) => void;
}) {
  const parsed = parseSchedule(cron);
  const [custom, setCustom] = useState(parsed.mode === "custom");
  const schedule: Schedule = custom ? { mode: "custom", cron } : parsed;
  const now = useNow();
  const set = (next: Schedule) => onChange(scheduleCron(next));
  const zone = timezone || "Etc/UTC";
  const upcoming = useMemo(() => nextCronRuns(cron, zone, now, 3), [cron, zone, now]);
  const format = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: zone,
      });
    } catch {
      return null;
    }
  }, [zone]);

  return (
    <>
      <Field>
        <FieldLabel htmlFor="schedule-mode">Repeats</FieldLabel>
        <FormSelect
          id="schedule-mode"
          value={schedule.mode}
          onValueChange={(mode) => {
            setCustom(mode === "custom");
            if (mode !== "custom") set(switchMode(parsed, mode, cron));
          }}
          options={MODE_OPTIONS}
        />
      </Field>

      {schedule.mode === "hourly" && (
        <Field>
          <FieldLabel htmlFor="schedule-minute">Minutes past the hour</FieldLabel>
          <Input
            className="text-[13px]"
            id="schedule-minute"
            type="number"
            min={0}
            max={59}
            value={schedule.minute}
            onChange={(e) => {
              const minute = Math.min(59, Math.max(0, Number(e.target.value) || 0));
              set({ mode: "hourly", minute });
            }}
          />
        </Field>
      )}

      {schedule.mode === "weekly" && (
        <Field>
          <FieldLabel htmlFor="schedule-day">On</FieldLabel>
          <FormSelect
            id="schedule-day"
            value={String(schedule.day)}
            onValueChange={(day) => set({ ...schedule, day: Number(day) })}
            options={DAY_OPTIONS}
          />
        </Field>
      )}

      {schedule.mode === "monthly" && (
        <Field>
          <FieldLabel htmlFor="schedule-date">On day</FieldLabel>
          <Input
            className="text-[13px]"
            id="schedule-date"
            type="number"
            min={1}
            max={31}
            value={schedule.date}
            onChange={(e) => {
              const date = Math.min(31, Math.max(1, Number(e.target.value) || 1));
              set({ ...schedule, date });
            }}
          />
          {schedule.date > 28 && (
            <FieldDescription>Months without day {schedule.date} are skipped.</FieldDescription>
          )}
        </Field>
      )}

      {"hour" in schedule && (
        <Field>
          <FieldLabel htmlFor="schedule-time">At</FieldLabel>
          <Input
            className="text-[13px]"
            id="schedule-time"
            type="time"
            value={clockTime(schedule.hour, schedule.minute)}
            onChange={(e) => {
              const time = parseTime(e.target.value);
              if (time) set({ ...schedule, ...time });
            }}
          />
        </Field>
      )}

      {schedule.mode === "custom" && (
        <Field>
          <FieldLabel htmlFor="schedule-cron">Cron expression</FieldLabel>
          <Input
            id="schedule-cron"
            value={cron}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0 9 * * 1-5"
            className="font-mono text-[13px]"
          />
          <FieldDescription>
            Five fields: minute, hour, day of month, month, day of week.
          </FieldDescription>
        </Field>
      )}

      <div className="flex flex-col gap-1 rounded-lg border border-border-soft bg-panel px-3 py-2">
        <p className="text-[11px] text-faint uppercase tracking-wide">Next runs</p>
        {upcoming.length === 0 || !format ? (
          <p className="text-[12px] text-destructive-text">This schedule never fires as written.</p>
        ) : (
          <ul className="flex flex-col gap-0.5 text-[12px] text-foreground">
            {upcoming.map((at) => (
              <li key={at.toISOString()}>{format.format(at)}</li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
