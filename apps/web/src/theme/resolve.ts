import { headers } from "next/headers";

import { getAppUser, getWorkspaceMembership } from "@/auth/session";
import { config } from "@/config";

import type { ActiveTheme } from "./active";
import { BRAND_WORKSPACE_HEADER } from "./brand";

export async function resolveActiveTheme(): Promise<ActiveTheme | null> {
  if (config.maintenance.since instanceof Date) return null;
  const requestHeaders = await headers();
  const workspaceSlug = requestHeaders.get(BRAND_WORKSPACE_HEADER);
  if (!workspaceSlug) return null;

  const appUser = await getAppUser(requestHeaders).catch(() => null);
  if (!appUser?.twoFactorEnabled) return null;

  const membership = await getWorkspaceMembership(appUser.userId, workspaceSlug);
  return membership?.theme ?? null;
}
