"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@metis/ui/components/collapsible";
import { ChevronRight } from "lucide-react";

export function ManualKey({ secret }: { secret: string }) {
  return (
    <Collapsible className="self-stretch text-xs">
      <CollapsibleTrigger className="group flex cursor-pointer items-center gap-1 text-faint hover:text-foreground">
        <ChevronRight className="size-3 transition-transform group-data-[panel-open]:rotate-90" />
        Can't scan? Show manual key
      </CollapsibleTrigger>
      <CollapsibleContent>
        <code className="mt-2 block break-all rounded bg-panel p-2 text-muted-foreground">
          {secret}
        </code>
      </CollapsibleContent>
    </Collapsible>
  );
}
