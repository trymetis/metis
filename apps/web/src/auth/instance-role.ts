import "server-only";
import { eq } from "drizzle-orm";

import { db, type Executor } from "@/db";
import { user as userTable } from "@/db/schema";
import { GRANTED_INSTANCE_ROLES, type InstanceRole } from "@/types/instance-role";

import { isOwnerEmail, ownerEmail } from "./owner";

export function resolveInstanceRole(
  email: string | null | undefined,
  stored: string | null | undefined,
): InstanceRole | null {
  if (isOwnerEmail(email)) return "owner";
  return GRANTED_INSTANCE_ROLES.find((role) => role === stored) ?? null;
}

export async function instanceRoleOf(
  user: { id: string; email: string } | null | undefined,
  executor: Executor = db,
): Promise<InstanceRole | null> {
  if (!user) return null;
  if (isOwnerEmail(user.email)) return "owner";
  const [row] = await executor
    .select({ role: userTable.role })
    .from(userTable)
    .where(eq(userTable.id, user.id))
    .limit(1);
  return resolveInstanceRole(user.email, row?.role);
}

export async function syncOwnerRole(): Promise<{ owner: boolean; demoted: string[] }> {
  const email = ownerEmail();
  return db.transaction(async (tx) => {
    const demoted = await tx
      .update(userTable)
      .set({ role: "admin" })
      .where(eq(userTable.role, "owner"))
      .returning({ email: userTable.email });
    const [owner] = await tx
      .update(userTable)
      .set({ role: "owner", banned: false, banReason: null, banExpires: null })
      .where(eq(userTable.email, email))
      .returning({ id: userTable.id });
    return {
      owner: Boolean(owner),
      demoted: demoted.map((row) => row.email).filter((address) => address !== email),
    };
  });
}
