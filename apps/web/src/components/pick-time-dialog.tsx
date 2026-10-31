"use client";

import { Button } from "@metis/ui/components/button";
import { Calendar, Check, Clock, X } from "lucide-react";
import { useId, useState } from "react";

const pad = (n: number) => n.toString().padStart(2, "0");

function localValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nextHourValue(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return localValue(d);
}

export function PickTimeDialog({
  title,
  label,
  preview,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  title: string;
  label: string;
  preview: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (date: Date) => void;
}) {
  const inputId = useId();
  const [min] = useState(() => localValue(new Date()));
  const [value, setValue] = useState(nextHourValue);
  const [err, setErr] = useState<string | null>(null);

  function confirm() {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      setErr("Invalid date");
      return;
    }
    if (d.getTime() <= Date.now()) {
      setErr("Pick a time in the future");
      return;
    }
    onConfirm(d);
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-60 flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm">
      <div role="presentation" className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-sm overflow-hidden rounded-[10px] border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-soft bg-panel px-5 py-4">
          <span className="text-[18px] font-medium tracking-tight font-serif text-foreground">
            {title}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            aria-label="Close"
            className="text-faint"
          >
            <X />
          </Button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
        >
          <div className="px-5 py-5">
            <label
              htmlFor={inputId}
              className="mb-2 block text-[11px] uppercase tracking-[1.5px] text-faint"
            >
              {label}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  id={inputId}
                  type="datetime-local"
                  value={value}
                  min={min}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setErr(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      confirm();
                    }
                  }}
                  className="metis-datetime w-full rounded-md border border-border bg-panel px-3 py-2.5 pr-10 text-[14px] text-foreground outline-none transition-colors focus:border-primary/50 scheme-dark"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    const input = e.currentTarget.previousElementSibling;
                    if (!(input instanceof HTMLInputElement)) return;
                    if (typeof input.showPicker === "function") {
                      input.showPicker();
                    } else {
                      input.focus();
                    }
                  }}
                  className="-translate-y-1/2 absolute top-1/2 right-1 text-primary"
                  aria-label="Open calendar"
                >
                  <Calendar className="h-4 w-4" />
                </Button>
              </div>
              <Button type="submit" className="shrink-0 px-5 text-[13px]" aria-label={confirmLabel}>
                <Check className="h-4 w-4" strokeWidth={2.5} />
                OK
              </Button>
            </div>

            <div className="mt-3 text-[12px] text-faint">
              {value && !err && (
                <>
                  <Clock className="mr-1 inline h-3 w-3 text-primary" />
                  {preview}{" "}
                  <span className="font-medium text-primary">
                    {new Date(value).toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </>
              )}
              {err && <span className="text-destructive-text">{err}</span>}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border-soft px-4 py-3">
            <span className="text-[11px] text-faint">Press Enter to confirm</span>
            <Button variant="outline" size="sm" onClick={onClose} className="text-muted-foreground">
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
