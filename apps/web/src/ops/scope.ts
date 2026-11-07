import "server-only";
import type { ResolvedCalendar } from "@/calendar/aggregate";
import type { MailProvider } from "@/connections/types";
import type { ResolvedAddressBook } from "@/contacts/aggregate";
import type { ResolvedDrive } from "@/drive/aggregate";
import type { MailAdapter } from "@/mail/adapter";
import type { ResolvedMailbox, ScopedMessage } from "@/mail/aggregate";
import type { MailScope } from "@/mail/session";
import type { WorkspaceRole } from "@/types/workspace";
import type { listWorkspaceMembers } from "@/workspace";

export type Resolved<T> = { error: string } | T;

export interface AgentMailbox {
  mailboxId: string;
  linkId: string;
  provider: MailProvider;
  email: string;
  adapter: MailAdapter;
  scope: (id: string) => ScopedMessage;
  mailboxes: ResolvedMailbox[];
  isAggregate: boolean;
}

export type WorkspaceMember = Awaited<ReturnType<typeof listWorkspaceMembers>>[number];

export type AgentActor =
  | { kind: "session"; headers: Headers }
  | { kind: "mcp"; clientId: string }
  | { kind: "workflow"; runId: string | null };

export interface WorkspaceCtx {
  userId: string;
  workspaceId: string;
  workspaceRole: WorkspaceRole;
  mailboxes: AgentMailbox[];
  calendars: ResolvedCalendar[];
  drives: ResolvedDrive[];
  addressBooks: ResolvedAddressBook[];
  members: () => Promise<WorkspaceMember[]>;
  actor: AgentActor;
}

export function mailScopeFor(ctx: WorkspaceCtx, mailbox: AgentMailbox): MailScope {
  return {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    workspaceRole: ctx.workspaceRole,
    adapter: mailbox.adapter,
    mailboxes: mailbox.mailboxes,
    isAggregate: mailbox.isAggregate,
  };
}

export function actorHeaders(ctx: WorkspaceCtx): Headers | undefined {
  return ctx.actor.kind === "session" ? ctx.actor.headers : undefined;
}
