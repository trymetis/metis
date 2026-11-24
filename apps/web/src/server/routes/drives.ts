import "server-only";
import { ORPCError } from "@orpc/server";
import { and, eq, isNull } from "drizzle-orm";

import { appActor, recordAuditEvent } from "@/audit";
import { deleteDrive, getDrive, listAccountDrives } from "@/connections";
import { db } from "@/db";
import { connection, drive, driveWorkspace } from "@/db/schema";
import { RATE_LIMITS } from "@/services/rate-limits";

import { appSession } from "../middlewares/app-session";
import { requireTotp } from "../require-totp";
import {
  deleteDriveInputSchema,
  detachDriveInputSchema,
  listUserDrivesOutputSchema,
  setAllDrivePolicyInputSchema,
  setDrivePolicyInputSchema,
  successSchema,
} from "../schema";

export const drivesRouter = {
  list: appSession.output(listUserDrivesOutputSchema).handler(async ({ context }) => ({
    drives: await listAccountDrives(context.appUser.userId),
  })),

  detach: appSession
    .input(detachDriveInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const { userId } = context.appUser;

      const [link] = await db
        .select({
          id: driveWorkspace.id,
          workspaceId: driveWorkspace.workspaceId,
          email: connection.email,
        })
        .from(driveWorkspace)
        .innerJoin(drive, eq(drive.id, driveWorkspace.driveId))
        .innerJoin(connection, eq(connection.id, drive.connectionId))
        .where(and(eq(driveWorkspace.id, input.linkId), eq(connection.userId, userId)))
        .limit(1);
      if (!link) {
        throw new ORPCError("NOT_FOUND", { message: "Drive not found" });
      }

      await db.delete(driveWorkspace).where(eq(driveWorkspace.id, link.id));
      await recordAuditEvent(appActor(context.appUser, context.headers), {
        action: "resource.detached",
        resourceKind: "drive",
        workspaceId: link.workspaceId,
        targetUserId: userId,
        targetLabel: link.email,
      });
      return { success: true as const };
    }),

  setPolicy: appSession
    .input(setDrivePolicyInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      if (input.aiEnabled) {
        await requireTotp({
          userId: context.appUser.userId,
          code: input.code,
          headers: context.headers,
          rule: RATE_LIMITS.driveAiOn,
          message: "Confirm it's you to turn AI on",
        });
      }

      const [link] = await db
        .select({ id: driveWorkspace.id })
        .from(driveWorkspace)
        .innerJoin(drive, eq(drive.id, driveWorkspace.driveId))
        .innerJoin(connection, eq(connection.id, drive.connectionId))
        .where(
          and(
            eq(driveWorkspace.id, input.linkId),
            eq(connection.userId, context.appUser.userId),
            isNull(connection.quarantinedAt),
          ),
        )
        .limit(1);
      if (!link) {
        throw new ORPCError("NOT_FOUND", { message: "Drive not found" });
      }

      await db
        .update(driveWorkspace)
        .set({ aiEnabled: input.aiEnabled })
        .where(eq(driveWorkspace.id, link.id));
      return { success: true as const };
    }),

  setPolicyEverywhere: appSession
    .input(setAllDrivePolicyInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      if (input.aiEnabled) {
        await requireTotp({
          userId: context.appUser.userId,
          code: input.code,
          headers: context.headers,
          rule: RATE_LIMITS.driveAiOn,
          message: "Confirm it's you to turn AI on everywhere",
        });
      }

      const target = await getDrive(input.driveId, context.appUser.userId);
      if (!target || target.quarantinedAt) {
        throw new ORPCError("NOT_FOUND", { message: "Drive not found" });
      }

      await db
        .update(driveWorkspace)
        .set({ aiEnabled: input.aiEnabled })
        .where(eq(driveWorkspace.driveId, target.id));
      return { success: true as const };
    }),

  delete: appSession
    .input(deleteDriveInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const { userId } = context.appUser;

      const target = await getDrive(input.driveId, userId);
      if (!target) {
        throw new ORPCError("NOT_FOUND", { message: "Drive not found" });
      }

      let grantRevoked = false;
      try {
        grantRevoked = await deleteDrive(target);
      } catch (err) {
        console.error("[drives] revoke failed on delete", err);
      }
      await recordAuditEvent(appActor(context.appUser, context.headers), {
        action: "resource.deleted",
        resourceKind: "drive",
        targetLabel: target.email,
        detail: { provider: target.provider, grantRevoked },
      });

      return { success: true as const };
    }),
};
