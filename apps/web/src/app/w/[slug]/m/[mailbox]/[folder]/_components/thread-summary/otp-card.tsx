"use client";

import { cn } from "@metis/ui/lib/utils";
import { KeyRound } from "lucide-react";

import type { SummaryCardProps } from "@/mail/summary-catalog";

import { CardShell, CopyButton, CompactShell } from "./card-parts";
import { ExpiryBadge, useExpiry } from "./expiry";

export function OtpCard({ props }: { props: SummaryCardProps<"Otp"> }) {
  const expiry = useExpiry(props.issuedAt, props.validForMinutes);
  return (
    <CardShell
      icon={KeyRound}
      label={props.service ? `${props.service} code` : "Verification code"}
      aside={<ExpiryBadge expiry={expiry} />}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "font-mono text-[22px] tracking-[4px] text-foreground",
            expiry.expired && "text-faint line-through",
          )}
        >
          {props.code}
        </span>
        <CopyButton
          text={props.code}
          label="Copy code"
          intent={expiry.expired ? "secondary" : "primary"}
        />
      </div>
    </CardShell>
  );
}

export function OtpCompact({ props }: { props: SummaryCardProps<"Otp"> }) {
  const expiry = useExpiry(props.issuedAt, props.validForMinutes);
  return (
    <CompactShell>
      <KeyRound aria-hidden className="size-3.5 shrink-0 text-primary" />
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-[1.5px] text-primary">
        {props.service ? `${props.service} code` : "Verification code"}
      </span>
      <span
        className={cn(
          "shrink-0 font-mono text-[15px] tracking-[3px]",
          expiry.expired && "text-faint line-through",
        )}
      >
        {props.code}
      </span>
      <CopyButton text={props.code} label="Copy code" iconOnly />
      <span className="ml-auto shrink-0">
        <ExpiryBadge expiry={expiry} />
      </span>
    </CompactShell>
  );
}
