import "server-only";
import { ORPCError } from "@orpc/server";

import { themeJson } from "@/theme/store";
import { isAdmin } from "@/workspace";
import {
  deleteWorkspaceTheme,
  saveWorkspaceTheme,
  setWorkspaceTheme,
  workspaceThemes,
} from "@/workspace/admin";

import { workspaceSession } from "../middlewares/workspace-session";
import {
  deleteWorkspaceThemeInputSchema,
  listWorkspaceThemesOutputSchema,
  okSchema,
  saveThemeOutputSchema,
  saveWorkspaceThemeInputSchema,
  selectWorkspaceThemeInputSchema,
  workspaceScopeSchema,
} from "../schema";

function refused(result: { error: string; forbidden?: true }): never {
  throw new ORPCError(result.forbidden ? "FORBIDDEN" : "BAD_REQUEST", { message: result.error });
}

export const workspaceThemesRouter = {
  list: workspaceSession(workspaceScopeSchema)
    .output(listWorkspaceThemesOutputSchema)
    .handler(async ({ context }) => {
      const { themes, selectedId } = await workspaceThemes(context.appUser.workspaceId);
      return {
        themes: themes.map(themeJson),
        selectedId,
        canEdit: isAdmin(context.appUser.workspaceRole),
      };
    }),

  select: workspaceSession(selectWorkspaceThemeInputSchema)
    .output(okSchema)
    .handler(async ({ input, context }) => {
      const result = await setWorkspaceTheme({
        workspaceId: context.appUser.workspaceId,
        actorRole: context.appUser.workspaceRole,
        themeId: input.themeId,
      });
      if ("error" in result) refused(result);
      return { ok: true as const };
    }),

  save: workspaceSession(saveWorkspaceThemeInputSchema)
    .output(saveThemeOutputSchema)
    .handler(async ({ input, context }) => {
      const result = await saveWorkspaceTheme({
        workspaceId: context.appUser.workspaceId,
        actorRole: context.appUser.workspaceRole,
        id: input.id,
        name: input.name,
        palette: input.palette,
        select: input.select,
      });
      if ("error" in result) refused(result);
      return { theme: themeJson(result.theme) };
    }),

  delete: workspaceSession(deleteWorkspaceThemeInputSchema)
    .output(okSchema)
    .handler(async ({ input, context }) => {
      const result = await deleteWorkspaceTheme({
        workspaceId: context.appUser.workspaceId,
        actorRole: context.appUser.workspaceRole,
        themeId: input.themeId,
      });
      if ("error" in result) refused(result);
      return { ok: true as const };
    }),
};
