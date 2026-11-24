import { Badge } from "@metis/ui/components/badge";
import { cn } from "@metis/ui/lib/utils";
import { Hash, Package, ShoppingBag, Store, Truck } from "lucide-react";

import type { SummaryCardProps } from "@/mail/summary-catalog";

import { CardLink, CardShell, CopyButton, Detail, Details, Title } from "./card-parts";
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
