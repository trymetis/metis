import "server-only";
import { inArray } from "drizzle-orm";

import { getAuth } from "@/auth/server";
import { refreshHasAnyUser } from "@/auth/signup";
import { getDriver, listUserConnections } from "@/connections";
import { db } from "@/db";
import { workspace } from "@/db/schema";
import { deleteAssistantThreads } from "@/mastra/memory";
import { planAccountDelete } from "@/workspace";

export type AccountDeletePlan = Awaited<ReturnType<typeof planAccountDelete>>;

export function sharedWorkspacesBlockMessage(count: number, who: "you" | "they"): string {
  const owned = `${count} ${count === 1 ? "workspace" : "workspaces"}`;
  return who === "you"
    ? `You're the owner of ${owned}. Transfer ownership in Settings → Workspaces, then come back.`
    : `This person owns ${owned} with other members. They transfer ownership in Settings → Workspaces first.`;
}

export async function deleteAccount(
  userId: string,
  plan: AccountDeletePlan,
): Promise<{ workspacesDeleted: number; accountsRevoked: number }> {
  const connections = await listUserConnections(userId);
  await Promise.all(
    connections.map(async (account) => {
      try {
        await getDriver(account.provider).revoke?.({
          accessToken: account.accessToken,
          refreshToken: account.refreshToken,
        });
      } catch (err) {
        console.error("[account] token revoke failed on delete", err);
      }
    }),
  );

  if (plan.soleOwnedWorkspaceIds.length > 0) {
    await db.delete(workspace).where(inArray(workspace.id, plan.soleOwnedWorkspaceIds));
  }

  const ctx = await getAuth().$context;
  await ctx.internalAdapter.deleteUser(userId);
  await refreshHasAnyUser();

  await deleteAssistantThreads({ resourceId: userId });
  await Promise.all(
    plan.soleOwnedWorkspaceIds.map((workspaceId) =>
      deleteAssistantThreads({ metadata: { workspaceId } }),
    ),
  );

  return {
    workspacesDeleted: plan.soleOwnedWorkspaceIds.length,
    accountsRevoked: connections.length,
  };
}
