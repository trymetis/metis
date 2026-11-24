import { Badge } from "@metis/ui/components/badge";
import { CalendarClock, Repeat, Settings2 } from "lucide-react";

import type { SummaryCardProps } from "@/mail/summary-catalog";

import { CardLink, CardShell, Detail, Details, Title, CompactShell } from "./card-parts";
import { formatMoney, formatWhen } from "./format";
import { RemindButton } from "./remind-button";

type SubscriptionProps = SummaryCardProps<"Subscription">;

const EVENTS: Record<
  SubscriptionProps["event"],
  { label: string; dateLabel: string; alert: boolean }
> = {
  renewal_upcoming: { label: "Renews soon", dateLabel: "Renews", alert: false },
  renewed: { label: "Renewed", dateLabel: "Renewed", alert: false },
  trial_ending: { label: "Trial ending", dateLabel: "Trial ends", alert: true },
  price_change: { label: "Price change", dateLabel: "From", alert: true },
  payment_failed: { label: "Payment failed", dateLabel: "Due", alert: true },
  cancelled: { label: "Cancelled", dateLabel: "Ends", alert: false },
};

const REMINDABLE = new Set<SubscriptionProps["event"]>([
  "renewal_upcoming",
  "trial_ending",
  "price_change",
]);

export function SubscriptionCard({ props }: { props: SubscriptionProps }) {
  const event = EVENTS[props.event];
  const amount = formatMoney(props.amount);
  const previous = formatMoney(props.previousAmount);
  return (
    <CardShell
      icon={Repeat}
      label="Subscription"
      aside={
        <>
          <Badge variant={event.alert ? "destructive" : "outline"}>{event.label}</Badge>
          {REMINDABLE.has(props.event) && <RemindButton date={props.date} daysBefore={1} />}
          {props.manageUrl && (
            <CardLink href={props.manageUrl} intent="primary" icon={Settings2}>
              Manage
            </CardLink>
          )}
        </>
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <Title>
          {props.service}
          {props.plan && <span className="font-normal text-muted-foreground"> · {props.plan}</span>}
        </Title>
        {amount && (
          <span className="text-[14px] font-medium text-foreground">
            {previous && (
              <span className="mr-1.5 text-[12px] font-normal text-faint line-through">
                {previous}
              </span>
            )}
            {amount}
          </span>
        )}
      </div>
      {props.date && (
        <Details>
          <Detail icon={CalendarClock} label={event.dateLabel}>
            {formatWhen(props.date)}
          </Detail>
        </Details>
      )}
    </CardShell>
  );
}

export function SubscriptionCompact({ props }: { props: SubscriptionProps }) {
  const event = EVENTS[props.event];
  const amount = formatMoney(props.amount);
  const previous = formatMoney(props.previousAmount);
  return (
    <CompactShell>
      <Repeat aria-hidden className="size-3.5 shrink-0 text-primary" />
      <span className="min-w-0 truncate font-medium">
        {props.service}
        {props.plan && <span className="font-normal text-muted-foreground"> · {props.plan}</span>}
      </span>
      {amount && (
        <span className="shrink-0 font-medium">
          {previous && (
            <span className="mr-1.5 text-[12px] font-normal text-faint line-through">
              {previous}
            </span>
          )}
          {amount}
        </span>
      )}
      {props.date && (
        <span className="flex shrink-0 items-center gap-1 text-[12px] text-faint">
          <CalendarClock aria-hidden className="size-3" />
          {event.dateLabel} {formatWhen(props.date)}
        </span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        <Badge variant={event.alert ? "destructive" : "outline"}>{event.label}</Badge>
        {REMINDABLE.has(props.event) && <RemindButton date={props.date} daysBefore={1} />}
        {props.manageUrl && (
          <CardLink href={props.manageUrl} icon={Settings2}>
            Manage
          </CardLink>
        )}
      </span>
    </CompactShell>
  );
}
