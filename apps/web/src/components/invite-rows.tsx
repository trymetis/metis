"use client";

import { Input } from "@metis/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";

import { CopyButton } from "@/components/copy-button";
import { orpc } from "@/lib/orpc";

import { EmailRows } from "./email-rows";

export type InviteRole = "member" | "admin";

export interface InviteRow {
  email: string;
  role: InviteRole;
}

export const EMPTY_INVITE_ROW: InviteRow = { email: "", role: "member" };

const ROLE_ITEMS: { value: InviteRole; label: string }[] = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
];

export interface InviteResults {
  failed: InviteRow[];
  errors: string[];
  links: { email: string; link: string }[];
}

export async function sendInvites(
  workspaceSlug: string,
  invites: InviteRow[],
): Promise<InviteResults> {
  const results = await Promise.allSettled(
    invites.map((invite) =>
      orpc.workspaces.createInvite({
        workspaceSlug,
        email: invite.email,
        role: invite.role,
      }),
    ),
  );
  const outcome: InviteResults = { failed: [], errors: [], links: [] };
  results.forEach((result, i) => {
    const invite = invites[i];
    if (!invite) return;
    if (result.status === "rejected") {
      outcome.failed.push(invite);
      const reason = result.reason instanceof Error ? result.reason.message : "Could not invite";
      outcome.errors.push(`${invite.email}: ${reason}`);
    } else if (result.value.link) {
      outcome.links.push({ email: invite.email, link: result.value.link });
    }
  });
  return outcome;
}

export function InviteLinks({ links }: { links: InviteResults["links"] }) {
  if (links.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">
        The invite email couldn&apos;t be sent. As the instance owner you can copy the link and send
        it yourself; it works only for the invited address.
      </p>
      {links.map(({ email, link }) => (
        <div key={email} className="flex flex-col gap-1">
          <span className="text-xs font-medium text-foreground">{email}</span>
          <div className="flex items-center gap-1">
            <Input
              readOnly
              value={link}
              className="font-mono text-xs"
              aria-label={`Invite link for ${email}`}
            />
            <CopyButton value={link} label={`Copy the invite link for ${email}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function InviteRows({
  rows,
  onChange,
  disabled,
}: {
  rows: InviteRow[];
  onChange: (rows: InviteRow[]) => void;
  disabled?: boolean;
}) {
  return (
    <EmailRows
      rows={rows}
      onChange={onChange}
      emptyRow={EMPTY_INVITE_ROW}
      disabled={disabled}
      placeholder="teammate@example.com"
      label="Invite email"
      renderSuffix={(row, index) => (
        <Select
          items={ROLE_ITEMS}
          value={row.role}
          disabled={disabled}
          onValueChange={(value) => {
            if (value === "member" || value === "admin") {
              onChange(rows.map((r, i) => (i === index ? { ...r, role: value } : r)));
            }
          }}
        >
          <SelectTrigger className="w-28 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {ROLE_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
    />
  );
}
