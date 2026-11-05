"use client";

import { useQuery } from "@tanstack/react-query";

import { rpc } from "@/lib/orpc";

import { useMailboxScope } from "./use-workspace-path";

export interface ContactSuggestion {
  email: string;
  name?: string;
}

const KEEP_MS = 10 * 60 * 1000;
const NO_CONTACTS: ContactSuggestion[] = [];

export function useContactSuggestions(enabled: boolean): ContactSuggestion[] {
  const scope = useMailboxScope();
  const query = useQuery(
    rpc.mail.messages.contacts.queryOptions({
      input: scope,
      enabled: enabled && Boolean(scope.mailboxSlug),
      gcTime: KEEP_MS,
    }),
  );
  return query.data?.contacts ?? NO_CONTACTS;
}
