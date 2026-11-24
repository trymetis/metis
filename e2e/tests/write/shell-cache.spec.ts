import type { Browser, Page } from "@playwright/test";
import { z } from "zod";

import { enterCode, signIn } from "../auth";
import { expect, type Rpc, rpcFor, test } from "../fixtures";
import { APP, harness, SIGNED_OUT } from "../harness";
import {
  enrollTotp,
  inviteToSignUp,
  newSecondUser,
  type SecondUser,
  signUpByInvite,
  totpFor,
} from "../second-user";
import {
  cachedData,
  hasShellCache,
  readShellCache,
  sessionUserId,
  shellKeys,
} from "../shell-cache";

async function freshPage(browser: Browser) {
  const context = await browser.newContext({
    baseURL: APP,
    storageState: SIGNED_OUT,
    timezoneId: "UTC",
  });
  return { context, page: await context.newPage() };
}

async function newAccount(browser: Browser, rpc: Rpc) {
  const fields = newSecondUser();
  const { context, page } = await freshPage(browser);
  await signUpByInvite(page, await inviteToSignUp(rpc, fields.email), fields);
  const user: SecondUser = { ...fields, secret: await enrollTotp(page, fields.password) };
  return { user, context };
}

async function shellCached(page: Page) {
  await expect
    .poll(async () => shellKeys(await readShellCache(page)))
    .toContain("workspaces.list (query)");
}

async function signInForm(page: Page) {
  await expect(
    page.getByRole("main").getByRole("textbox", { name: "Email address" }),
  ).toBeVisible();
}

export default function shellCacheSpecs() {
  test("Sign out deletes the browser's shell cache", async ({ browser, account }) => {
    const { context, page } = await freshPage(browser);
    try {
      await signIn(page, account, () => harness.totp());
      await shellCached(page);

      await page.getByRole("button", { name: account.name, exact: true }).click();
      await page.getByRole("menuitem", { name: "Sign out" }).click();
      await signInForm(page);
      await expect.poll(() => hasShellCache(page)).toBe(false);
    } finally {
      await context.close();
    }
  });

  test("Sign out everywhere with this device deletes the browser's shell cache", async ({
    browser,
    rpc,
  }) => {
    const { user, context: other } = await newAccount(browser, rpc);
    const { context, page } = await freshPage(browser);
    try {
      await signIn(page, user, () => Promise.resolve(totpFor(user)));
      await shellCached(page);

      await page.goto("/settings/account");
      await page.getByRole("button", { name: "Sign out all" }).click();
      const dialog = page.getByRole("alertdialog", { name: "Sign out other browsers?" });
      await dialog.getByText("Also sign out this device", { exact: true }).click();
      await enterCode(page, totpFor(user));
      await dialog.getByRole("button", { name: "Sign out everywhere" }).click();
      await signInForm(page);
      await expect.poll(() => hasShellCache(page)).toBe(false);
    } finally {
      await other.close();
      await context.close();
    }
  });

  test("when another account signs in to the same browser, the shell cache holds only that account's lists", async ({
    browser,
    account,
    rpc,
  }) => {
    const { user, context: signUp } = await newAccount(browser, rpc);
    await signUp.close();
    const { context, page } = await freshPage(browser);
    try {
      await signIn(page, account, () => harness.totp());
      await shellCached(page);
      const anaId = await sessionUserId(page);
      expect((await readShellCache(page))?.owner?.userId).toBe(anaId);

      await context.clearCookies();
      await signIn(page, user, () => Promise.resolve(totpFor(user)));
      const userId = await sessionUserId(page);
      await expect.poll(async () => (await readShellCache(page))?.owner?.userId).toBe(userId);
      await shellCached(page);

      const { workspaces } = await rpcFor(page.request)<{ workspaces: { slug: string }[] }>(
        "workspaces.list",
      );
      const ownSlugs = workspaces.map((w) => w.slug).toSorted();
      const listSchema = z.object({ workspaces: z.array(z.object({ slug: z.string() })) });
      const cachedSlugs = cachedData(await readShellCache(page), "workspaces.list").map((data) =>
        listSchema
          .parse(data)
          .workspaces.map((w) => w.slug)
          .toSorted(),
      );
      expect(cachedSlugs).toEqual([ownSlugs]);
    } finally {
      await context.close();
    }
  });
}
