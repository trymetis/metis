import {
  ArrowRight,
  BedDouble,
  Building2,
  Bus,
  Car,
  Clock,
  Info,
  type LucideIcon,
  MapPin,
  Plane,
  Route,
  Ticket,
  TrainFront,
  Utensils,
} from "lucide-react";

import type { SummaryCardProps } from "@/mail/summary-catalog";

import {
  CardLink,
  CardShell,
  CopyButton,
  Detail,
  Details,
  Title,
  CompactShell,
} from "./card-parts";
import { directionsUrl, formatRange, humanize } from "./format";
import { TicketBarcode } from "./ticket-barcode";

const RESERVATION_ICONS: Record<SummaryCardProps<"Reservation">["kind"], LucideIcon> = {
  flight: Plane,
  hotel: BedDouble,
  train: TrainFront,
  bus: Bus,
  car: Car,
  restaurant: Utensils,
  event: Ticket,
  other: Ticket,
};

export function ReservationCard({ props }: { props: SummaryCardProps<"Reservation"> }) {
  const when = formatRange(props.start, props.end);
  const directions = directionsUrl(props.kind === "flight" ? null : (props.location ?? props.to));
  return (
    <CardShell
      icon={RESERVATION_ICONS[props.kind]}
      label={humanize(props.kind)}
      aside={
        <>
          {props.confirmationCode && (
            <>
              <span className="font-mono text-[11px] text-muted-foreground">
                {props.confirmationCode}
              </span>
              <CopyButton text={props.confirmationCode} label="Copy confirmation" iconOnly />
            </>
          )}
          {props.manageUrl && (
            <CardLink href={props.manageUrl} intent="primary">
              Manage booking
            </CardLink>
          )}
        </>
      }
    >
      <Title>{props.title}</Title>
      <Details columns="two">
        {when && (
          <Detail icon={Clock} label="When">
            {when}
          </Detail>
        )}
        {(props.from || props.to) && (
          <Detail
            icon={Route}
            label="Route"
            action={
              !props.location &&
              directions && (
                <CardLink href={directions} icon={MapPin} iconOnly>
                  Directions
                </CardLink>
              )
            }
          >
            <span className="inline-flex flex-wrap items-center gap-x-1.5">
              {props.from && <span>{props.from}</span>}
              {props.from && props.to && (
                <ArrowRight aria-label="to" className="size-3 shrink-0 text-primary/80" />
              )}
              {props.to && <span>{props.to}</span>}
            </span>
          </Detail>
        )}
        {props.location && (
          <Detail
            icon={MapPin}
            label="Where"
            action={
              directions && (
                <CardLink href={directions} icon={MapPin} iconOnly>
                  Directions
                </CardLink>
              )
            }
          >
            {props.location}
          </Detail>
        )}
        {props.provider && (
          <Detail icon={Building2} label="With">
            {props.provider}
          </Detail>
        )}
        {props.details.length > 0 && (
          <Detail icon={Info} label="Details" wide>
            {props.details.map((detail) => (
              <div key={detail}>{detail}</div>
            ))}
          </Detail>
        )}
      </Details>
      {props.barcode && <TicketBarcode barcode={props.barcode} />}
    </CardShell>
  );
}

export function ReservationCompact({ props }: { props: SummaryCardProps<"Reservation"> }) {
  const Icon = RESERVATION_ICONS[props.kind];
  const when = formatRange(props.start, props.end);
  return (
    <CompactShell>
      <Icon aria-hidden className="size-3.5 shrink-0 text-primary" />
      <span className="min-w-0 truncate font-medium">{props.title}</span>
      {when && (
        <span className="flex shrink-0 items-center gap-1 text-[12px] text-faint">
          <Clock aria-hidden className="size-3" />
          {when}
        </span>
      )}
      {props.details[0] && (
        <span className="min-w-0 truncate text-[12px] text-faint">{props.details[0]}</span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {props.confirmationCode && (
          <>
            <span className="font-mono text-[12px] font-medium">{props.confirmationCode}</span>
            <CopyButton text={props.confirmationCode} label="Copy confirmation" iconOnly />
          </>
        )}
        {props.manageUrl && <CardLink href={props.manageUrl}>Manage booking</CardLink>}
      </span>
    </CompactShell>
  );
}
