"use client";

import type { Spec } from "@json-render/core";
import { format } from "date-fns";
import { ChevronDown, Sparkles } from "lucide-react";

import { isRecord } from "@/lib/guards";

import { humanize, parseWhen } from "./format";

const CHIP_LABELS: Record<string, string> = {
  Otp: "Code",
  Meeting: "Meeting",
  Order: "Order",
  Shipment: "Package",
  Bill: "Bill",
  Contact: "Contact",
  Transaction: "Transaction",
  Subscription: "Subscription",
  ActionLink: "Link",
  SecurityAlert: "Security",
  SharedDocument: "Document",
  Offer: "Offer",
  Digest: "Digest",
  DevNotification: "Update",
};

const DATE_PROPS = ["start", "expectedAt", "dueDate", "date"] as const;

function text(props: Record<string, unknown>, key: string): string | null {
  const value = props[key];
  return typeof value === "string" && value ? value : null;
}

function chipLabel(type: string, props: Record<string, unknown>): string {
  const base =
    type === "Reservation"
      ? humanize(text(props, "kind") ?? "booking")
      : (CHIP_LABELS[type] ?? type);
  if (type === "Otp") {
    const code = text(props, "code");
    return code ? `${base} ${code}` : base;
  }
  for (const key of DATE_PROPS) {
    const when = parseWhen(text(props, key));
    if (when) return `${base} · ${format(when, "EEE")}`;
  }
  return base;
}

export function SummaryPeek({ spec, onExpand }: { spec: Spec; onExpand: () => void }) {
  const root = spec.elements[spec.root];
  const cards = (root?.children ?? []).flatMap((id) => {
    const element = spec.elements[id];
    return element && isRecord(element.props)
      ? [{ id, type: element.type, props: element.props }]
      : [];
  });
  const tldr = cards.find((card) => card.type === "Summary");
  const others = cards.filter((card) => card.type !== "Summary");

  return (
    <button
      type="button"
      onClick={onExpand}
      aria-expanded={false}
      aria-label="Show summary cards"
      className="my-4 flex w-full items-center gap-2 rounded-lg border border-primary/22 bg-primary/8 px-3.5 py-2 text-left transition-colors hover:bg-primary/12"
    >
      <Sparkles aria-hidden className="size-3.5 shrink-0 text-primary" />
      {tldr && (
        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
          {text(tldr.props, "tldr")}
        </span>
      )}
      <span
        className={tldr ? "flex shrink-0 flex-wrap gap-1" : "flex min-w-0 flex-1 flex-wrap gap-1"}
      >
        {others.map((card) => (
          <span
            key={card.id}
            className="rounded-full border border-primary/30 bg-surface px-2 py-px text-[11px] text-primary"
          >
            {chipLabel(card.type, card.props)}
          </span>
        ))}
      </span>
      <ChevronDown aria-hidden className="size-3.5 shrink-0 text-primary" />
    </button>
  );
}
