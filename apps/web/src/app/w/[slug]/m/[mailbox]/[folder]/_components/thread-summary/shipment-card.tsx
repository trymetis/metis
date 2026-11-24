import { Badge } from "@metis/ui/components/badge";
import { cn } from "@metis/ui/lib/utils";
import {
  Hash,
  House,
  type LucideIcon,
  MapPin,
  Package,
  ShoppingBag,
  Store,
  Truck,
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
import { formatWhen, humanize } from "./format";
import { RemindButton } from "./remind-button";

const SHIPMENT_STEPS: SummaryCardProps<"Shipment">["status"][] = [
  "shipped",
  "in_transit",
  "out_for_delivery",
  "delivered",
];

const PROBLEM_STATUSES = new Set<SummaryCardProps<"Shipment">["status"]>([
  "delayed",
  "exception",
  "returned",
]);

export function ShipmentCard({ props }: { props: SummaryCardProps<"Shipment"> }) {
  const step = SHIPMENT_STEPS.indexOf(props.status);
  const problem = PROBLEM_STATUSES.has(props.status);
  const expected = formatWhen(props.expectedAt);
  const delivered = formatWhen(props.deliveredAt);
  return (
    <CardShell
      icon={Package}
      label="Package"
      aside={
        <>
          <Badge variant={problem ? "destructive" : "outline"}>{humanize(props.status)}</Badge>
          {props.status !== "delivered" && <RemindButton date={props.expectedAt} />}
          {props.trackingUrl && !props.trackingNumber && (
            <CardLink href={props.trackingUrl} intent="primary" icon={Truck}>
              Track package
            </CardLink>
          )}
        </>
      }
    >
      <Title>
        {props.status === "delivered"
          ? `Delivered${delivered ? ` ${delivered}` : ""}`
          : expected
            ? `Arriving ${expected}`
            : (props.merchant ?? "Shipment")}
      </Title>
      {step >= 0 && (
        <div className="mt-2 flex gap-1">
          {SHIPMENT_STEPS.map((s, i) => (
            <div
              key={s}
              className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-border")}
            />
          ))}
        </div>
      )}
      <Details columns="two">
        {props.merchant && (
          <Detail icon={Store} label="From">
            {props.merchant}
          </Detail>
        )}
        {props.carrier && (
          <Detail icon={Truck} label="Carrier">
            {props.carrier}
          </Detail>
        )}
        {props.trackingNumber && (
          <Detail
            icon={Hash}
            label="Tracking"
            action={
              <>
                <CopyButton text={props.trackingNumber} label="Copy tracking" iconOnly />
                {props.trackingUrl && (
                  <CardLink href={props.trackingUrl} intent="primary" icon={Truck}>
                    Track package
                  </CardLink>
                )}
              </>
            }
          >
            <span className="font-mono">{props.trackingNumber}</span>
          </Detail>
        )}
        {props.items.length > 0 && (
          <Detail icon={ShoppingBag} label="Items" wide>
            {props.items.join(", ")}
          </Detail>
        )}
      </Details>
    </CardShell>
  );
}

const STEP_ICONS: LucideIcon[] = [Package, Truck, MapPin, House];

export function ShipmentCompact({ props }: { props: SummaryCardProps<"Shipment"> }) {
  const step = SHIPMENT_STEPS.indexOf(props.status);
  const problem = PROBLEM_STATUSES.has(props.status);
  const expected = formatWhen(props.expectedAt);
  const delivered = formatWhen(props.deliveredAt);
  return (
    <CompactShell>
      <Package aria-hidden className="size-3.5 shrink-0 text-primary" />
      <span className="shrink-0 font-medium">
        {props.status === "delivered"
          ? `Delivered${delivered ? ` ${delivered}` : ""}`
          : expected
            ? `Arriving ${expected}`
            : (props.merchant ?? "Package")}
      </span>
      {step >= 0 && (
        <span className="flex min-w-32 flex-1 items-center">
          {SHIPMENT_STEPS.map((s, i) => {
            const Icon = STEP_ICONS[i] ?? Package;
            const done = i < step || props.status === "delivered";
            return (
              <span key={s} className="contents">
                {i > 0 && (
                  <span
                    aria-hidden
                    className={cn("h-0.5 flex-1", i <= step ? "bg-primary" : "bg-border")}
                  />
                )}
                <span
                  title={humanize(s)}
                  className={cn(
                    "grid size-5.5 shrink-0 place-items-center rounded-full border",
                    done
                      ? "border-primary bg-primary text-primary-foreground"
                      : i === step
                        ? "border-primary bg-surface text-primary ring-3 ring-primary/15"
                        : "border-border bg-surface text-faint",
                  )}
                >
                  <Icon aria-hidden className="size-3" />
                </span>
              </span>
            );
          })}
        </span>
      )}
      {props.carrier && <span className="shrink-0 text-[12px] text-faint">{props.carrier}</span>}
      {props.trackingNumber && (
        <>
          <span className="shrink-0 font-mono text-[11px] text-faint">{props.trackingNumber}</span>
          <CopyButton text={props.trackingNumber} label="Copy tracking" iconOnly />
        </>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        <Badge variant={problem ? "destructive" : "outline"}>{humanize(props.status)}</Badge>
        {props.trackingUrl && (
          <CardLink href={props.trackingUrl} icon={Truck}>
            Track
          </CardLink>
        )}
      </span>
    </CompactShell>
  );
}
