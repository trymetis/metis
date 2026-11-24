import { Badge } from "@metis/ui/components/badge";
import {
  CalendarClock,
  FileCheck2,
  FilePen,
  FileText,
  MessageSquareText,
  StickyNote,
  UserRound,
} from "lucide-react";

import { useNow } from "@/hooks/use-now";
import type { SummaryCardProps } from "@/mail/summary-catalog";

import { CardLink, CardShell, Detail, Details, Title } from "./card-parts";
import { formatWhen, parseWhen } from "./format";

type SharedDocumentProps = SummaryCardProps<"SharedDocument">;

const KINDS = {
  share: { icon: FileText, label: "Shared with you", action: "Open" },
  signature_request: {
    icon: FilePen,
    label: "Signature requested",
    action: "Review and sign",
  },
  signed: { icon: FileCheck2, label: "Signed", action: "View document" },
  comment: { icon: MessageSquareText, label: "New comment", action: "Open" },
  other: { icon: FileText, label: "Document", action: "Open" },
} satisfies Record<SharedDocumentProps["kind"], unknown>;

export function SharedDocumentCard({ props }: { props: SharedDocumentProps }) {
  const kind = KINDS[props.kind];
  const due = parseWhen(props.dueDate);
  const now = useNow();
  const overdue = due !== null && due < now;
  return (
    <CardShell
      icon={kind.icon}
      label={props.provider ?? "Document"}
      aside={
        <>
          <Badge variant={overdue ? "destructive" : "outline"}>
            {overdue ? "Overdue" : kind.label}
          </Badge>
          {props.openUrl && (
            <CardLink href={props.openUrl} intent="primary" icon={kind.icon}>
              {kind.action}
            </CardLink>
          )}
        </>
      }
    >
      <Title>{props.title}</Title>
      <Details columns="two">
        {props.sharedBy && (
          <Detail icon={UserRound} label="From">
            {props.sharedBy}
          </Detail>
        )}
        {props.dueDate && (
          <Detail icon={CalendarClock} label="Due">
            {formatWhen(props.dueDate)}
          </Detail>
        )}
        {props.message && (
          <Detail icon={StickyNote} label="Note" wide>
            {props.message}
          </Detail>
        )}
      </Details>
    </CardShell>
  );
}
