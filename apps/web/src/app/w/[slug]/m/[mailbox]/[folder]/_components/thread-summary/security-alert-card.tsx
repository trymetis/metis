import { Clock, MapPin, MonitorSmartphone, Network, ShieldAlert } from "lucide-react";

import type { SummaryCardProps } from "@/mail/summary-catalog";

import { CardLink, CardShell, Detail, Details, Title } from "./card-parts";
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
