import "server-only";
import { ORPCError } from "@orpc/server";
import { and, eq, isNull } from "drizzle-orm";

import { appActor, recordAuditEvent } from "@/audit";
import { listProviderCalendars } from "@/calendar/available";
import { deleteCalendar, getCalendar, listAccountCalendars } from "@/connections";
import { db } from "@/db";
import { calendar, calendarWorkspace, connection } from "@/db/schema";

import { appSession } from "../middlewares/app-session";
import { requireTotp } from "../require-totp";
import {
  deleteCalendarInputSchema,
  detachCalendarInputSchema,
  listProviderCalendarsOutputSchema,
  listUserCalendarsOutputSchema,
  setAllCalendarPolicyInputSchema,
  setCalendarPolicyInputSchema,
  successSchema,
} from "../schema";

export const calendarsRouter = {
  list: appSession.output(listUserCalendarsOutputSchema).handler(async ({ context }) => ({
    calendars: await listAccountCalendars(context.appUser.userId),
  })),

  available: appSession
    .input(deleteCalendarInputSchema)
    .output(listProviderCalendarsOutputSchema)
    .handler(async ({ input, context }) => {
      const target = await getCalendar(input.calendarId, context.appUser.userId);
      if (!target) {
        throw new ORPCError("NOT_FOUND", { message: "Calendar not found" });
      }

      try {
        return { calendars: await listProviderCalendars(target) };
      } catch (err) {
        throw new ORPCError("BAD_GATEWAY", { cause: err });
      }
    }),

  detach: appSession
    .input(detachCalendarInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const { userId } = context.appUser;

      const [link] = await db
        .select({
          id: calendarWorkspace.id,
          workspaceId: calendarWorkspace.workspaceId,
          email: connection.email,
        })
        .from(calendarWorkspace)
        .innerJoin(calendar, eq(calendar.id, calendarWorkspace.calendarId))
        .innerJoin(connection, eq(connection.id, calendar.connectionId))
        .where(and(eq(calendarWorkspace.id, input.linkId), eq(connection.userId, userId)))
        .limit(1);
      if (!link) {
        throw new ORPCError("NOT_FOUND", { message: "Calendar not found" });
      }

      await db.delete(calendarWorkspace).where(eq(calendarWorkspace.id, link.id));
      await recordAuditEvent(appActor(context.appUser, context.headers), {
        action: "resource.detached",
        resourceKind: "calendar",
        workspaceId: link.workspaceId,
        targetUserId: userId,
        targetLabel: link.email,
      });
      return { success: true as const };
    }),

  setPolicy: appSession
    .input(setCalendarPolicyInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      if (input.aiEnabled) {
        await requireTotp({
          userId: context.appUser.userId,
          code: input.code,
          headers: context.headers,
          scope: "calendar-ai-on",
          message: "Confirm it's you to turn AI on",
        });
      }

      const [link] = await db
        .select({ id: calendarWorkspace.id })
        .from(calendarWorkspace)
        .innerJoin(calendar, eq(calendar.id, calendarWorkspace.calendarId))
        .innerJoin(connection, eq(connection.id, calendar.connectionId))
        .where(
          and(
            eq(calendarWorkspace.id, input.linkId),
            eq(connection.userId, context.appUser.userId),
            isNull(connection.quarantinedAt),
          ),
        )
        .limit(1);
      if (!link) {
        throw new ORPCError("NOT_FOUND", { message: "Calendar not found" });
      }

      await db
        .update(calendarWorkspace)
        .set({ aiEnabled: input.aiEnabled })
        .where(eq(calendarWorkspace.id, link.id));
      return { success: true as const };
    }),

  setPolicyEverywhere: appSession
    .input(setAllCalendarPolicyInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      if (input.aiEnabled) {
        await requireTotp({
          userId: context.appUser.userId,
          code: input.code,
          headers: context.headers,
          scope: "calendar-ai-on",
          message: "Confirm it's you to turn AI on everywhere",
        });
      }

      const target = await getCalendar(input.calendarId, context.appUser.userId);
      if (!target || target.quarantinedAt) {
        throw new ORPCError("NOT_FOUND", { message: "Calendar not found" });
      }

      await db
        .update(calendarWorkspace)
        .set({ aiEnabled: input.aiEnabled })
        .where(eq(calendarWorkspace.calendarId, target.id));
      return { success: true as const };
    }),

  delete: appSession
    .input(deleteCalendarInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const { userId } = context.appUser;

      const target = await getCalendar(input.calendarId, userId);
      if (!target) {
        throw new ORPCError("NOT_FOUND", { message: "Calendar not found" });
      }

      let grantRevoked = false;
      try {
        grantRevoked = await deleteCalendar(target);
      } catch (err) {
        console.error("[calendars] revoke failed on delete", err);
      }
      await recordAuditEvent(appActor(context.appUser, context.headers), {
        action: "resource.deleted",
        resourceKind: "calendar",
        targetLabel: target.email,
        detail: { provider: target.provider, grantRevoked },
      });

      return { success: true as const };
    }),
};
