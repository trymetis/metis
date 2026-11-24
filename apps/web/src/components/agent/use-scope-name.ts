"use client";

import { useQuery } from "@tanstack/react-query";

import { addressBookName } from "@/connections/address-book-name";
import { calendarName } from "@/connections/calendar-name";
import { driveName } from "@/drive/name";
import { useWorkspaceSlug } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";

export type AgentScopeKind = "mailbox" | "calendar" | "drive" | "addressbook";

const ALL_LABEL: Record<AgentScopeKind, string> = {
  mailbox: "All inboxes",
  calendar: "All calendars",
  drive: "All drives",
  addressbook: "All address books",
};

export function useAgentScopeName(kind: AgentScopeKind, slug: string): string {
  const workspaceSlug = useWorkspaceSlug();
  const input = { input: { workspaceSlug } };
  const all = slug === "all";
  const mailboxes = useQuery({
    ...rpc.workspaceMailboxes.list.queryOptions(input),
    enabled: kind === "mailbox" && !all,
  }).data?.mailboxes;
  const calendars = useQuery({
    ...rpc.workspaceCalendars.list.queryOptions(input),
    enabled: kind === "calendar" && !all,
  }).data?.calendars;
  const drives = useQuery({
    ...rpc.workspaceDrives.list.queryOptions(input),
    enabled: kind === "drive" && !all,
  }).data?.drives;
  const books = useQuery({
    ...rpc.workspaceAddressBooks.list.queryOptions(input),
    enabled: kind === "addressbook" && !all,
  }).data?.addressBooks;

  if (all) return ALL_LABEL[kind];
  switch (kind) {
    case "mailbox":
      return mailboxes?.find((m) => m.slug === slug)?.email ?? "";
    case "calendar": {
      const found = calendars?.find((c) => c.slug === slug);
      return found && calendars ? calendarName(found, calendars) : "";
    }
    case "drive": {
      const found = drives?.find((d) => d.slug === slug);
      return found && drives ? driveName(found, drives) : "";
    }
    case "addressbook": {
      const found = books?.find((b) => b.slug === slug);
      return found && books ? addressBookName(found, books) : "";
    }
  }
}
