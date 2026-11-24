import "server-only";
import { ORPCError, os } from "@orpc/server";
import type { ZodType } from "zod";

import type { WorkspaceUserSession } from "@/auth/session";
import { driveSessionFor } from "@/drive/session";
import { enforceRateLimit } from "@/services/rate-limit";
import { RATE_LIMITS } from "@/services/rate-limits";

import type { DriveScope } from "../schema";
import { workspaceSession } from "./workspace-session";

const resolveDrive = os
  .$context<{ appUser: WorkspaceUserSession }>()
  .middleware(async ({ context, next }, input: { driveSlug: string }) => {
    await enforceRateLimit(context.appUser.userId, RATE_LIMITS.driveSession);
    const drive = await driveSessionFor(context.appUser, input.driveSlug);
    if (!drive) {
      throw new ORPCError("NOT_FOUND", { message: "Unknown drive" });
    }
    return next({ context: { drive } });
  });

export function driveSession<T extends ZodType<DriveScope>>(schema: T) {
  return workspaceSession(schema).use(resolveDrive, (input: DriveScope) => ({
    driveSlug: input.driveSlug,
  }));
}
