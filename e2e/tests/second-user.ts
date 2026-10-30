import type { Browser, BrowserContext, Page } from "@playwright/test";
import * as OTPAuth from "otpauth";

import { enterCode } from "./auth";
import { type Rpc, rpcFor } from "./fixtures";
import { APP, SIGNED_OUT } from "./harness";

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

export async function inviteToSignUp(anaRpc: Rpc, email: string): Promise<string> {
  const { url } = await anaRpc<{ url: string }>("signupInvites.create", {
    email,
  });
  return url;
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
