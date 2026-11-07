import { env } from "@metis/e2e/lib/env";
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { calendarPath, drivePath, mailPath, workspacePath } from "../harness";

const VERSION = /v\d+\.\d+\.\d+/;

async function expectSourceLink(link: Locator) {
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", env.sourceUrl);
  await expect(link).toContainText(VERSION);
}

function railSourceLink(page: Page) {
  return page
    .getByRole("navigation", { name: "App navigation" })
    .getByRole("link", { name: "Source code", exact: true });
}

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("pages before sign-in link to the configured source with the running version", async ({
    page,
  }) => {
    for (const path of ["/", "/forgot-password"]) {
      await page.goto(path);
      await expectSourceLink(
        page.getByRole("contentinfo").getByRole("link", { name: /^Source code/ }),
      );
    }
  });
});

test("every workspace surface shows the source link in the rail", async ({ page, account }) => {
  for (const path of [
    mailPath(account),
    calendarPath(account),
    drivePath(account, "s3"),
    workspacePath(account, "/assistant"),
    workspacePath(account, "/workflow"),
    workspacePath(account, "/settings/members"),
    workspacePath(account, "/settings/general"),
  ]) {
    await page.goto(path);
    await expectSourceLink(railSourceLink(page));
  }
});

test("the rail source link stays visible on a phone", async ({ page, account }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(mailPath(account));
  await expectSourceLink(railSourceLink(page));
});

test("account settings and the dashboard show the source link at the bottom of the sidebar", async ({
  page,
}) => {
  for (const [path, sidebar] of [
    ["/settings/account", "Settings"],
    ["/dashboard", "Dashboard"],
  ] as const) {
    await page.goto(path);
    await expectSourceLink(
      page
        .getByRole("complementary", { name: sidebar })
        .getByRole("link", { name: /^Source code/ }),
    );
  }
});
