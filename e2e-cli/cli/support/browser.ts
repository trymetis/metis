import { APP } from "@metis/e2e-cli/clients/hosts";
import { type Browser, chromium, type Page } from "@playwright/test";

import { anaCookie } from "./session";

export const PAGE_TIMEOUT = 30_000;

let browser: Promise<Browser> | undefined;

export async function closeBrowser(): Promise<void> {
  const open = browser;
  browser = undefined;
  if (open) await (await open).close();
}

export async function withPage<T>(
  cookie: string | null,
  run: (page: Page) => Promise<T>,
): Promise<T> {
  browser ??= chromium.launch({ channel: "chrome", headless: true });
  const context = await (
    await browser
  ).newContext({
    baseURL: APP,
    timezoneId: "UTC",
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
  });
  context.setDefaultTimeout(PAGE_TIMEOUT);
  try {
    if (cookie) {
      await context.addCookies(
        cookie.split("; ").map((pair) => {
          const at = pair.indexOf("=");
          return { name: pair.slice(0, at), value: pair.slice(at + 1), url: APP };
        }),
      );
    }
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

export async function withAnaPage<T>(run: (page: Page) => Promise<T>): Promise<T> {
  return withPage(await anaCookie(), run);
}
