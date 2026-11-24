"use client";

import { Button } from "@metis/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@metis/ui/components/popover";
import { cn } from "@metis/ui/lib/utils";
import { ShieldCheck } from "lucide-react";

import type { TrackerHit } from "@/mail/render/types";

const UNKNOWN = "Unknown tracker";

function summarize(hits: readonly TrackerHit[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const hit of hits) {
    const name = hit.vendor ?? UNKNOWN;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].toSorted(
    ([a, x], [b, y]) =>
      Number(a === UNKNOWN) - Number(b === UNKNOWN) || y - x || a.localeCompare(b),
  );
}

export function TrackerBadge({
  hits,
  className,
}: {
  hits: readonly TrackerHit[];
  className?: string;
}) {
  if (hits.length === 0) return null;
  const vendors = summarize(hits);
  const named = vendors.filter(([name]) => name !== UNKNOWN).map(([n]) => n);
  const label = `Blocked ${hits.length} ${hits.length === 1 ? "tracker" : "trackers"}${
    named.length > 0 ? `: ${named.join(", ")}` : ""
  }`;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="xs"
            aria-label={label}
            title={label}
            className={cn("rounded-full bg-surface text-[11px] text-status-success", className)}
          />
        }
      >
        <ShieldCheck className="size-3" />
        {hits.length}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <PopoverHeader>
          <PopoverTitle className="text-[13px]">{label}</PopoverTitle>
          <PopoverDescription className="text-[12px]">
            Removed before the message was shown, so the sender cannot tell through them that you
            opened it.
          </PopoverDescription>
        </PopoverHeader>
        <ul className="space-y-1">
          {vendors.map(([name, count]) => (
            <li key={name} className="flex items-center justify-between gap-3 text-[12px]">
              <span className="truncate text-muted-foreground">{name}</span>
              <span className="shrink-0 text-right tabular-nums text-faint">{count}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
