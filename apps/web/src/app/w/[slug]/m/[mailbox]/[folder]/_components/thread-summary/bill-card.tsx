import { Badge } from "@metis/ui/components/badge";
import { CalendarClock, CreditCard, Hash, Receipt } from "lucide-react";

import { useNow } from "@/hooks/use-now";
import type { SummaryCardProps } from "@/mail/summary-catalog";

import { CardLink, CardShell, Detail, Details, Title } from "./card-parts";
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
