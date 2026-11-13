import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { getAppUser } from "@/auth/session";
import { config } from "@/config";
import { db } from "@/db";
import { workspace } from "@/db/schema";
import { workspaceThemeBrand } from "@/workspace";

import { DEFAULT_THEME_BRAND, type ThemeBrandId } from "./brand";

export async function resolveThemeBrand(): Promise<ThemeBrandId> {
  if (config.maintenance.since instanceof Date) return DEFAULT_THEME_BRAND;
  const appUser = await getAppUser(await headers()).catch(() => null);
  if (!appUser?.workspaceId) return DEFAULT_THEME_BRAND;

  const [row] = await db
    .select({ branding: workspace.branding })
    .from(workspace)
    .where(eq(workspace.id, appUser.workspaceId))
    .limit(1);

  return workspaceThemeBrand(row?.branding ?? null);
}
