import { z } from "zod";

import { expect, test } from "../fixtures";
import { HARNESS, mailPath } from "../harness";
import { messageToolbar, openMail, showTab } from "../mail";

const PRIVACY = "This week at the shop";

async function pixelHits(): Promise<string[]> {
  const res = await fetch(`${HARNESS}/pixel-hits`);
  return z
    .array(z.object({ path: z.string() }))
    .parse(await res.json())
    .map((h) => h.path);
}

function blockedBanner(page: import("@playwright/test").Page) {
  return page
    .getByRole("main")
    .getByRole("alert")
    .filter({ hasText: /^\d+ remote images? blocked/ });
}

test.describe.configure({ mode: "default" });

test("a blocked message requests nothing remote", async ({ page, account }) => {
  await fetch(`${HARNESS}/pixel-hits`, { method: "DELETE" });
  await page.goto(mailPath(account));
  await showTab(page, "All");
  await openMail(page, PRIVACY);
  await expect(
    blockedBanner(page).getByRole("button", {
      name: "Load images",
      exact: true,
    }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(await pixelHits()).toEqual([]);
});

test("Load images loads only images, never trackers, fonts, styles, media or refreshes", async ({
  page,
  account,
}) => {
  await fetch(`${HARNESS}/pixel-hits`, { method: "DELETE" });
  await page.goto(mailPath(account));
  await showTab(page, "All");
  await openMail(page, PRIVACY);
  await blockedBanner(page).getByRole("button", { name: "Load images", exact: true }).click();
  await expect(blockedBanner(page)).toHaveCount(0);
  await expect.poll(pixelHits).toContainEqual(expect.stringMatching(/^\/image\/img/));
  await page.waitForLoadState("networkidle");
  const hits = await pixelHits();
  expect(hits.filter((path) => path.startsWith("/never/"))).toEqual([]);
  expect(hits.every((path) => path.startsWith("/image/"))).toBe(true);
});

async function openPrint(page: import("@playwright/test").Page) {
  const opened = page.context().waitForEvent("page");
  await messageToolbar(page).getByRole("link", { name: "Print", exact: true }).click();
  const tab = await opened;
  await expect(tab.getByText("Free shipping on orders over EUR 60")).toBeVisible();
  await tab.waitForLoadState("networkidle");
  return tab;
}

test("Print keeps blocked images blocked", async ({ page, account }) => {
  await page.goto(mailPath(account));
  await showTab(page, "All");
  await openMail(page, PRIVACY);
  await expect(blockedBanner(page)).toBeVisible();
  await fetch(`${HARNESS}/pixel-hits`, { method: "DELETE" });
  const tab = await openPrint(page);
  expect(await pixelHits()).toEqual([]);
  await tab.close();
});

test("Print after Load images loads the images and still never the trackers", async ({
  page,
  account,
}) => {
  await page.goto(mailPath(account));
  await showTab(page, "All");
  await openMail(page, PRIVACY);
  await blockedBanner(page).getByRole("button", { name: "Load images", exact: true }).click();
  await expect(blockedBanner(page)).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  await fetch(`${HARNESS}/pixel-hits`, { method: "DELETE" });
  const tab = await openPrint(page);
  await expect.poll(pixelHits).toContainEqual(expect.stringMatching(/^\/image\/img/));
  const hits = await pixelHits();
  expect(hits.filter((path) => path.startsWith("/never/"))).toEqual([]);
  expect(hits.every((path) => path.startsWith("/image/"))).toBe(true);
  await tab.close();
});

test("the message frame is sandboxed without scripts", async ({ page, account }) => {
  await page.goto(mailPath(account));
  await showTab(page, "All");
  await openMail(page, PRIVACY);
  const frame = page.getByRole("main").locator("iframe");
  await expect(frame).toBeAttached();
  const sandbox = (await frame.getAttribute("sandbox")) ?? "";
  expect(sandbox).toContain("allow-same-origin");
  expect(sandbox).not.toContain("allow-scripts");
  expect(sandbox).not.toContain("allow-forms");
  expect(sandbox).not.toContain("allow-top-navigation");
});
