import "server-only";
import { ORPCError } from "@orpc/server";

import { appActor, recordAuditEvent } from "@/audit";
import {
  attachOwnedDrive,
  type ConnectionAuth,
  detachDrive,
  getWorkspaceDriveByLinkId,
  listUnattachedDrives,
  listWorkspaceDrives,
  resolveConnectionAuth,
  setDriveVisibility,
} from "@/connections";
import { getDriveAdapter } from "@/drive/adapter";

import { workspaceSession } from "../middlewares/workspace-session";
import {
  attachDriveInputSchema,
  attachDriveOutputSchema,
  detachWorkspaceDriveInputSchema,
  listAttachableDrivesOutputSchema,
  listDriveRootsOutputSchema,
  listWorkspaceDrivesOutputSchema,
  setDriveVisibilityInputSchema,
  setDriveVisibilityOutputSchema,
  successSchema,
  workspaceDriveLinkInputSchema,
  workspaceScopeSchema,
} from "../schema";

async function requireAuth(row: Parameters<typeof resolveConnectionAuth>[0]) {
  const auth: ConnectionAuth | null = await resolveConnectionAuth(row);
  if (!auth) throw new ORPCError("BAD_GATEWAY", { message: "Drive offline" });
  return auth;
}

export const workspaceDrivesRouter = {
  list: workspaceSession(workspaceScopeSchema)
    .output(listWorkspaceDrivesOutputSchema)
    .handler(async ({ context }) => {
      const { appUser } = context;
      const rows = await listWorkspaceDrives(appUser.workspaceId);

      return {
        drives: rows.map((d) => ({
          driveId: d.id,
          linkId: d.linkId,
          provider: d.provider,
          email: d.email,
          server: d.server,
          slug: d.slug,
          image: d.image,
          ownedByMe: d.userId === appUser.userId,
          visibleRootIds: d.visibleRootIds,
          aiEnabled: d.aiEnabled,
          policy: d.policy,
        })),
        viewerRole: appUser.workspaceRole,
      };
    }),

  attachable: workspaceSession(workspaceScopeSchema)
    .output(listAttachableDrivesOutputSchema)
    .handler(async ({ context }) => {
      const { appUser } = context;
      const rows = await listUnattachedDrives(appUser.userId, appUser.workspaceId);

      return {
        drives: rows.map((d) => ({
          driveId: d.id,
          provider: d.provider,
          email: d.email,
          server: d.server,
          image: d.image,
        })),
      };
    }),

  attach: workspaceSession(attachDriveInputSchema)
    .output(attachDriveOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;

      const linked = await attachOwnedDrive({
        userId: appUser.userId,
        workspaceId: appUser.workspaceId,
        driveId: input.driveId,
      });
      if ("error" in linked) {
        throw new ORPCError(linked.reason === "conflict" ? "CONFLICT" : "NOT_FOUND", {
          message: linked.error,
        });
      }
      return linked;
    }),

  detach: workspaceSession(detachWorkspaceDriveInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;

      const link = await getWorkspaceDriveByLinkId(input.linkId, appUser.workspaceId);
      if (!link) {
        throw new ORPCError("NOT_FOUND", { message: "Drive not found" });
      }

      const isAdmin = appUser.workspaceRole === "owner" || appUser.workspaceRole === "admin";
      if (!isAdmin && link.userId !== appUser.userId) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only an admin can remove someone else's drive",
        });
      }

      await detachDrive({
        linkId: link.linkId,
        workspaceId: appUser.workspaceId,
      });
      await recordAuditEvent(appActor(appUser, context.headers), {
        action: "resource.detached",
        resourceKind: "drive",
        workspaceId: appUser.workspaceId,
        targetUserId: link.userId,
        targetLabel: link.email,
      });
      return { success: true as const };
    }),

  roots: workspaceSession(workspaceDriveLinkInputSchema)
    .output(listDriveRootsOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;

      const link = await getWorkspaceDriveByLinkId(input.linkId, appUser.workspaceId);
      if (!link) {
        throw new ORPCError("NOT_FOUND", { message: "Drive not found" });
      }

      const isAdmin = appUser.workspaceRole === "owner" || appUser.workspaceRole === "admin";
      if (!isAdmin && link.userId !== appUser.userId) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only an admin can change what someone else's drive shows",
        });
      }

      try {
        const adapter = getDriveAdapter(link.provider, await requireAuth(link), link.email);
        const listing = await adapter.listFolder(null);
        return {
          roots: listing.entries
            .filter((entry) => entry.kind === "folder")
            .map((entry) => ({ id: entry.id, name: entry.name })),
        };
      } catch (err) {
        throw new ORPCError("BAD_GATEWAY", { cause: err });
      }
    }),

  setVisibility: workspaceSession(setDriveVisibilityInputSchema)
    .output(setDriveVisibilityOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;

      const link = await getWorkspaceDriveByLinkId(input.linkId, appUser.workspaceId);
      if (!link) {
        throw new ORPCError("NOT_FOUND", { message: "Drive not found" });
      }

      const isAdmin = appUser.workspaceRole === "owner" || appUser.workspaceRole === "admin";
      if (!isAdmin && link.userId !== appUser.userId) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only an admin can change what someone else's drive shows",
        });
      }

      await setDriveVisibility({
        linkId: link.linkId,
        workspaceId: appUser.workspaceId,
        visibleRootIds: input.visibleRootIds,
      });

      return { linkId: link.linkId, visibleRootIds: input.visibleRootIds };
    }),
};
