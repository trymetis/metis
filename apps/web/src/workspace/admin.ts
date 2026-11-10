import "server-only";
import { eq, sql } from "drizzle-orm";

import { type AuditActor, recordAuditEvent } from "@/audit";
import { db } from "@/db";
import { workspace } from "@/db/schema";
import type { ThemeBrandId } from "@/theme/brand";
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

export async function setWorkspaceTheme(
  args: AdminArgs & { themeBrand: ThemeBrandId },
): Promise<{ ok: true } | AdminRefusal> {
  if (!isAdmin(args.actorRole)) {
    return {
      error: "Only workspace owners and admins can change appearance",
      forbidden: true,
    };
  }
  await db
    .update(workspace)
    .set({
      branding: sql`json_patch(coalesce(${workspace.branding}, '{}'), ${JSON.stringify({ themeBrand: args.themeBrand })})`,
    })
    .where(eq(workspace.id, args.workspaceId));
  return { ok: true };
}
