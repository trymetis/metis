"use client";

import { MailX, Newspaper } from "lucide-react";

import type { SummaryCardProps } from "@/mail/summary-catalog";

import { CardAction, CardShell } from "./card-parts";
import { useSummaryActions } from "./summary-context";

const UNSUBSCRIBE_LABELS = {
  done: "Unsubscribed",
  manual: "Finish in the opened tab",
  failed: "Unsubscribe failed",
} as const;

export function DigestCard({ props }: { props: SummaryCardProps<"Digest"> }) {
  const unsubscribe = useSummaryActions()?.unsubscribe;
  return (
    <CardShell
      icon={Newspaper}
      label={props.publication}
      aside={
        unsubscribe?.available && (
          <CardAction
            icon={MailX}
            disabled={
              unsubscribe.busy || unsubscribe.status === "done" || unsubscribe.status === "manual"
            }
            onClick={unsubscribe.run}
          >
            {unsubscribe.status ? UNSUBSCRIBE_LABELS[unsubscribe.status] : "Unsubscribe"}
          </CardAction>
        )
      }
    >
      <ul className="space-y-2">
        {props.items.map((item) => (
          <li key={item.title} className="text-[12px]">
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                {item.title}
              </a>
            ) : (
              <span className="font-medium text-foreground">{item.title}</span>
            )}
            {item.summary && <p className="text-muted-foreground">{item.summary}</p>}
          </li>
        ))}
      </ul>
    </CardShell>
  );
}
