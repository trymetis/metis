import { Badge } from "@metis/ui/components/badge";
import { CalendarClock, CreditCard, Hash, Receipt } from "lucide-react";

import { useNow } from "@/hooks/use-now";
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
import { formatMoney, formatWhen, humanize, parseWhen } from "./format";
import { RemindButton } from "./remind-button";

export function BillCard({ props }: { props: SummaryCardProps<"Bill"> }) {
  const amount = formatMoney(props.amount);
  const due = parseWhen(props.dueDate);
  const now = useNow();
  const overdue =
    props.status === "overdue" || (props.status === "due" && due !== null && due < now);
  return (
    <CardShell
      icon={Receipt}
      label="Bill"
      aside={
        <>
          <Badge variant={overdue ? "destructive" : "outline"}>
            {overdue ? "Overdue" : humanize(props.status)}
          </Badge>
          {props.status !== "paid" && (
            <>
              <RemindButton date={props.dueDate} daysBefore={1} />
              {props.payUrl && (
                <CardLink href={props.payUrl} intent="primary" icon={CreditCard}>
                  Pay
                </CardLink>
              )}
            </>
          )}
        </>
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <Title>{props.payee}</Title>
        {amount && <span className="text-[14px] font-medium text-foreground">{amount}</span>}
      </div>
      <Details columns="two">
        {due && props.status !== "paid" && (
          <Detail icon={CalendarClock} label="Due">
            {formatWhen(props.dueDate)}
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

export function BillCompact({ props }: { props: SummaryCardProps<"Bill"> }) {
  const amount = formatMoney(props.amount);
  const due = parseWhen(props.dueDate);
  const now = useNow();
  const overdue =
    props.status === "overdue" || (props.status === "due" && due !== null && due < now);
  return (
    <CompactShell>
      <Receipt aria-hidden className="size-3.5 shrink-0 text-primary" />
      <span className="min-w-0 truncate font-medium">{props.payee}</span>
      {amount && <span className="shrink-0 text-[14px] font-medium">{amount}</span>}
      {due && props.status !== "paid" && (
        <span className="flex shrink-0 items-center gap-1 text-[12px] text-faint">
          <CalendarClock aria-hidden className="size-3" />
          due {formatWhen(props.dueDate)}
        </span>
      )}
      {props.reference && (
        <>
          <span className="shrink-0 font-mono text-[11px] text-faint">{props.reference}</span>
          <CopyButton text={props.reference} label="Copy reference" iconOnly />
        </>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        <Badge variant={overdue ? "destructive" : "outline"}>
          {overdue ? "Overdue" : humanize(props.status)}
        </Badge>
        {props.status !== "paid" && <RemindButton date={props.dueDate} daysBefore={1} />}
        {props.status !== "paid" && props.payUrl && (
          <CardLink href={props.payUrl} intent="primary" icon={CreditCard}>
            Pay
          </CardLink>
        )}
      </span>
    </CompactShell>
  );
}
