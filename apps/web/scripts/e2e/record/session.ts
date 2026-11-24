import { readFile } from "node:fs/promises";

import { type Enrollment, enrollmentSchema } from "@metis/e2e/lib/enrollment";
import * as OTPAuth from "otpauth";

import { getAuth } from "../../../src/auth/server";
import { getAppUser, type WorkspaceUserSession } from "../../../src/auth/session";
import { getMailSession, type MailSession } from "../../../src/mail/session";
import { ENROLLMENT } from "../harness-files";

export interface RecordSession {
  enrollment: Enrollment;
  headers: Headers;
  appUser: WorkspaceUserSession;
  mail: MailSession;
}

export async function signIn(): Promise<RecordSession> {
  const enrollment = enrollmentSchema.parse(JSON.parse(await readFile(ENROLLMENT, "utf8")));

  const cookies = new Map<string, string>();
  function keepCookies(headers: Headers) {
    for (const line of headers.getSetCookie()) {
      const pair = line.split(";")[0] ?? "";
      const eqAt = pair.indexOf("=");
      if (eqAt > 0) cookies.set(pair.slice(0, eqAt), pair.slice(eqAt + 1));
    }
  }
  function cookieHeader(): Headers {
    return new Headers({
      cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    });
  }

  const signedIn = await getAuth().api.signInEmail({
    body: { email: enrollment.email, password: enrollment.password },
    returnHeaders: true,
  });
  keepCookies(signedIn.headers);
  const totp = OTPAuth.URI.parse(enrollment.totpURI);
  if (!(totp instanceof OTPAuth.TOTP)) throw new Error("not a TOTP URI");
  const verified = await getAuth().api.verifyTwoFactor({
    body: { method: "totp", code: totp.generate() },
    headers: cookieHeader(),
    returnHeaders: true,
  });
  keepCookies(verified.headers);
  const headers = cookieHeader();

  const appUser = await getAppUser(headers, enrollment.workspaceSlug);
  if (!appUser?.workspaceId || !appUser.workspaceSlug || !appUser.workspaceRole) {
    throw new Error("sign-in did not yield a workspace session");
  }
  const mail = await getMailSession(headers, enrollment.workspaceSlug, enrollment.mailboxSlug);
  if (!mail) throw new Error(`mailbox ${enrollment.mailboxSlug} not reachable`);
  return {
    enrollment,
    headers,
    appUser: {
      ...appUser,
      workspaceId: appUser.workspaceId,
      workspaceSlug: appUser.workspaceSlug,
      workspaceRole: appUser.workspaceRole,
    },
    mail,
  };
}
