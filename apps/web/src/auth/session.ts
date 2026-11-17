import { cache } from "react";

import type { WorkspaceRole } from "@/types/workspace";
import { getWorkspaceBySlug } from "@/workspace";

import { type Auth, getAuth } from "./server";

export interface AppUserSession {
  userId: string;
  user: Auth["$Infer"]["Session"]["user"];
  twoFactorEnabled: boolean;
  emailVerified: boolean;
  workspaceId: string | null;
  workspaceSlug: string | null;
  workspaceRole: WorkspaceRole | null;
}

export interface WorkspaceUserSession extends AppUserSession {
  workspaceId: string;
  workspaceSlug: string;
  workspaceRole: WorkspaceRole;
}

const readSession = cache((headers: Headers) => getAuth().api.getSession({ headers }));

export const getWorkspaceMembership = cache((userId: string, workspaceSlug: string) =>
  getWorkspaceBySlug(userId, workspaceSlug),
);

export async function getAppUser(
  headers: Headers,
  workspaceSlug?: string | null,
): Promise<AppUserSession | null> {
  const session = await readSession(headers);
  if (!session?.user) return null;

  const membership = workspaceSlug
    ? await getWorkspaceMembership(session.user.id, workspaceSlug)
    : null;

  return {
    userId: session.user.id,
    user: session.user,
    twoFactorEnabled: session.user.twoFactorEnabled === true,
    emailVerified: session.user.emailVerified,
    workspaceId: membership?.id ?? null,
    workspaceSlug: membership?.slug ?? null,
    workspaceRole: membership?.role ?? null,
  };
}

export function isWorkspaceUser(appUser: AppUserSession | null): appUser is WorkspaceUserSession {
  return Boolean(appUser?.workspaceId && appUser.workspaceSlug && appUser.workspaceRole);
}
