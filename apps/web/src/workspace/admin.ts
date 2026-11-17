import "server-only";
import { eq } from "drizzle-orm";

import { type AuditActor, recordAuditEvent } from "@/audit";
import { db } from "@/db";
import { workspace } from "@/db/schema";
import {
  deleteTheme,
  findVisibleTheme,
  listThemes,
  saveTheme,
  setWorkspaceThemeId,
  type StoredTheme,
} from "@/theme/store";
import { DEFAULT_THEME_ID } from "@/theme/system";
import type { ThemePalette } from "@/theme/tokens";
import type { WorkspaceRole } from "@/types/workspace";

import { isAdmin, removeMember } from "./index";

export type AdminRefusal = { error: string; forbidden?: true };

type AdminArgs = { workspaceId: string; actorRole: WorkspaceRole };

const ADMINS_ONLY: AdminRefusal = {
  error: "Only workspace owners and admins can do that",
  forbidden: true,
};

export async function removeWorkspaceMember(
  args: AdminArgs & { memberId: string; by: AuditActor },
): Promise<{ ok: true } | AdminRefusal> {
  if (!isAdmin(args.actorRole)) return ADMINS_ONLY;
  const result = await removeMember({
    workspaceId: args.workspaceId,
    memberId: args.memberId,
  });
  if ("error" in result) return result;
  await recordAuditEvent(args.by, {
    action: "member.removed",
    workspaceId: args.workspaceId,
    targetUserId: result.userId,
  });
  return { ok: true };
}

const THEME_ADMINS_ONLY: AdminRefusal = {
  error: "Only workspace owners and admins can change appearance",
  forbidden: true,
};

export async function setWorkspaceTheme(
  args: AdminArgs & { themeId: string },
): Promise<{ theme: StoredTheme } | AdminRefusal> {
  if (!isAdmin(args.actorRole)) return THEME_ADMINS_ONLY;
  const theme = await findVisibleTheme(args.workspaceId, args.themeId);
  if (!theme) return { error: "That theme is not available to this workspace" };
  await setWorkspaceThemeId(args.workspaceId, theme.id);
  return { theme };
}

export async function saveWorkspaceTheme(
  args: AdminArgs & { id?: string; name: string; palette: ThemePalette; select: boolean },
): Promise<{ theme: StoredTheme } | AdminRefusal> {
  if (!isAdmin(args.actorRole)) return THEME_ADMINS_ONLY;
  const result = await saveTheme(
    { kind: "workspace", workspaceId: args.workspaceId },
    { id: args.id, name: args.name, palette: args.palette },
  );
  if ("error" in result) return { error: result.error };
  if (args.select) await setWorkspaceThemeId(args.workspaceId, result.theme.id);
  return result;
}

export async function deleteWorkspaceTheme(
  args: AdminArgs & { themeId: string },
): Promise<{ ok: true } | AdminRefusal> {
  if (!isAdmin(args.actorRole)) return THEME_ADMINS_ONLY;
  const deleted = await deleteTheme(
    { kind: "workspace", workspaceId: args.workspaceId },
    args.themeId,
  );
  return deleted ? { ok: true } : { error: "That theme is gone" };
}

export async function workspaceThemes(
  workspaceId: string,
): Promise<{ themes: StoredTheme[]; selectedId: string }> {
  const [themes, [row]] = await Promise.all([
    listThemes(workspaceId),
    db
      .select({ themeId: workspace.themeId })
      .from(workspace)
      .where(eq(workspace.id, workspaceId))
      .limit(1),
  ]);
  return {
    themes,
    selectedId: row?.themeId ?? DEFAULT_THEME_ID,
  };
}
