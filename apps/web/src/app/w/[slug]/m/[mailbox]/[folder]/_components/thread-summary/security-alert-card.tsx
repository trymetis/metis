import { Clock, MapPin, MonitorSmartphone, Network, ShieldAlert } from "lucide-react";

import type { SummaryCardProps } from "@/mail/summary-catalog";

import { CardLink, CardShell, Detail, Details, Title, CompactShell } from "./card-parts";
import { formatWhen } from "./format";

export function SecurityAlertCard({ props }: { props: SummaryCardProps<"SecurityAlert"> }) {
  return (
    <CardShell
      icon={ShieldAlert}
      label={`${props.service} security`}
      aside={
        props.reviewUrl && (
          <CardLink href={props.reviewUrl} intent="primary" icon={ShieldAlert}>
            Wasn't you? Review activity
          </CardLink>
        )
      }
    >
      <Title>{props.event}</Title>
      <Details columns="two">
        {props.occurredAt && (
          <Detail icon={Clock} label="When">
            {formatWhen(props.occurredAt)}
          </Detail>
        )}
        {props.device && (
          <Detail icon={MonitorSmartphone} label="Device">
            {props.device}
          </Detail>
        )}
        {props.location && (
          <Detail icon={MapPin} label="Location">
            {props.location}
          </Detail>
        )}
        {props.ipAddress && (
          <Detail icon={Network} label="IP">
            <span className="font-mono">{props.ipAddress}</span>
          </Detail>
        )}
      </Details>
    </CardShell>
  );
}

export function SecurityAlertCompact({ props }: { props: SummaryCardProps<"SecurityAlert"> }) {
  return (
    <CompactShell>
      <ShieldAlert aria-hidden className="size-3.5 shrink-0 text-destructive-text" />
      <span className="min-w-0 truncate font-medium">
        {props.event}
        <span className="font-normal text-muted-foreground"> · {props.service}</span>
      </span>
      {props.device && (
        <span className="min-w-0 truncate text-[12px] text-faint">{props.device}</span>
      )}
      {props.location && (
        <span className="flex shrink-0 items-center gap-1 text-[12px] text-faint">
          <MapPin aria-hidden className="size-3" />
          {props.location}
        </span>
      )}
      {props.ipAddress && (
        <span className="shrink-0 font-mono text-[11px] text-faint">{props.ipAddress}</span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {props.occurredAt && (
          <span className="text-[12px] text-faint">{formatWhen(props.occurredAt)}</span>
        )}
        {props.reviewUrl && (
          <CardLink href={props.reviewUrl} icon={ShieldAlert}>
            Wasn't you? Review activity
          </CardLink>
        )}
      </span>
    </CompactShell>
  );
}
