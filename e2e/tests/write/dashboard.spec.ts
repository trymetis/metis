import type { Page } from "@playwright/test";

import { enterCode } from "../auth";
import { expect, test } from "../fixtures";
import { harness } from "../harness";

function main(page: Page) {
  return page.getByRole("main");
}

function sidebar(page: Page) {
  return page.getByRole("complementary", { name: "Dashboard" });
}

function saveBar(page: Page) {
  return main(page)
    .getByRole("status")
    .filter({ has: page.getByRole("button", { name: "Save changes" }) });
}

function toasts(page: Page) {
  return page.getByRole("region", { name: /^Notifications/ });
}

function relayMax(page: Page) {
  return main(page).getByRole("spinbutton", { name: "Max transfer size (MB)" });
}

function consentVersion(page: Page) {
  return main(page).getByRole("textbox", { name: "Version", exact: true });
}

async function currentVersion(page: Page): Promise<number> {
  const line = main(page).getByText(/^Configuration version \d+\./);
  await expect(line).toBeVisible();
  return Number((await line.innerText()).match(/version (\d+)/)?.[1]);
}

async function confirmTotp(page: Page, title: string, action: string) {
  const dialog = page.getByRole("alertdialog", { name: title });
  await expect(dialog).toBeVisible();
  await enterCode(page, await harness.totp());
  await dialog.getByRole("button", { name: action, exact: true }).click();
  await expect(dialog).toBeHidden();
}

export default function dashboardSpecs() {
  test("an instance config edit across two sections is one version, shows in History with its diff, and restoring the previous version undoes it", async ({
    page,
    account,
  }) => {
    await page.goto("/dashboard/system/instance");
    const before = await currentVersion(page);
    const max = Number(await relayMax(page).inputValue());
    const consent = await consentVersion(page).inputValue();

    await relayMax(page).fill(String(max + 1));
    await consentVersion(page).fill(`${consent}-e2e`);
    await expect(saveBar(page)).toContainText("2 unsaved changes");
    await saveBar(page).getByRole("button", { name: "Save changes" }).click();
    await confirmTotp(page, "Save changes", "Save");
    await expect(
      toasts(page).getByText(`Saved as version ${before + 1}`, { exact: true }),
    ).toBeVisible();
    await expect(saveBar(page)).toHaveCount(0);

    await page.reload();
    expect(await currentVersion(page)).toBe(before + 1);
    await expect(relayMax(page)).toHaveValue(String(max + 1));
    await expect(consentVersion(page)).toHaveValue(`${consent}-e2e`);

    await sidebar(page).getByRole("link", { name: "History", exact: true }).click();
    await expect(main(page).getByRole("heading", { level: 1, name: "History" })).toBeVisible();
    const row = (version: number) =>
      main(page)
        .getByRole("row")
        .filter({
          has: page.getByRole("cell", {
            name: new RegExp(`^${version}( Current)?$`),
          }),
        });
    const saved = row(before + 1);
    await expect(
      saved.getByRole("cell", { name: `${before + 1} Current`, exact: true }),
    ).toBeVisible();
    await expect(saved).toContainText("Drive relay");
    await expect(saved).toContainText("Legal consent");
    await expect(saved).toContainText(account.email);

    await row(before).getByRole("button", { name: "Compare" }).click();
    await expect(main(page)).toContainText(`${consent}-e2e`);
    await expect(main(page)).toContainText(String(max + 1));

    await row(before).getByRole("button", { name: "Restore" }).click();
    await confirmTotp(page, `Restore version ${before}`, "Restore");
    await expect(
      toasts(page).getByText(`Version ${before} restored as version ${before + 2}`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      row(before + 2).getByRole("cell", {
        name: `${before + 2} Current`,
        exact: true,
      }),
    ).toBeVisible();

    await page.goto("/dashboard/system/instance");
    expect(await currentVersion(page)).toBe(before + 2);
    await expect(relayMax(page)).toHaveValue(String(max));
    await expect(consentVersion(page)).toHaveValue(consent);
  });

  test("unsaved instance config edits block dashboard links and tab close until reset", async ({
    page,
  }) => {
    await page.goto("/dashboard/system/instance");
    const before = await currentVersion(page);
    const max = Number(await relayMax(page).inputValue());
    await relayMax(page).fill(String(max + 5));
    await expect(saveBar(page)).toContainText("1 unsaved change");

    await sidebar(page).getByRole("link", { name: "History", exact: true }).click();
    await expect(saveBar(page)).toContainText("Careful — you have unsaved changes!");
    await expect(page).toHaveURL(/\/dashboard\/system\/instance$/);

    const prompted = page.waitForEvent("dialog");
    await page.close({ runBeforeUnload: true });
    const dialog = await prompted;
    expect(dialog.type()).toBe("beforeunload");
    await dialog.dismiss();
    expect(page.isClosed()).toBe(false);

    await saveBar(page).getByRole("button", { name: "Reset" }).click();
    await expect(saveBar(page)).toHaveCount(0);
    await expect(relayMax(page)).toHaveValue(String(max));
    await sidebar(page).getByRole("link", { name: "History", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/system\/history$/);
    await page.goto("/dashboard/system/instance");
    expect(await currentVersion(page)).toBe(before);
  });

  test("resetting a section to the environment shows what changes, stores a Reset version and puts the environment value back", async ({
    page,
  }) => {
    await page.goto("/dashboard/system/instance");
    const max = Number(await relayMax(page).inputValue());
    const card = main(page)
      .locator("section")
      .filter({ has: page.getByRole("spinbutton", { name: "Max transfer size (MB)" }) });
    const resetButton = card.getByRole("button", { name: "Reset to environment" });

    await relayMax(page).fill(String(max + 3));
    await expect(resetButton).toBeDisabled();
    await saveBar(page).getByRole("button", { name: "Save changes" }).click();
    await confirmTotp(page, "Save changes", "Save");
    await expect(saveBar(page)).toHaveCount(0);
    const saved = await currentVersion(page);

    await resetButton.click();
    const dialog = page.getByRole("alertdialog", { name: "Reset Drive relay to environment" });
    await expect(dialog).toBeVisible();
    const change = dialog.getByText("Max transfer size (MB)", { exact: true }).locator("..");
    await expect(change).toContainText(String(max + 3));
    const environment = Number((await change.locator("span.font-mono").last().innerText()).trim());
    await enterCode(page, await harness.totp());
    await dialog.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(
      toasts(page).getByText(`Drive relay reset to environment as version ${saved + 1}`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(relayMax(page)).toHaveValue(String(environment));
    await expect(resetButton).toBeDisabled();

    await sidebar(page).getByRole("link", { name: "History", exact: true }).click();
    const current = main(page)
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: `${saved + 1} Current`, exact: true }) });
    await expect(current).toContainText("Reset");
    await expect(current).toContainText("Drive relay");

    if (environment !== max) {
      await page.goto("/dashboard/system/instance");
      await relayMax(page).fill(String(max));
      await saveBar(page).getByRole("button", { name: "Save changes" }).click();
      await confirmTotp(page, "Save changes", "Save");
      await expect(saveBar(page)).toHaveCount(0);
    }
  });

  test("a server list save checks only new or changed servers, can be saved anyway, and saves a removal without refusing", async ({
    page,
  }) => {
    await page.goto("/dashboard/system/providers/webdav");
    const before = await currentVersion(page);
    const refused = main(page).locator("section").filter({ hasText: "Check failed" });

    await main(page).getByRole("button", { name: "Add server" }).click();
    await main(page).getByRole("textbox", { name: "Name", exact: true }).last().fill("Nowhere");
    await main(page)
      .getByRole("textbox", { name: "WebDAV URL" })
      .last()
      .fill("http://webdav.localhost:1/");
    await saveBar(page).getByRole("button", { name: "Save changes" }).click();
    await confirmTotp(page, "Save changes", "Save");

    await expect(refused).toContainText("Nothing was saved.");
    await expect(refused.getByText("Nowhere · WebDAV endpoint")).toBeVisible();
    await expect(refused.getByText("Shared Files · WebDAV endpoint")).toBeVisible();
    await expect(refused).toContainText(/Unchanged/);
    expect(await currentVersion(page)).toBe(before);

    await refused.getByRole("button", { name: "Save anyway" }).click();
    await confirmTotp(page, "Save anyway", "Save anyway");
    await expect(
      toasts(page).getByText(`Saved as version ${before + 1}`, { exact: true }),
    ).toBeVisible();
    await expect(saveBar(page)).toHaveCount(0);

    await main(page).getByRole("button", { name: "Remove Nowhere" }).click();
    await saveBar(page).getByRole("button", { name: "Save changes" }).click();
    await confirmTotp(page, "Save changes", "Save");
    await expect(
      toasts(page).getByText(`Saved as version ${before + 2}`, { exact: true }),
    ).toBeVisible();
    await expect(refused).toHaveCount(0);
    await expect(main(page).getByText("Nowhere", { exact: true })).toHaveCount(0);
  });

  test("the people, workspaces, connections and MCP pages list the seeded instance", async ({
    page,
    account,
  }) => {
    await page.goto("/dashboard/people");
    await expect(
      main(page)
        .getByRole("row")
        .filter({
          has: page.getByRole("cell", { name: account.email, exact: true }),
        }),
    ).toContainText("Enabled");

    await page.goto("/dashboard/workspaces");
    const workspace = main(page)
      .getByRole("row")
      .filter({
        has: page.getByRole("cell", {
          name: new RegExp(`/${account.workspaceSlug}$`),
        }),
      });
    await expect(workspace.getByRole("cell").nth(3)).toHaveText("1");
    await expect(workspace.getByRole("cell").nth(4)).toHaveText("1");
    await expect(workspace.getByRole("cell").nth(5)).toHaveText("7");

    await page.goto("/dashboard/connections");
    const provider = (name: string) =>
      main(page)
        .getByRole("row")
        .filter({ has: page.getByRole("cell", { name, exact: true }) });
    await expect(provider("IMAP").getByRole("cell").nth(2)).toHaveText("1");
    await expect(provider("CalDAV").getByRole("cell").nth(3)).toHaveText("1");
    await expect(provider("S3").getByRole("cell").nth(4)).toHaveText("2");
    await expect(provider("FTP").getByRole("cell").nth(4)).toHaveText("3");

    await page.goto("/dashboard/mcp");
    await expect(main(page).getByRole("heading", { level: 2, name: "All clients" })).toBeVisible();
  });
}
