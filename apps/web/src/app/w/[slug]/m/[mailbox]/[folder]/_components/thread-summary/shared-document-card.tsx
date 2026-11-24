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

import { CardLink, CardShell, Detail, Details, Title, CompactShell } from "./card-parts";
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

export function SharedDocumentCompact({ props }: { props: SharedDocumentProps }) {
  const kind = KINDS[props.kind];
  const due = parseWhen(props.dueDate);
  const now = useNow();
  const overdue = due !== null && due < now;
  const Icon = kind.icon;
  return (
    <CompactShell>
      <Icon aria-hidden className="size-3.5 shrink-0 text-primary" />
      <span className="min-w-0 truncate font-medium">{props.title}</span>
      {(props.sharedBy || props.provider) && (
        <span className="min-w-0 truncate text-[12px] text-faint">
          {[props.sharedBy && `from ${props.sharedBy}`, props.provider].filter(Boolean).join(" · ")}
        </span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {props.dueDate && (
          <span className="flex items-center gap-1 text-[12px] text-faint">
            <CalendarClock aria-hidden className="size-3" />
            {formatWhen(props.dueDate)}
          </span>
        )}
        <Badge variant={overdue ? "destructive" : "outline"}>
          {overdue ? "Overdue" : kind.label}
        </Badge>
        {props.openUrl && (
          <CardLink href={props.openUrl} intent="primary" icon={Icon}>
            {kind.action}
          </CardLink>
        )}
      </span>
    </CompactShell>
  );
}
