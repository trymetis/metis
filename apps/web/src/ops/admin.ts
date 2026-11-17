import "server-only";
import { z } from "zod";

import { listWorkspaceInvites, revokeWorkspaceInvite } from "@/invites";
import { themeSourceSchema, workspaceRoleSchema } from "@/server/schema";
import { generatePalette } from "@/theme/generate";
import type { ThemeTint } from "@/theme/tokens";
import {
  setWorkspaceTheme as changeTheme,
  removeWorkspaceMember,
  saveWorkspaceTheme,
  workspaceThemes,
} from "@/workspace/admin";

import { orFailure, type Output } from "./output";
import { auditedBy, type WorkspaceCtx, type WorkspaceMember } from "./scope";

export const listInvitesOutput = orFailure(
  z.object({
    count: z.number(),
    invites: z.array(
      z.object({
        inviteId: z.string(),
        email: z.string(),
        role: workspaceRoleSchema,
        expiresAt: z.string(),
        createdAt: z.string(),
      }),
    ),
  }),
);

export const removeMemberOutput = orFailure(
  z.object({
    removed: z.literal(true),
    memberId: z.string(),
    email: z.string(),
    note: z.string(),
  }),
);

export const revokeInviteOutput = orFailure(
  z.object({ revoked: z.literal(true), inviteId: z.string() }),
);

const themeSummary = z.object({ themeId: z.string(), name: z.string(), source: themeSourceSchema });

export const listThemesOutput = orFailure(
  z.object({ selectedThemeId: z.string(), themes: z.array(themeSummary) }),
);

export const setWorkspaceThemeOutput = orFailure(
  z.object({ updated: z.literal(true), themeId: z.string(), name: z.string() }),
);

export const createWorkspaceThemeOutput = orFailure(
  z.object({
    created: z.literal(true),
    themeId: z.string(),
    name: z.string(),
    selected: z.boolean(),
  }),
);

function actor(ctx: WorkspaceCtx) {
  return { workspaceId: ctx.workspaceId, actorRole: ctx.workspaceRole };
}

export async function listInvites(ctx: WorkspaceCtx): Promise<Output<typeof listInvitesOutput>> {
  const invites = await listWorkspaceInvites(actor(ctx));
  if ("error" in invites) return { error: invites.error };
  return {
    count: invites.length,
    invites: invites.map((i) => ({
      inviteId: i.id,
      email: i.email,
      role: i.workspaceRole ?? "member",
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
    })),
  };
}

export async function removeMember(
  ctx: WorkspaceCtx,
  member: WorkspaceMember,
): Promise<Output<typeof removeMemberOutput>> {
  const result = await removeWorkspaceMember({
    ...actor(ctx),
    memberId: member.memberId,
    by: auditedBy(ctx),
  });
  if ("error" in result) return { error: result.error };
  return {
    removed: true,
    memberId: member.userId,
    email: member.email,
    note: "Their mailboxes, calendars, drives and address books were detached from this workspace.",
  };
}

export async function revokeInvite(
  ctx: WorkspaceCtx,
  inviteId: string,
): Promise<Output<typeof revokeInviteOutput>> {
  const result = await revokeWorkspaceInvite({
    ...actor(ctx),
    inviteId,
    by: auditedBy(ctx),
  });
  if ("error" in result) return { error: result.error };
  return { revoked: true, inviteId };
}

export async function listThemes(ctx: WorkspaceCtx): Promise<Output<typeof listThemesOutput>> {
  const { themes, selectedId } = await workspaceThemes(ctx.workspaceId);
  return {
    selectedThemeId: selectedId,
    themes: themes.map((t) => ({ themeId: t.id, name: t.name, source: t.source })),
  };
}

export async function setWorkspaceTheme(
  ctx: WorkspaceCtx,
  themeId: string,
): Promise<Output<typeof setWorkspaceThemeOutput>> {
  const result = await changeTheme({ ...actor(ctx), themeId });
  if ("error" in result) return { error: result.error };
  return { updated: true, themeId: result.theme.id, name: result.theme.name };
}

export async function createWorkspaceTheme(
  ctx: WorkspaceCtx,
  args: { name: string; accent: string; tint: ThemeTint; select: boolean },
): Promise<Output<typeof createWorkspaceThemeOutput>> {
  const result = await saveWorkspaceTheme({
    ...actor(ctx),
    name: args.name,
    palette: generatePalette({ accent: args.accent, tint: args.tint }),
    select: args.select,
  });
  if ("error" in result) return { error: result.error };
  return {
    created: true,
    themeId: result.theme.id,
    name: result.theme.name,
    selected: args.select,
  };
}
