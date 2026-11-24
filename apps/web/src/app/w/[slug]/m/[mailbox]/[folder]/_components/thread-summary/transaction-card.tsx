import { Badge } from "@metis/ui/components/badge";
import { cn } from "@metis/ui/lib/utils";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  Clock,
  CreditCard,
  HandCoins,
  Hash,
  type LucideIcon,
  Undo2,
  Wallet,
} from "lucide-react";

import type { SummaryCardProps } from "@/mail/summary-catalog";

import {
  CardLink,
  CardShell,
  Detail,
  Details,
  Title,
  CompactShell,
  CopyButton,
} from "./card-parts";
import { formatMoney, formatWhen } from "./format";

type TransactionProps = SummaryCardProps<"Transaction">;

const DIRECTIONS: Record<
  TransactionProps["direction"],
  { icon: LucideIcon; label: string; sign: string }
> = {
  debit: { icon: ArrowUpRight, label: "Paid", sign: "−" },
  credit: { icon: ArrowDownLeft, label: "Received", sign: "+" },
  refund: { icon: Undo2, label: "Refund", sign: "+" },
  request: { icon: HandCoins, label: "Payment request", sign: "" },
  failed: { icon: Ban, label: "Payment failed", sign: "" },
};

export function TransactionCard({ props }: { props: TransactionProps }) {
  const direction = DIRECTIONS[props.direction];
  const amount = formatMoney(props.amount);
  const balance = formatMoney(props.balance);
  const incoming = props.direction === "credit" || props.direction === "refund";
  return (
    <CardShell
      icon={direction.icon}
      label={props.institution ?? "Transaction"}
      aside={
        <>
          <Badge variant={props.direction === "failed" ? "destructive" : "outline"}>
            {direction.label}
          </Badge>
          {props.detailsUrl && (
            <CardLink href={props.detailsUrl} intent="primary">
              {props.direction === "request" ? "Review request" : "View details"}
            </CardLink>
          )}
        </>
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <Title>{props.counterparty ?? direction.label}</Title>
        {amount && (
          <span
            className={cn("text-[15px] font-medium", incoming ? "text-primary" : "text-foreground")}
          >
            {direction.sign}
            {amount}
          </span>
        )}
      </div>
      <Details columns="two">
        {props.occurredAt && (
          <Detail icon={Clock} label="When">
            {formatWhen(props.occurredAt)}
          </Detail>
        )}
        {(props.account || props.method) && (
          <Detail icon={CreditCard} label="Account">
            {[props.method, props.account].filter(Boolean).join(" · ")}
          </Detail>
        )}
        {balance && (
          <Detail icon={Wallet} label="Balance">
            {balance}
          </Detail>
        )}
        {props.reference && (
          <Detail icon={Hash} label="Reference">
            <span className="font-mono">{props.reference}</span>
          </Detail>
        )}
      </Details>
    </CardShell>
  );
}

export function TransactionCompact({ props }: { props: TransactionProps }) {
  const direction = DIRECTIONS[props.direction];
  const amount = formatMoney(props.amount);
  const balance = formatMoney(props.balance);
  const incoming = props.direction === "credit" || props.direction === "refund";
  const Icon = direction.icon;
  return (
    <CompactShell>
      <Icon aria-hidden className="size-3.5 shrink-0 text-primary" />
      <span className="min-w-0 truncate font-medium">{props.counterparty ?? direction.label}</span>
      {amount && (
        <span
          className={cn(
            "shrink-0 text-[14px] font-medium",
            incoming ? "text-primary" : "text-foreground",
          )}
        >
          {direction.sign}
          {amount}
        </span>
      )}
      {(props.account || props.institution) && (
        <span className="min-w-0 truncate text-[12px] text-faint">
          {[props.account, props.institution].filter(Boolean).join(" · ")}
        </span>
      )}
      {balance && <span className="shrink-0 text-[12px] text-faint">Balance {balance}</span>}
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {props.reference && (
          <>
            <span className="font-mono text-[11px] text-faint">{props.reference}</span>
            <CopyButton text={props.reference} label="Copy reference" iconOnly />
          </>
        )}
        <Badge variant={props.direction === "failed" ? "destructive" : "outline"}>
          {direction.label}
        </Badge>
        {props.detailsUrl && (
          <CardLink href={props.detailsUrl}>
            {props.direction === "request" ? "Review request" : "View details"}
          </CardLink>
        )}
      </span>
    </CompactShell>
  );
}
