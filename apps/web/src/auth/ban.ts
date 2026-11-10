import "server-only";
import { and, eq, gt, isNull, or, type SQL } from "drizzle-orm";

import { db, type Executor } from "@/db";
import { user as userTable } from "@/db/schema";

export const BANNED_MESSAGE = "This account is banned. Ask the instance owner or an admin.";

export function isBanned(
  row: { banned: boolean; banExpires: Date | null },
  now: Date = new Date(),
): boolean {
  return row.banned && (row.banExpires === null || row.banExpires.getTime() > now.getTime());
}

export function activeBan(now: Date = new Date()): SQL {
  const condition = and(
    eq(userTable.banned, true),
    or(isNull(userTable.banExpires), gt(userTable.banExpires, now)),
  );
  if (!condition) throw new Error("[auth] the ban condition is empty");
  return condition;
}

export async function userBanned(userId: string, executor: Executor = db): Promise<boolean> {
  const [row] = await executor
    .select({ banned: userTable.banned, banExpires: userTable.banExpires })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  return row ? isBanned(row) : false;
}
