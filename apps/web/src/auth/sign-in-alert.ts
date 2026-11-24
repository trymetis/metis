import "server-only";
import { eq } from "drizzle-orm";

import { config } from "@/config";
import { db } from "@/db";
import { userPrefs } from "@/db/schema";
import { sendSignInAlertEmail } from "@/services/mailer";

import type { CompletedSignIn, SignInMethod } from "./sign-in-notifier";
import { describeUserAgent } from "./user-agent";

const METHOD_LABELS: Record<SignInMethod, string> = {
  password: "Password",
  "magic-link": "Email sign-in link",
  totp: "Authenticator code",
  "backup-code": "Backup code",
  passkey: "Passkey",
  "native-app": "Desktop or mobile app, from a signed-in browser",
};

const WHEN = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

async function alertsOn(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ on: userPrefs.signInAlerts })
    .from(userPrefs)
    .where(eq(userPrefs.userId, userId))
    .limit(1);
  return row?.on ?? true;
}

export async function sendSignInAlert(signIn: CompletedSignIn): Promise<void> {
  try {
    if (!(await alertsOn(signIn.userId))) return;
    await sendSignInAlertEmail({
      to: signIn.email,
      url: new URL("/settings/account", config.auth.url).toString(),
      when: `${WHEN.format(signIn.at)} UTC`,
      device: describeUserAgent(signIn.userAgent),
      ipAddress: signIn.ipAddress || "Unknown",
      method: METHOD_LABELS[signIn.method],
    });
  } catch (err) {
    console.error("[auth] failed to send sign-in alert", err);
  }
}
