import "server-only";
import { ORPCError } from "@orpc/server";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";

import { appActor, recordAuditEvent } from "@/audit";
import { verify2FA } from "@/auth/server";
import {
  listWorkspaceAddressBooks,
  listWorkspaceCalendars,
  listWorkspaceDrives,
  listWorkspaceMailboxes,
} from "@/connections";
import { db } from "@/db";
import { workspace } from "@/db/schema";
import {
  createInvite,
  type InviteRow,
  listWorkspaceInvites,
  revokeWorkspaceInvite,
} from "@/invites";
import { deleteAssistantThreads } from "@/mastra/memory";
import { rateLimit } from "@/services/rate-limit";
import type { WorkspaceAiPolicy, WorkspacePhishingDetectionPolicy } from "@/types/workspace";
import {
  changeMemberRole,
  createWorkspace,
  getWorkspaceMember,
  getWorkspacePolicy,
  isAdmin,
  isOwner,
  listMyWorkspaces,
  listWorkspaceMembers,
  resolveDefaultWorkspaceSlug,
  transferOwnership,
} from "@/workspace";
import { type AdminRefusal, removeWorkspaceMember, setWorkspaceTheme } from "@/workspace/admin";
import { platformPolicy } from "@/workspace/policy";

import { appSession } from "../middlewares/app-session";
import { workspaceSession } from "../middlewares/workspace-session";
import { requireTotp } from "../require-totp";
import {
  createInviteInputSchema,
  createInviteOutputSchema,
  createWorkspaceInputSchema,
  createWorkspaceOutputSchema,
  deleteWorkspaceInputSchema,
  deleteWorkspaceOutputSchema,
  getWorkspacePolicyOutputSchema,
  listInvitesOutputSchema,
  listMembersOutputSchema,
  listWorkspacesOutputSchema,
  okSchema,
  removeMemberInputSchema,
  revokeInviteInputSchema,
  setThemeBrandInputSchema,
  setWorkspaceLogoInputSchema,
  setWorkspaceLogoOutputSchema,
  setWorkspacePolicyInputSchema,
  transferOwnershipInputSchema,
  updateMemberRoleInputSchema,
  workspaceIdInputSchema,
  workspaceScopeSchema,
} from "../schema";

export const workspacesRouter = {
  list: appSession.output(listWorkspacesOutputSchema).handler(async ({ context }) => {
    const mine = await listMyWorkspaces(context.appUser.userId);
    const enriched = await Promise.all(
      mine.map(async (w) => {
        const [boxes, calendars, drives, addressBooks] = await Promise.all([
          listWorkspaceMailboxes(w.id),
          listWorkspaceCalendars(w.id),
          listWorkspaceDrives(w.id),
          listWorkspaceAddressBooks(w.id),
        ]);
        return {
          ...w,
          mailboxCount: boxes.length,
          inboxMailboxSlug: boxes[0]?.slug ?? null,
          calendarCount: calendars.length,
          firstCalendarSlug: calendars[0]?.slug ?? null,
          driveCount: drives.length,
          firstDriveSlug: drives[0]?.slug ?? null,
          addressBookCount: addressBooks.length,
          firstAddressBookSlug: addressBooks[0]?.slug ?? null,
        };
      }),
    );

    return { workspaces: enriched };
  }),

  create: appSession
    .input(createWorkspaceInputSchema)
    .output(createWorkspaceOutputSchema)
    .handler(async ({ input, context }) => {
      const { workspaceId, slug } = await createWorkspace({
        name: input.name,
        ownerUserId: context.appUser.userId,
      });

      return {
        workspaceId,
        slug,
        name: input.name,
        role: "owner" as const,
      };
    }),

  delete: workspaceSession(deleteWorkspaceInputSchema)
    .output(deleteWorkspaceOutputSchema)
    .handler(async ({ input, context }) => {
      await requireTotp({
        userId: context.appUser.userId,
        code: input.code,
        headers: context.headers,
        scope: "workspace-delete",
        message: "Enter your authenticator code to delete this workspace",
      });

      const member = await getWorkspaceMember(context.appUser.workspaceId, context.appUser.userId);
      if (!member || !isOwner(member.role)) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only the owner can delete a workspace",
        });
      }

      const mine = await listMyWorkspaces(context.appUser.userId);
      if (mine.length <= 1) {
        throw new ORPCError("BAD_REQUEST", {
          message: "You can't delete your only workspace",
        });
      }

      const deleted = mine.find((w) => w.id === context.appUser.workspaceId);
      await db.delete(workspace).where(eq(workspace.id, context.appUser.workspaceId));
      await recordAuditEvent(appActor(context.appUser, context.headers), {
        action: "workspace.deleted",
        workspaceName: deleted?.name,
        targetLabel: deleted?.slug ?? null,
      });
      await deleteAssistantThreads({
        metadata: { workspaceId: context.appUser.workspaceId },
      });
      await resolveDefaultWorkspaceSlug(context.appUser.userId);

      return { success: true as const };
    }),

  getPolicy: workspaceSession(workspaceScopeSchema)
    .output(getWorkspacePolicyOutputSchema)
    .handler(async ({ context }) => {
      const { appUser } = context;
      const workspaceId = appUser.workspaceId;
      if (!workspaceId || !appUser.workspaceRole) {
        throw new ORPCError("FORBIDDEN", { message: "No active workspace" });
      }

      const [policy, mailboxes] = await Promise.all([
        getWorkspacePolicy(workspaceId),
        listWorkspaceMailboxes(workspaceId),
      ]);

      if (!policy) {
        throw new ORPCError("NOT_FOUND", { message: "Workspace not found" });
      }

      return {
        ...policy,
        platform: platformPolicy(),
        mailboxes: mailboxes.map((m) => ({
          linkId: m.linkId,
          email: m.email,
          aiEnabled: m.aiEnabled,
          phishingDetectionEnabled: m.phishingDetectionEnabled,
        })),
      };
    }),

  setPolicy: workspaceSession(setWorkspacePolicyInputSchema)
    .output(okSchema)
    .handler(async ({ input, context }) => {
      const workspaceId = context.appUser.workspaceId;
      if (!workspaceId) {
        throw new ORPCError("FORBIDDEN", { message: "No active workspace" });
      }

      const member = await getWorkspaceMember(workspaceId, context.appUser.userId);
      if (!member || !isAdmin(member.role)) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only workspace owners and admins can change these settings",
        });
      }

      await requireTotp({
        userId: context.appUser.userId,
        code: input.code,
        headers: context.headers,
        scope: "workspace-policy",
        message: "Enter your authenticator code to change these settings",
      });

      const patch: Partial<{
        aiPolicy: WorkspaceAiPolicy;
        phishingDetectionPolicy: WorkspacePhishingDetectionPolicy;
      }> = {};
      if (input.aiPolicy) patch.aiPolicy = input.aiPolicy;
      if (input.phishingDetectionPolicy) {
        patch.phishingDetectionPolicy = input.phishingDetectionPolicy;
      }
      if (Object.keys(patch).length === 0) return { ok: true as const };

      await db.update(workspace).set(patch).where(eq(workspace.id, workspaceId));

      return { ok: true as const };
    }),

  setThemeBrand: workspaceSession(setThemeBrandInputSchema)
    .output(okSchema)
    .handler(async ({ input, context }) => {
      const result = await setWorkspaceTheme({
        workspaceId: context.appUser.workspaceId,
        actorRole: context.appUser.workspaceRole,
        themeBrand: input.themeBrand,
      });
      if ("error" in result) refused(result);
      return { ok: true as const };
    }),

  setLogo: workspaceSession(setWorkspaceLogoInputSchema)
    .output(setWorkspaceLogoOutputSchema)
    .handler(async ({ input, context }) => {
      const workspaceId = context.appUser.workspaceId;
      if (!workspaceId) {
        throw new ORPCError("FORBIDDEN", { message: "No active workspace" });
      }

      const member = await getWorkspaceMember(workspaceId, context.appUser.userId);
      if (!member || !isAdmin(member.role)) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only workspace owners and admins can change the logo",
        });
      }

      let logo: string | null = null;
      if (input.imageBase64) {
        let buffer: Buffer;
        try {
          buffer = Buffer.from(input.imageBase64, "base64");
        } catch {
          throw new ORPCError("BAD_REQUEST", { message: "Invalid image data" });
        }
        try {
          const webp = await sharp(buffer)
            .resize(72, 72, { fit: "cover" })
            .webp({ quality: 80 })
            .toBuffer();
          if (webp.byteLength > 16 * 1024) {
            throw new ORPCError("BAD_REQUEST", {
              message: "Processed logo is unexpectedly large",
            });
          }
          logo = `data:image/webp;base64,${webp.toString("base64")}`;
        } catch (err) {
          if (err instanceof ORPCError) throw err;
          throw new ORPCError("BAD_REQUEST", {
            message: "Could not process that image",
          });
        }
      }

      await db
        .update(workspace)
        .set({
          branding: logo
            ? sql`json_patch(coalesce(${workspace.branding}, '{}'), ${JSON.stringify({ logo })})`
            : sql`json_remove(coalesce(${workspace.branding}, '{}'), '$.logo')`,
        })
        .where(eq(workspace.id, workspaceId));

      return { logo };
    }),

  listMembers: workspaceSession(workspaceIdInputSchema)
    .output(listMembersOutputSchema)
    .handler(async ({ context }) => {
      const member = await getWorkspaceMember(context.appUser.workspaceId, context.appUser.userId);
      if (!member) {
        throw new ORPCError("FORBIDDEN");
      }

      const members = await listWorkspaceMembers(context.appUser.workspaceId);
      const invites = await listWorkspaceInvites({
        workspaceId: context.appUser.workspaceId,
        actorRole: member.role,
      });
      const pendingInvites = "error" in invites ? [] : invites.map(pendingInviteView);

      return { members, pendingInvites };
    }),

  updateMemberRole: workspaceSession(updateMemberRoleInputSchema)
    .output(okSchema)
    .handler(async ({ input, context }) => {
      const me = await getWorkspaceMember(context.appUser.workspaceId, context.appUser.userId);
      if (!me || !isOwner(me.role)) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only the owner can change roles",
        });
      }

      if (input.role === "admin") {
        await requireTotp({
          userId: context.appUser.userId,
          code: input.code,
          headers: context.headers,
          scope: "member-role",
          message: "Enter your authenticator code to make someone an admin",
        });
      }

      const result = await changeMemberRole({
        workspaceId: context.appUser.workspaceId,
        memberId: input.memberId,
        newRole: input.role,
      });
      if ("error" in result) {
        throw new ORPCError("BAD_REQUEST", { message: result.error });
      }
      if (result.previousRole !== input.role) {
        await recordAuditEvent(appActor(context.appUser, context.headers), {
          action: "member.role_changed",
          workspaceId: context.appUser.workspaceId,
          targetUserId: result.userId,
          detail: { from: result.previousRole, to: input.role },
        });
      }

      return { ok: true as const };
    }),

  transferOwnership: workspaceSession(transferOwnershipInputSchema)
    .output(okSchema)
    .handler(async ({ input, context }) => {
      const rl = await rateLimit(context.appUser.userId, {
        scope: "transfer-ownership",
        limit: 10,
        windowSec: 300,
      });
      if (!rl.ok) {
        throw new ORPCError("TOO_MANY_REQUESTS", {
          message: "Too many attempts. Please slow down.",
          data: { retryAfterSec: Math.ceil(rl.resetMs / 1000) },
        });
      }

      const verified = await verify2FA({
        code: input.code,
        headers: context.headers,
      });
      if (!verified) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Invalid authenticator or backup code",
        });
      }

      const result = await transferOwnership({
        workspaceId: context.appUser.workspaceId,
        fromUserId: context.appUser.userId,
        toMemberId: input.memberId,
      });
      if ("error" in result) {
        throw new ORPCError("BAD_REQUEST", { message: result.error });
      }
      await recordAuditEvent(appActor(context.appUser, context.headers), {
        action: "workspace.ownership_transferred",
        workspaceId: context.appUser.workspaceId,
        targetUserId: result.toUserId,
      });
      return { ok: true as const };
    }),

  removeMember: workspaceSession(removeMemberInputSchema)
    .output(okSchema)
    .handler(async ({ input, context }) => {
      const result = await removeWorkspaceMember({
        workspaceId: context.appUser.workspaceId,
        actorRole: context.appUser.workspaceRole,
        memberId: input.memberId,
        by: appActor(context.appUser, context.headers),
      });
      if ("error" in result) refused(result);

      return { ok: true as const };
    }),

  listInvites: workspaceSession(workspaceIdInputSchema)
    .output(listInvitesOutputSchema)
    .handler(async ({ context }) => {
      const invites = await listWorkspaceInvites({
        workspaceId: context.appUser.workspaceId,
        actorRole: context.appUser.workspaceRole,
      });
      if ("error" in invites) refused(invites);
      return { invites: invites.map(pendingInviteView) };
    }),

  createInvite: workspaceSession(createInviteInputSchema)
    .output(createInviteOutputSchema)
    .handler(async ({ input, context }) => {
      const result = await createInvite({
        email: input.email,
        workspace: { id: context.appUser.workspaceId, role: input.role },
        instanceRole: null,
        linkOnFailure: true,
        inviter: {
          userId: context.appUser.userId,
          name: context.appUser.user.name,
          email: context.appUser.user.email,
        },
        by: appActor(context.appUser, context.headers),
      });
      if ("error" in result) refused(result);

      return {
        id: result.invite.id,
        email: result.invite.email,
        role: result.invite.workspaceRole ?? input.role,
        expiresAt: result.invite.expiresAt.toISOString(),
        link: result.link,
      };
    }),

  revokeInvite: workspaceSession(revokeInviteInputSchema)
    .output(okSchema)
    .handler(async ({ input, context }) => {
      const result = await revokeWorkspaceInvite({
        workspaceId: context.appUser.workspaceId,
        actorRole: context.appUser.workspaceRole,
        inviteId: input.inviteId,
        by: appActor(context.appUser, context.headers),
      });
      if ("error" in result) refused(result);

      return { ok: true as const };
    }),
};

function refused(result: AdminRefusal | { error: string; forbidden?: true }): never {
  throw new ORPCError(result.forbidden ? "FORBIDDEN" : "BAD_REQUEST", {
    message: result.error,
  });
}

function pendingInviteView(row: InviteRow) {
  return {
    id: row.id,
    email: row.email,
    role: row.workspaceRole ?? ("member" as const),
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}
