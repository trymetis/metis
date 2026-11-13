import "server-only";
import { ORPCError } from "@orpc/server";

import { instanceRoleOf } from "@/auth/instance-role";
import { type DashboardRequirement, meetsRequirement } from "@/types/instance-role";

import { appSession } from "./app-session";

function dashboardGate(requirement: DashboardRequirement) {
  return appSession.use(async ({ context, next }) => {
    const instanceRole = await instanceRoleOf({
      id: context.appUser.userId,
      email: context.appUser.user.email,
    });
    if (!instanceRole) {
      throw new ORPCError("NOT_FOUND");
    }
    if (!meetsRequirement(instanceRole, requirement)) {
      throw new ORPCError("FORBIDDEN", { message: "Observers can only read the dashboard" });
    }
    return next({ context: { instanceRole } });
  });
}

export const dashboardSession = dashboardGate("read");

export const dashboardOperator = dashboardGate("operate");

export const dashboardOwner = dashboardSession.use(async ({ context, next }) => {
  if (context.instanceRole !== "owner") throw new ORPCError("NOT_FOUND");
  return next();
});
