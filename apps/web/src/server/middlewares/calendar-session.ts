import "server-only";
import { ORPCError, os } from "@orpc/server";
import type { ZodType } from "zod";

import type { WorkspaceUserSession } from "@/auth/session";
import { calendarSessionFor } from "@/calendar/session";
import { enforceRateLimit } from "@/services/rate-limit";
import { RATE_LIMITS } from "@/services/rate-limits";

import type { CalendarScope } from "../schema";
import { workspaceSession } from "./workspace-session";

const resolveCalendar = os
  .$context<{ appUser: WorkspaceUserSession }>()
  .middleware(async ({ context, next }, input: { calendarSlug: string }) => {
    await enforceRateLimit(context.appUser.userId, RATE_LIMITS.calendarSession);
    const calendar = await calendarSessionFor(context.appUser, input.calendarSlug);
    if (!calendar) {
      throw new ORPCError("NOT_FOUND", { message: "Unknown calendar" });
    }
    return next({ context: { calendar } });
  });

export function calendarSession<T extends ZodType<CalendarScope>>(schema: T) {
  return workspaceSession(schema).use(resolveCalendar, (input: CalendarScope) => ({
    calendarSlug: input.calendarSlug,
  }));
}
