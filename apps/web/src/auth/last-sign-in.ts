import "server-only";
import { db } from "@/db";
import { lastSignIn } from "@/db/schema";

import type { CompletedSignIn } from "./sign-in-notifier";

export async function recordSignIn(signIn: CompletedSignIn): Promise<void> {
  try {
    await db
      .insert(lastSignIn)
      .values({ userId: signIn.userId, signedInAt: signIn.at })
      .onConflictDoUpdate({ target: lastSignIn.userId, set: { signedInAt: signIn.at } });
  } catch (err) {
    console.error("[auth] failed to record the sign-in time", err);
  }
}
