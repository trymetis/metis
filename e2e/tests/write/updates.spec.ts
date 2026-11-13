import type { Page } from "@playwright/test";

import { updater } from "../../clients/updater";
import { enterCode } from "../auth";
import { expect, test } from "../fixtures";
import { harness } from "../harness";

const UPGRADE_TIMEOUT = 30_000;

let release = { current: "", next: "", previous: "" };

function main(page: Page) {
  return page.getByRole("main");
}

function section(page: Page, title: string) {
  return main(page)
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

function toasts(page: Page) {
  return page.getByRole("region", { name: /^Notifications/ });
}

function releaseRow(page: Page, version: string) {
  return section(page, "Releases").getByText(version, { exact: true }).locator("..");
}

async function runningVersion(page: Page, version: string) {
  await expect(section(page, "Running release").getByText(version, { exact: true })).toBeVisible({
    timeout: UPGRADE_TIMEOUT,
  });
}

async function openUpdates(page: Page) {
  await page.goto("/dashboard/system");
  await page
    .getByRole("complementary", { name: "Dashboard" })
    .getByRole("link", { name: "Updates", exact: true })
    .click();
  await expect(main(page).getByRole("heading", { level: 1, name: "Updates" })).toBeVisible();
}

async function confirmTotp(page: Page, title: string, action: string) {
  const dialog = page.getByRole("alertdialog", { name: title });
  await expect(dialog).toBeVisible();
  await enterCode(page, await harness.totp());
  await dialog.getByRole("button", { name: action, exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function upgradeTo(page: Page, version: string, verb: string) {
  await releaseRow(page, version).getByRole("button", { name: verb, exact: true }).click();
  await confirmTotp(page, `${verb} to ${version}`, verb);
}

export default function updateSpecs() {
  test.beforeEach(async () => {
    const { settings } = await updater.reset();
    const [next = ""] = settings.releases;
    release = { current: settings.current, next, previous: settings.rollback };
  });

  test.afterAll(async () => {
    await updater.reset();
  });

  test("upgrading to a newer release shows its notes and progress, then runs that release with an undo", async ({
    page,
  }) => {
    await openUpdates(page);
    await runningVersion(page, release.current);
    await expect(section(page, "Running release")).toContainText("Update available");
    await expect(section(page, "Releases").getByText(release.current, { exact: true })).toHaveCount(
      0,
    );
    await expect(
      section(page, "Releases").getByText(release.previous, { exact: true }),
    ).toHaveCount(0);

    await section(page, "Releases").getByRole("button", { name: "Release notes" }).click();
    await expect(section(page, "Releases")).toContainText(
      "Saved searches can be pinned to the sidebar.",
    );

    await upgradeTo(page, release.next, "Upgrade");
    const last = section(page, "Last upgrade");
    await expect(last).toContainText(`${release.current} → ${release.next}`);
    await expect(last).toContainText("Running");
    await expect(last).toContainText("Put the app in maintenance and snapshot the database");

    await expect(last).toContainText("Succeeded", { timeout: UPGRADE_TIMEOUT });
    await expect(
      toasts(page).getByText(`Now running ${release.next}`, { exact: true }),
    ).toBeVisible();
    await page.reload();
    await runningVersion(page, release.next);
    await expect(section(page, "Running release")).toContainText("Up to date");
    await expect(section(page, "Running release")).toContainText(
      `Undo returns to ${release.current}`,
    );
    await expect(
      section(page, "Running release").getByRole("button", { name: "Undo last upgrade" }),
    ).toBeVisible();
    await expect(section(page, "Releases")).toContainText("No newer release is published.");
    expect((await updater.state()).settings.current).toBe(release.next);
  });

  test("an older release is not offered", async ({ page }) => {
    await openUpdates(page);
    await runningVersion(page, release.current);
    await expect(
      section(page, "Releases").getByText(release.previous, { exact: true }),
    ).toHaveCount(0);
    await expect(main(page).getByRole("button", { name: "Downgrade" })).toHaveCount(0);
  });

  test("undoing the last upgrade returns to the previous release once and is audited", async ({
    page,
    rpc,
  }) => {
    await openUpdates(page);
    await section(page, "Running release")
      .getByRole("button", { name: "Undo last upgrade" })
      .click();
    await confirmTotp(page, "Undo last upgrade", "Undo");
    const last = section(page, "Last undo");
    await expect(last).toContainText(`${release.current} → ${release.previous}`);
    await expect(last).toContainText("Succeeded", { timeout: UPGRADE_TIMEOUT });
    await page.reload();
    await runningVersion(page, release.previous);
    await expect(
      section(page, "Running release").getByRole("button", { name: "Undo last upgrade" }),
    ).toHaveCount(0);
    await expect(section(page, "Running release")).toContainText("None");

    const { events } = await rpc<{ events: { action: string; targetLabel: string | null }[] }>(
      "audit.mine",
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        action: "instance.upgrade_undone",
        targetLabel: `${release.current} → ${release.previous}`,
      }),
    );
  });

  test("an install the updater cannot snapshot has no undo, and a release whose preflight fails is never installed", async ({
    page,
  }) => {
    await updater.reset({ outcome: "preflight-fails", snapshots: false });
    await openUpdates(page);
    await expect(section(page, "Running release")).toContainText("Not available");
    await expect(section(page, "Running release")).toContainText(
      "Back up the database before upgrading.",
    );
    await upgradeTo(page, release.next, "Upgrade");
    const last = section(page, "Last upgrade");
    await expect(last).toContainText("Failed", { timeout: UPGRADE_TIMEOUT });
    await expect(last).toContainText(
      `${release.next} was not installed; ${release.current} kept running.`,
    );
    await expect(last).toContainText("preflight failed: exit status 1");
    await expect(toasts(page).getByText("The upgrade failed", { exact: true })).toBeVisible();
    await runningVersion(page, release.current);
  });

  test("a release that never becomes ready is switched back", async ({ page }) => {
    await updater.reset({ outcome: "never-ready" });
    await openUpdates(page);
    await upgradeTo(page, release.next, "Upgrade");
    const last = section(page, "Last upgrade");
    await expect(last).toContainText("Failed", { timeout: UPGRADE_TIMEOUT });
    await expect(last).toContainText(
      `${release.next} failed, so the updater restored the database snapshot and switched back to ${release.current}.`,
    );
    await expect(last).toContainText("was not ready within");
    await runningVersion(page, release.current);
  });

  test("a failed switch back is shown as needing attention", async ({ page }) => {
    await updater.reset({ outcome: "restore-fails" });
    await openUpdates(page);
    await upgradeTo(page, release.next, "Upgrade");
    const last = section(page, "Last upgrade");
    await expect(last).toContainText("Needs attention", {
      timeout: UPGRADE_TIMEOUT,
    });
    await expect(last).toContainText(`Switching back to ${release.current} failed too.`);
    await expect(last).toContainText(`restoring ${release.current} also failed`);
    await expect(last).toContainText("the database snapshot is in");
  });

  test("a release that needs a newer server CLI is refused with the self-update step", async ({
    page,
  }) => {
    const message = `This release needs Metis CLI 0.3.0 or later. Run sudo metis self-update on the server, then try again.`;
    await updater.reset({ minCli: { [release.next]: "0.3.0" } });
    await openUpdates(page);
    await releaseRow(page, release.next)
      .getByRole("button", { name: "Upgrade", exact: true })
      .click();
    const dialog = page.getByRole("alertdialog", { name: `Upgrade to ${release.next}` });
    await enterCode(page, await harness.totp());
    await dialog.getByRole("button", { name: "Upgrade", exact: true }).click();
    await expect(dialog.getByText(message, { exact: true })).toBeVisible();
    const state = await updater.state();
    expect(state.settings.current).toBe(release.current);
    expect(state.upgrade).toBeNull();
  });

  test("an upgrade in progress disables Upgrade and Undo", async ({ page }) => {
    await updater.hold();
    await openUpdates(page);
    await expect(section(page, "Last upgrade")).toContainText("Running");
    await expect(
      releaseRow(page, release.next).getByRole("button", { name: "Upgrade" }),
    ).toBeDisabled();
    await expect(
      section(page, "Running release").getByRole("button", { name: "Undo last upgrade" }),
    ).toBeDisabled();
  });

  test("an updater that stops answering is shown as unreachable", async ({ page, rpc }) => {
    await updater.down();
    try {
      const status = await rpc<{ reachable: boolean; error: string | null }>(
        "dashboard.system.updates",
      );
      expect(status.reachable).toBe(false);
      expect(status.error).toBeTruthy();

      await openUpdates(page);
      const card = section(page, "The updater is not answering");
      await expect(card).toBeVisible();
      await expect(card).toContainText("Unreachable");
    } finally {
      await updater.up();
    }
    await page.reload();
    await runningVersion(page, release.current);
  });
}
