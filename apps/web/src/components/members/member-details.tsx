"use client";

import { format } from "date-fns";
import type { ReactNode } from "react";

import { MemberActivity } from "./member-activity";

function stamp(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? format(date, "PP") : "";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  if (children === "" || children === null || children === undefined) return null;
  return (
    <div className="flex gap-3 text-[12px]">
      <dt className="w-24 shrink-0 text-faint">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-foreground">{children}</dd>
    </div>
  );
}

export interface MemberDetailsProps {
  workspaceSlug: string;
  email: string;
  role?: string;
  joinedAt?: Date | string | null;
  invited?: boolean;
  expiresAt?: Date | string | null;
  onNavigate?: () => void;
  children?: ReactNode;
}

export function MemberDetails({
  workspaceSlug,
  email,
  role,
  joinedAt,
  invited = false,
  expiresAt,
  onNavigate,
  children,
}: MemberDetailsProps) {
  return (
    <div className="flex flex-col gap-4">
      {children}
      <dl className="flex flex-col gap-1.5">
        <Field label="Email">{email}</Field>
        <Field label="Role">{role}</Field>
        <Field label={invited ? "Invited" : "Joined"}>{stamp(joinedAt)}</Field>
        {invited && <Field label="Expires">{stamp(expiresAt)}</Field>}
      </dl>
      {!invited && (
        <MemberActivity workspaceSlug={workspaceSlug} email={email} onNavigate={onNavigate} />
      )}
    </div>
  );
}
