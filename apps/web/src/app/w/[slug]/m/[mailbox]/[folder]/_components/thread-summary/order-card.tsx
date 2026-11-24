import { Badge } from "@metis/ui/components/badge";
import { ShoppingBag } from "lucide-react";

import type { SummaryCardProps } from "@/mail/summary-catalog";

import { CardLink, CardShell, Title, CompactActions, CompactShell, CopyButton } from "./card-parts";
import { formatMoney } from "./format";

export function OrderCard({ props }: { props: SummaryCardProps<"Order"> }) {
  const total = formatMoney(props.total);
  return (
    <CardShell
      icon={ShoppingBag}
      label="Order"
      aside={
        <>
          {props.status && <Badge variant="outline">{props.status}</Badge>}
          {props.orderUrl && !props.orderNumber && (
            <CardLink href={props.orderUrl} intent="primary">
              View order
            </CardLink>
          )}
        </>
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <Title>{props.merchant}</Title>
        {total && <span className="text-[14px] font-medium text-foreground">{total}</span>}
      </div>
      {props.orderNumber && (
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="font-mono text-[11px] text-faint">#{props.orderNumber}</p>
          {props.orderUrl && (
            <CompactActions>
              <CardLink href={props.orderUrl} intent="primary">
                View order
              </CardLink>
            </CompactActions>
          )}
        </div>
      )}
      {props.items.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {props.items.map((item) => {
            const price = formatMoney(item.price);
            return (
              <li
                key={`${item.name}-${item.quantity}`}
                className="flex justify-between gap-3 text-[12px] text-muted-foreground"
              >
                <span className="min-w-0 truncate">
                  {item.quantity && item.quantity > 1 ? `${item.quantity} × ` : ""}
                  {item.name}
                </span>
                {price && <span className="shrink-0">{price}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </CardShell>
  );
}

export function OrderCompact({ props }: { props: SummaryCardProps<"Order"> }) {
  const total = formatMoney(props.total);
  return (
    <CompactShell>
      <ShoppingBag aria-hidden className="size-3.5 shrink-0 text-primary" />
      <span className="min-w-0 truncate font-medium">{props.merchant}</span>
      {props.orderNumber && (
        <>
          <span className="shrink-0 font-mono text-[11px] text-faint">#{props.orderNumber}</span>
          <CopyButton text={props.orderNumber} label="Copy order number" iconOnly />
        </>
      )}
      {props.items.length > 0 && (
        <span className="shrink-0 text-[12px] text-faint">
          {props.items.length} {props.items.length === 1 ? "item" : "items"}
        </span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {total && <span className="font-medium">{total}</span>}
        {props.status && <Badge variant="outline">{props.status}</Badge>}
        {props.orderUrl && <CardLink href={props.orderUrl}>View order</CardLink>}
      </span>
    </CompactShell>
  );
}
