"use client";

import { format } from "date-fns";
import {
  Building2,
  CircleAlert,
  CircleCheck,
  Clock,
  Info,
  KeyRound,
  Link2,
  LogIn,
  type LucideIcon,
  MailCheck,
  MailOpen,
  Timer,
  TimerOff,
  UserPlus,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";

import type { SummaryCardProps } from "@/mail/summary-catalog";

import { CardAction, CardLink, CardShell, Detail, Details, Title } from "./card-parts";
import { ExpiryBadge, useExpiry } from "./expiry";
import { formatWhen, hostOf } from "./format";
import { useSummaryActions } from "./summary-context";

type ActionLinkProps = SummaryCardProps<"ActionLink">;

const PURPOSES: Record<ActionLinkProps["purpose"], { icon: LucideIcon; label: string }> = {
  password_reset: { icon: KeyRound, label: "Password reset" },
  sign_in: { icon: LogIn, label: "Sign-in link" },
  verify_email: { icon: MailCheck, label: "Verify email" },
  invitation: { icon: UserPlus, label: "Invitation" },
  confirm: { icon: Link2, label: "Confirmation" },
  other: { icon: Link2, label: "Link" },
};

function Hint({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <p className="mt-3 flex items-center gap-1.5 rounded-md border border-border/60 bg-background/50 px-2.5 py-1.5 text-[12px] text-muted-foreground dark:bg-background/30">
      <Icon aria-hidden className="size-3.5 shrink-0 text-faint" />
      {children}
    </p>
  );
}

export function ActionLinkCard({ props }: { props: ActionLinkProps }) {
  const expiry = useExpiry(props.issuedAt, props.validForMinutes);
  const purpose = PURPOSES[props.purpose];
  const showEmail = useSummaryActions()?.showEmail ?? null;
  const host = props.url ? hostOf(props.url) : null;
  const sent = formatWhen(props.issuedAt);

  return (
    <CardShell
      icon={purpose.icon}
      label={purpose.label}
      aside={
        <>
          <ExpiryBadge expiry={expiry} />
          {!expiry.expired &&
            (props.url ? (
              <CardLink href={props.url} intent="primary" icon={purpose.icon}>
                {props.label}
              </CardLink>
            ) : showEmail ? (
              <CardAction intent="primary" icon={MailOpen} onClick={showEmail}>
                Open email
              </CardAction>
            ) : null)}
        </>
      }
    >
      <Title>{props.label}</Title>
      <Details columns="two">
        {props.confirms && (
          <Detail icon={CircleCheck} label="Confirms" wide>
            {props.confirms}
          </Detail>
        )}
        {props.account && (
          <Detail icon={UserRound} label="Account">
            {props.account}
          </Detail>
        )}
        {props.service && (
          <Detail icon={Building2} label="Service">
            {props.service}
          </Detail>
        )}
        {host && (
          <Detail icon={Link2} label="Opens">
            {host}
          </Detail>
        )}
        {sent && (
          <Detail icon={Clock} label="Sent">
            {sent}
          </Detail>
        )}
        {expiry.expiresAt !== null && (
          <Detail
            icon={expiry.expired ? TimerOff : Timer}
            label={expiry.expired ? "Expired" : "Expires"}
          >
            {format(expiry.expiresAt, "EEE, MMM d · h:mm a")}
          </Detail>
        )}
        {props.ifIgnored && (
          <Detail icon={CircleAlert} label="If ignored" wide>
            {props.ifIgnored}
          </Detail>
        )}
      </Details>
      {expiry.expired ? (
        <Hint icon={TimerOff}>This link has expired.</Hint>
      ) : props.url ? null : showEmail ? (
        <Hint icon={Info}>The link is in the message.</Hint>
      ) : (
        <Hint icon={Info}>The link is in the email below.</Hint>
      )}
    </CardShell>
  );
}
