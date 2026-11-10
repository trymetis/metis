import { readFile } from "node:fs/promises";

import { z } from "zod";

import { expect, test } from "../fixtures";
import { workspacePath } from "../harness";

const ACCOUNT_PAGES = [
  ["account", "Account"],
  ["privacy", "Privacy"],
  ["workspaces", "Workspaces"],
  ["connections", "Connections"],
  ["mailboxes", "Mailboxes"],
  ["calendars", "Calendars"],
  ["drives", "Drives"],
  ["mcp", "MCP clients"],
  ["security", "Security"],
] as const;

const WORKSPACE_PAGES = [
  ["general", "General"],
  ["mailboxes", "Mailboxes"],
  ["signatures", "Signatures"],
  ["calendars", "Calendars"],
  ["drives", "Drives"],
] as const;

test("every account settings page loads", async ({ page }) => {
  for (const [path, heading] of ACCOUNT_PAGES) {
    await page.goto(`/settings/${path}`);
    await expect(
      page.getByRole("main").getByRole("heading", { level: 1, name: heading }),
    ).toBeVisible();
  }
});

test("the account page downloads the data export and says mail stays with the provider", async ({
  page,
  account,
}) => {
  await page.goto("/settings/account");
  const section = page
    .getByRole("main")
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "Export your data" }),
    });
  await expect(section).toContainText("This is not a mailbox archive.");
  await expect(section).toContainText(
    "mail, calendar events, files and contacts stay with the provider you connected",
  );

  const download = page.waitForEvent("download", { timeout: 30_000 });
  await section.getByRole("button", { name: "Download export" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^metis-suite-export-\d{4}-\d{2}-\d{2}\.json$/);
  const data = z
    .object({
      format: z.string(),
      account: z.object({ email: z.string() }),
      workspaces: z.array(z.object({ slug: z.string() })),
    })
    .parse(JSON.parse(await readFile(await file.path(), "utf8")));
  expect(data.format).toBe("metis-suite-export");
  expect(data.account.email).toBe(account.email);
  expect(data.workspaces.map((w) => w.slug)).toContain(account.workspaceSlug);
});

test("every workspace settings page loads", async ({ page, account }) => {
  for (const [path, heading] of WORKSPACE_PAGES) {
    await page.goto(workspacePath(account, `/settings/${path}`));
    await expect(
      page.getByRole("main").getByRole("heading", { level: 1, name: heading }),
    ).toBeVisible();
  }
});

test("every owner dashboard page loads", async ({ page }) => {
  for (const [path, heading] of [
    ["/dashboard/connections", "Connections"],
    ["/dashboard/accounts", "Accounts"],
    ["/dashboard/accounts/users", "Users"],
    ["/dashboard/accounts/invites", "Invites"],
    ["/dashboard/workspaces", "Workspaces"],
    ["/dashboard/automation", "Automation"],
    ["/dashboard/usage", "AI usage"],
    ["/dashboard/mcp", "MCP clients"],
    ["/dashboard/system", "System"],
    ["/dashboard/system/instance", "Instance"],
    ["/dashboard/system/history", "History"],
    ["/dashboard/system/preflight", "Deploy checks"],
  ] as const) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(
      page.getByRole("main").getByRole("heading", { level: 1 }).filter({ hasText: heading }),
      path,
    ).toBeVisible();
  }
});

test("the dashboard shows the instance counts, the recorded usage and the runner's health", async ({
  page,
}) => {
  await page.goto("/dashboard");
  const overview = page.getByRole("main");
  await expect(overview.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(overview).toContainText(/Users\s*Accounts on this instance\s*2/);
  await expect(overview).toContainText(/Mailboxes\s*Connected across all accounts\s*1/);
  await expect(overview).toContainText(/Calendars\s*Connected across all accounts\s*1/);
  await expect(overview).toContainText(/Drives\s*Connected across all accounts\s*7/);

  await page.goto("/dashboard/usage");
  await page.getByRole("button", { name: "90 days" }).click();
  await expect(page.getByRole("img", { name: "Input and output tokens per day" })).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText(/Calls\s*0\b/);

  await page.goto("/dashboard/automation");
  await expect(page.getByRole("heading", { name: "Runner" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText(/internal · every 2s/);
  await expect(page.getByRole("main")).toContainText(/Last successful tick/);
});
