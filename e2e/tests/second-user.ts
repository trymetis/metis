import { consoleMailHitsSchema } from "@metis/e2e/lib/console-mail";
import { env } from "@metis/e2e/lib/env";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import * as OTPAuth from "otpauth";

import { enterCode } from "./auth";
import { type Rpc, RpcError, rpcFor } from "./fixtures";
import { APP, HARNESS, harness, SIGNED_OUT } from "./harness";

export const SECOND_STATE = "tests/.auth/second.json";

export interface SecondUser {
  name: string;
  email: string;
  password: string;
  secret: string;
}

let current: SecondUser | undefined;

export function totpFor(user: SecondUser): string {
  return new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(user.secret),
  }).generate();
}

export function newSecondUser(): Omit<SecondUser, "secret"> {
  const id = Date.now().toString(36);
  return {
    name: `Bo Member ${id}`,
    email: `bo-${id}@demo.trymetis.email`,
    password: `bo-member-password-${id}`,
  };
}

const INVITE_LINK = /https?:\/\/\S+\/invite\/signup\?token=[A-Za-z0-9_-]+/;
const INVITE_MAIL_TIMEOUT_MS = 30_000;
const INVITE_MAIL_POLL_MS = 500;

async function setMailer(rpc: Rpc, values: Record<string, unknown>): Promise<void> {
  for (;;) {
    try {
      const form = await rpc<{ version: number; values: Record<string, unknown> }>(
        "dashboard.system.form",
        { section: "mailer" },
      );
      await rpc("dashboard.system.update", {
        expectedVersion: form.version,
        sections: [{ section: "mailer", values: { ...form.values, ...values }, entries: null }],
        code: await harness.totp(),
      });
      return;
    } catch (err) {
      if (!(err instanceof RpcError) || err.status !== 429) throw err;
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
}

async function inviteLinkFor(email: string): Promise<string> {
  const deadline = Date.now() + INVITE_MAIL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${HARNESS}/console-mail-hits`);
    const hits = consoleMailHitsSchema.parse(await res.json());
    const link = hits
      .filter((hit) => hit.to === email)
      .map((hit) => INVITE_LINK.exec(hit.text)?.[0])
      .findLast((found) => found !== undefined);
    if (link) return link;
    await new Promise((resolve) => setTimeout(resolve, INVITE_MAIL_POLL_MS));
  }
  throw new Error(`no sign-up invite email reached the console endpoint for ${email}`);
}

export async function inviteToSignUp(anaRpc: Rpc, email: string): Promise<string> {
  await setMailer(anaRpc, {
    driver: "console",
    endpoint: env.consoleMail.url,
    token: env.consoleMail.token,
  });
  try {
    await anaRpc("signupInvites.create", { email });
    return await inviteLinkFor(email);
  } finally {
    await setMailer(anaRpc, { driver: "log" });
  }
}

export async function signUpByInvite(
  page: Page,
  url: string,
  user: Omit<SecondUser, "secret">,
): Promise<void> {
  await page.goto(url);
  await page.getByPlaceholder("Your name").fill(user.name);
  await page.getByPlaceholder("At least 8 characters").fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/2fa\/setup/);
}

export async function enrollTotp(page: Page, password: string): Promise<string> {
  await page.getByPlaceholder("Your password").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Can't scan? Show manual key").click();
  const secret = (await page.locator("details code").innerText()).replace(/\s+/g, "");
  await page.getByRole("button", { name: "I've saved my backup codes, continue" }).click();
  await enterCode(page, new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) }).generate());
  await page.getByRole("button", { name: "Verify and enable" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/2fa"));
  return secret;
}

export function rememberSecondUser(user: SecondUser): void {
  current = user;
}

export async function ensureSecondUser(browser: Browser, anaRpc: Rpc): Promise<SecondUser> {
  if (current) return current;
  const user = newSecondUser();
  const context = await browser.newContext({
    baseURL: APP,
    storageState: SIGNED_OUT,
    timezoneId: "UTC",
  });
  const page = await context.newPage();
  await signUpByInvite(page, await inviteToSignUp(anaRpc, user.email), user);
  const secret = await enrollTotp(page, user.password);
  await context.storageState({ path: SECOND_STATE });
  await context.close();
  current = { ...user, secret };
  return current;
}

export async function secondUserContext(browser: Browser): Promise<{
  context: BrowserContext;
  page: Page;
  rpc: Rpc;
}> {
  const context = await browser.newContext({
    baseURL: APP,
    storageState: SECOND_STATE,
    timezoneId: "UTC",
  });
  const page = await context.newPage();
  return { context, page, rpc: rpcFor(page.request) };
}
