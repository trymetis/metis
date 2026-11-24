import { Badge } from "@metis/ui/components/badge";
import {
  CircleDot,
  FolderGit2,
  GitMerge,
  GitPullRequest,
  type LucideIcon,
  MessageSquare,
  Rocket,
  SquareTerminal,
  UserCheck,
  UserRound,
} from "lucide-react";

import type { SummaryCardProps } from "@/mail/summary-catalog";

import { CardLink, CardShell, Detail, Details, Title, CompactShell } from "./card-parts";
import { humanize } from "./format";

type DevNotificationProps = SummaryCardProps<"DevNotification">;

const KIND_ICONS: Record<DevNotificationProps["kind"], LucideIcon> = {
  pull_request: GitPullRequest,
  issue: CircleDot,
  review_request: UserCheck,
  ci: SquareTerminal,
  release: Rocket,
  comment: MessageSquare,
  other: CircleDot,
};

const PLATFORM_LABELS: Record<DevNotificationProps["platform"], string> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  jira: "Jira",
  linear: "Linear",
  other: "Dev",
};

const BAD_STATES = /fail|error|broken|cancel|block/i;

export function DevNotificationCard({ props }: { props: DevNotificationProps }) {
  const merged = props.state ? /merged/i.test(props.state) : false;
  const Icon = merged ? GitMerge : KIND_ICONS[props.kind];
  const where = [props.repository, props.number && `#${props.number.replace(/^#/, "")}`]
    .filter(Boolean)
    .join(" ");
  return (
    <CardShell
      icon={Icon}
      label={`${PLATFORM_LABELS[props.platform]} · ${humanize(props.kind)}`}
      aside={
        <>
          {props.state && (
            <Badge variant={BAD_STATES.test(props.state) ? "destructive" : "outline"}>
              {props.state}
            </Badge>
          )}
          {props.url && (
            <CardLink href={props.url} intent="primary">
              Open on {PLATFORM_LABELS[props.platform]}
            </CardLink>
          )}
        </>
      }
    >
      <Title>{props.title}</Title>
      <Details columns="two">
        {where && (
          <Detail icon={FolderGit2} label="Where">
            <span className="font-mono">{where}</span>
          </Detail>
        )}
        {props.actor && (
          <Detail icon={UserRound} label="By">
            {props.actor}
          </Detail>
        )}
      </Details>
    </CardShell>
  );
}

export function DevNotificationCompact({ props }: { props: DevNotificationProps }) {
  const merged = props.state ? /merged/i.test(props.state) : false;
  const Icon = merged ? GitMerge : KIND_ICONS[props.kind];
  const where = [props.repository, props.number && `#${props.number.replace(/^#/, "")}`]
    .filter(Boolean)
    .join(" ");
  return (
    <CompactShell>
      <Icon aria-hidden className="size-3.5 shrink-0 text-primary" />
      {where && <span className="shrink-0 font-mono text-[12px] text-faint">{where}</span>}
      <span className="min-w-0 truncate font-medium">{props.title}</span>
      {props.actor && <span className="shrink-0 text-[12px] text-faint">by {props.actor}</span>}
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {props.state && (
          <Badge variant={BAD_STATES.test(props.state) ? "destructive" : "outline"}>
            {props.state}
          </Badge>
        )}
        {props.url && (
          <CardLink href={props.url}>Open on {PLATFORM_LABELS[props.platform]}</CardLink>
        )}
      </span>
    </CompactShell>
  );
}
