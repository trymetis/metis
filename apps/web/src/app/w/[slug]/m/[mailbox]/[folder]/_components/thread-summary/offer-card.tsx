import { Badge } from "@metis/ui/components/badge";
import { ShoppingCart, TicketPercent } from "lucide-react";

import { useNow } from "@/hooks/use-now";
import type { SummaryCardProps } from "@/mail/summary-catalog";

import { CardLink, CardShell, CopyButton, Title } from "./card-parts";
import { formatWhen, parseWhen } from "./format";

export function OfferCard({ props }: { props: SummaryCardProps<"Offer"> }) {
  const expires = parseWhen(props.expiresAt);
  const now = useNow();
  const expired = expires !== null && expires < now;
  return (
    <CardShell
      icon={TicketPercent}
      label={props.merchant}
      aside={
        <>
          {props.expiresAt && (
            <Badge variant={expired ? "destructive" : "outline"}>
              {expired ? "Expired" : `Until ${formatWhen(props.expiresAt)}`}
            </Badge>
          )}
          {props.shopUrl && !expired && (
            <CardLink href={props.shopUrl} intent="primary" icon={ShoppingCart}>
              Shop
            </CardLink>
          )}
        </>
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <Title>{props.headline}</Title>
        {props.discount && (
          <span className="shrink-0 text-[14px] font-medium text-primary">{props.discount}</span>
        )}
      </div>
      {props.terms && <p className="text-[12px] text-muted-foreground">{props.terms}</p>}
      {props.code && (
        <div className="mt-2 flex items-center gap-3">
          <span className="rounded border border-dashed border-primary/50 px-2 py-0.5 font-mono text-[14px] tracking-[2px] text-foreground">
            {props.code}
          </span>
          <CopyButton text={props.code} label="Copy code" />
        </div>
      )}
    </CardShell>
  );
}
