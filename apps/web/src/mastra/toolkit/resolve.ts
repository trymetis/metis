import "server-only";
import type { ResolvedCalendar } from "@/calendar/aggregate";
import type { ResolvedAddressBook } from "@/contacts/aggregate";
import { type DriveSurface, driveSurfaceFor } from "@/drive/aggregate";
import { sanitizeError } from "@/lib/errors/sanitize-error";
import type { Resolved } from "@/ops/scope";

import {
  type AgentMailbox,
  calendarById,
  driveById,
  mailboxById,
  type WorkspaceCtx,
  type WorkspaceMember,
} from "../runtime-context";

export class ToolRefusal extends Error {}

export async function withToolErrors<R>(fn: () => Promise<R>): Promise<R | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ToolRefusal) return { error: err.message };
    console.error("[agent-tool]", err);
    return { error: sanitizeError(err) };
  }
}

function referenceHint(ctx: WorkspaceCtx, type: string): string {
  return ctx.actor.kind === "session"
    ? ` If it came from an inline <@${type}:…> reference, tell the user that reference is no longer available.`
    : "";
}

export function requireMailbox(
  ctx: WorkspaceCtx,
  mailboxId: string,
): Resolved<{ mailbox: AgentMailbox }> {
  const mailbox = mailboxById(ctx, mailboxId);
  if (mailbox) return { mailbox };

  return {
    error: `Unknown mailboxId "${mailboxId}" — not a mailbox you can reach in this workspace.${referenceHint(
      ctx,
      "mailbox",
    )} Otherwise pick from these, which are all of them: ${ctx.mailboxes
      .map((m) => `${m.mailboxId} (${m.email})`)
      .join(", ")}`,
  };
}

export function requireDrive(
  ctx: WorkspaceCtx,
  driveId: string,
): Resolved<{ drive: DriveSurface }> {
  const drive = driveById(ctx, driveId);
  if (drive) return { drive: driveSurfaceFor(drive) };

  return {
    error: `Unknown driveId "${driveId}" — not a drive you can reach in this workspace.${referenceHint(
      ctx,
      "file",
    )} Otherwise pick from these, which are all of them: ${ctx.drives
      .map((d) => `${d.driveId} (${d.email})`)
      .join(", ")}`,
  };
}

export function requireCalendarAccount(
  accounts: ResolvedCalendar[],
  accountId?: string,
): Resolved<{ account: ResolvedCalendar }> {
  const choices = accounts.map((c) => `${c.accountId} (${c.accountEmail})`).join(", ");

  if (!accountId) {
    const only = accounts.length === 1 ? accounts[0] : null;
    if (only) return { account: only };
    return {
      error: `Pass calendarAccountId. These are all of them: ${choices}`,
    };
  }

  const account = accounts.find((c) => c.accountId === accountId);
  if (account) return { account };

  return {
    error: `Unknown calendarAccountId "${accountId}" — not an account you can reach here. These are all of them: ${choices}`,
  };
}

export function requireWorkspaceCalendar(
  ctx: WorkspaceCtx,
  accountId: string,
): Resolved<{ account: ResolvedCalendar }> {
  const account = calendarById(ctx, accountId);
  if (account) return { account };
  return requireCalendarAccount(ctx.calendars, accountId);
}

export async function requireMember(
  ctx: WorkspaceCtx,
  memberId: string,
): Promise<Resolved<{ member: WorkspaceMember }>> {
  const members = await ctx.members();
  const member = members.find((m) => m.userId === memberId);
  if (member) return { member };

  return {
    error: `Unknown memberId "${memberId}" — nobody with that id is in this workspace.${referenceHint(
      ctx,
      "member",
    )} Otherwise pick from these, which are all of them: ${members
      .map((m) => `${m.userId} (${m.email})`)
      .join(", ")}`,
  };
}

export type { Resolved };

export function requireAddressBook(
  accounts: ResolvedAddressBook[],
  accountId?: string,
): Resolved<{ account: ResolvedAddressBook }> {
  const choices = accounts.map((a) => `${a.accountId} (${a.accountEmail})`).join(", ");
  if (accounts.length === 0) {
    return { error: "No address book with AI turned on is reachable here." };
  }
  if (!accountId) {
    const only = accounts.length === 1 ? accounts[0] : null;
    if (only) return { account: only };
    return { error: `Pass addressBookId. These are all of them: ${choices}` };
  }
  const account = accounts.find((a) => a.accountId === accountId);
  if (account) return { account };
  return {
    error: `Unknown addressBookId "${accountId}" — not an address book you can reach here. These are all of them: ${choices}`,
  };
}
