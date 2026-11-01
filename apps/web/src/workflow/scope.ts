import "server-only";
import { listWorkspaceCalendars, listWorkspaceDrives, listWorkspaceMailboxes } from "@/connections";
import { driveName } from "@/drive/name";
import type { WorkspaceRole } from "@/types/workspace";

import type { WorkspaceScope } from "./index";

export interface WorkflowScopeUser {
  userId: string;
  workspaceId: string;
  workspaceRole: WorkspaceRole;
  user?: { email: string; name: string };
}

export async function workflowScopeFor(appUser: WorkflowScopeUser): Promise<
  WorkspaceScope & {
    directory: { mailboxId: string; slug: string; email: string }[];
  }
> {
  const [boxes, calendars, drives] = await Promise.all([
    listWorkspaceMailboxes(appUser.workspaceId),
    listWorkspaceCalendars(appUser.workspaceId),
    listWorkspaceDrives(appUser.workspaceId),
  ]);
  return {
    workspaceId: appUser.workspaceId,
    userId: appUser.userId,
    role: appUser.workspaceRole,
    person: { email: appUser.user?.email ?? "", name: appUser.user?.name ?? "" },
    mailboxes: boxes.map((m) => ({
      mailboxId: m.id,
      linkId: m.linkId,
      email: m.email,
      aiEnabled: m.policy.ai,
    })),
    calendars: calendars.map((c) => ({
      accountId: c.id,
      linkId: c.linkId,
      email: c.email,
      slug: c.slug,
      aiEnabled: c.policy.ai,
    })),
    drives: drives.map((d) => ({
      driveId: d.id,
      linkId: d.linkId,
      email: d.email,
      name: driveName(d, drives),
      slug: d.slug,
      aiEnabled: d.policy.ai,
    })),
    directory: boxes.map((m) => ({ mailboxId: m.id, slug: m.slug, email: m.email })),
  };
}
