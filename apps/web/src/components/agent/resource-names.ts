"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { driveName } from "@/drive/name";
import { type MailboxEmailMap, useMailboxEmails } from "@/hooks/use-mailbox-emails";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";

export interface ResourceNames {
  mailboxes: MailboxEmailMap;
  drives: Record<string, string>;
}

const NO_NAMES: Record<string, string> = {};

export function useResourceNames(): ResourceNames {
  const mailboxes = useMailboxEmails();
  const { workspaceSlug } = useWorkspaceScope();
  const drives =
    useQuery(
      rpc.workspaceDrives.list.queryOptions({
        input: workspaceSlug ? { workspaceSlug } : skipToken,
        staleTime: 60_000,
        select: (res) =>
          Object.fromEntries(res.drives.map((d) => [d.driveId, driveName(d, res.drives)])),
      }),
    ).data ?? NO_NAMES;
  return useMemo(() => ({ mailboxes, drives }), [mailboxes, drives]);
}
