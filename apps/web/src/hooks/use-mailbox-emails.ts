"use client";

import { skipToken, useQuery } from "@tanstack/react-query";

import { rpc } from "@/lib/orpc";
import type { WorkspaceMailbox } from "@/server/schema";

import { useWorkspaceScope } from "./use-workspace-path";

export type MailboxEmailMap = Record<string, string>;

export type MailboxOption = Pick<WorkspaceMailbox, "slug" | "email" | "provider" | "server"> & {
  ai: boolean;
};

const NO_MAILBOXES: MailboxOption[] = [];
const NO_EMAILS: MailboxEmailMap = {};

function toOptions(res: { mailboxes: WorkspaceMailbox[] }): MailboxOption[] {
  return res.mailboxes.map((m) => ({
    slug: m.slug,
    email: m.email,
    provider: m.provider,
    server: m.server,
    ai: m.policy.ai,
  }));
}

function toEmailMap(res: { mailboxes: WorkspaceMailbox[] }): MailboxEmailMap {
  return Object.fromEntries(res.mailboxes.map((m) => [m.mailboxId, m.email]));
}

export function useWorkspaceMailboxes(): MailboxOption[] {
  const { workspaceSlug } = useWorkspaceScope();
  const query = useQuery(
    rpc.workspaceMailboxes.list.queryOptions({
      input: workspaceSlug ? { workspaceSlug } : skipToken,
      select: toOptions,
    }),
  );
  return query.data ?? NO_MAILBOXES;
}

export function useMailboxEmails(): MailboxEmailMap {
  const { workspaceSlug } = useWorkspaceScope();
  const query = useQuery(
    rpc.workspaceMailboxes.list.queryOptions({
      input: workspaceSlug ? { workspaceSlug } : skipToken,
      select: toEmailMap,
      staleTime: Infinity,
    }),
  );
  return query.data ?? NO_EMAILS;
}
