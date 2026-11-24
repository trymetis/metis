import type { APIRequestContext, Browser, BrowserContext, Page } from "@playwright/test";
import { z } from "zod";

import { contextOptions } from "./browser.ts";

export const APP_URL = process.env.DOCS_APP_URL ?? "http://localhost:3000";
export const HARNESS_URL = process.env.DOCS_HARNESS_URL ?? "http://localhost:8099";
export const CLOCK = new Date(process.env.DOCS_CLOCK ?? "2026-10-08T12:00:00Z");

export const accountSchema = z.object({
  email: z.string(),
  password: z.string(),
  workspaceSlug: z.string(),
  mailboxSlug: z.string(),
  calendarSlug: z.string(),
  driveSlugs: z.record(z.string(), z.string()),
});
export type Account = z.infer<typeof accountSchema>;

export type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

export async function harness(path: string): Promise<Response> {
  const res = await fetch(`${HARNESS_URL}${path}`);
  if (!res.ok) throw new Error(`harness ${path}: HTTP ${res.status}`);
  return res;
}

export async function harnessAccount(): Promise<Account> {
  return accountSchema.parse(await (await harness("/account")).json());
}

export async function totp(): Promise<string> {
  return (await (await harness("/totp?fresh=1")).text()).trim();
}

const rpcResponseSchema = z.object({ json: z.unknown() });

export async function rpc(
  on: { request: APIRequestContext },
  procedure: string,
  input?: unknown,
): Promise<unknown> {
  const res = await on.request.post(`${APP_URL}/rpc/${procedure}`, {
    headers: { origin: APP_URL },
    data: { json: input },
  });
  if (!res.ok()) throw new Error(`rpc ${procedure}: HTTP ${res.status()} ${await res.text()}`);
  return rpcResponseSchema.parse(await res.json()).json;
}

export async function signIn(
  browser: Browser,
  who: { email: string; password: string },
  code: () => Promise<string> = totp,
): Promise<StorageState> {
  const context = await browser.newContext(contextOptions(APP_URL));
  try {
    const page = await context.newPage();
    await page.goto(`${APP_URL}/`);
    const content = page.getByRole("main");
    await content.getByRole("textbox", { name: "Email address" }).fill(who.email);
    await content.getByRole("textbox", { name: "Password" }).fill(who.password);
    await content.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(/\/2fa\/verify/);
    await page.locator('input[autocomplete="one-time-code"]').click();
    await page.keyboard.type(await code());
    await content.getByRole("button", { name: "Verify", exact: true }).click();
    await page.waitForURL(/\/w\//);
    return await context.storageState();
  } finally {
    await context.close();
  }
}

export async function asUser<T>(
  browser: Browser,
  state: StorageState,
  use: (page: Page) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext({ ...contextOptions(APP_URL), storageState: state });
  try {
    return await use(await context.newPage());
  } finally {
    await context.close();
  }
}

const themesSchema = z.object({
  themes: z.array(z.object({ id: z.string(), name: z.string(), source: z.string() })),
});

export async function selectTheme(
  on: { request: APIRequestContext },
  workspaceSlug: string,
  name: string,
) {
  const { themes } = themesSchema.parse(await rpc(on, "workspaceThemes/list", { workspaceSlug }));
  const theme = themes.find((t) => t.source === "system" && t.name === name);
  if (!theme) throw new Error(`no ${name} theme`);
  await rpc(on, "workspaceThemes/select", { workspaceSlug, themeId: theme.id });
}
