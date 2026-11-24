"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@metis/ui/components/popover";
import { Info } from "lucide-react";
import type { ReactNode } from "react";

export function InfoHint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        render={
          <button
            type="button"
            aria-label={`About ${label}`}
            className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-faint outline-none transition-colors hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        }
      >
        <Info className="size-3.5" strokeWidth={1.75} />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 text-[12px] text-muted-foreground">
        {children}
      </PopoverContent>
    </Popover>
  );
}
