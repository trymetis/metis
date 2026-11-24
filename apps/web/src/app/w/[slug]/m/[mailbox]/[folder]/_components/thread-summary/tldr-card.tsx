import { ArrowRight, Sparkles } from "lucide-react";

import type { SummaryCardProps } from "@/mail/summary-catalog";

import { CardShell, CompactShell } from "./card-parts";

export function TldrCard({ props }: { props: SummaryCardProps<"Tldr"> }) {
  return (
    <CardShell icon={Sparkles} label="TL;DR">
      <p className="text-[13px] leading-relaxed text-foreground">{props.text}</p>
      {props.keyPoints.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {props.keyPoints.map((point) => (
            <li key={point} className="flex gap-2 text-[12px] text-muted-foreground">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary/60" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      )}
      {props.actionItems.length > 0 && (
        <div className="mt-3 border-t border-border/60 pt-2.5">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
            Action items
          </div>
          <ul className="space-y-1">
            {props.actionItems.map((item) => (
              <li key={item} className="flex gap-2 text-[12px] text-muted-foreground">
                <ArrowRight aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </CardShell>
  );
}

export function TldrCompact({ props }: { props: SummaryCardProps<"Tldr"> }) {
  return (
    <CompactShell>
      <Sparkles aria-hidden className="size-3.5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate">{props.text}</span>
      {props.actionItems.length > 0 && (
        <span className="flex shrink-0 items-center gap-1 text-[12px] text-faint">
          <ArrowRight aria-hidden className="size-3 text-primary" />
          {props.actionItems.length} to do
        </span>
      )}
    </CompactShell>
  );
}
