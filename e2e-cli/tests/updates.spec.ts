import { enterCode } from "@metis/e2e/tests/auth";
import { expect, test } from "@metis/e2e/tests/fixtures";
import { harness } from "@metis/e2e/tests/harness";
import type { Page } from "@playwright/test";

import { docker, shell } from "../clients/hosts";
import { settled, UPGRADE_TIMEOUT } from "../clients/updates";
import { releases } from "../lib/releases";

const r = releases();
const IMAGE = "ghcr.io/trymetis/metis";

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

async function registryAddress(): Promise<string> {
  const found = await shell(
    "cli-host",
    "curl -sk -o /dev/null -w '%{remote_ip}' https://ghcr.io/v2/",
    { check: true },
  );
  return found.stdout.trim();
}

async function registryPulls(rule: "I" | "D", address: string) {
  await shell("cli-host", `iptables -${rule} OUTPUT -p tcp -d ${address} --dport 443 -j DROP`, {
    check: true,
  });
}

async function upgradeTo(page: Page, version: string, verb: string) {
  await releaseRow(page, version).getByRole("button", { name: verb, exact: true }).click();
  await confirmTotp(page, `${verb} to ${version}`, verb);
}

export default function updateSpecs() {
  test.describe.configure({ timeout: 2 * UPGRADE_TIMEOUT });

  test("upgrading to a newer release shows its notes and progress, then runs that release with an undo", async ({
    page,
    rpc,
  }) => {
    await openUpdates(page);
    await runningVersion(page, r.current);
    await expect(section(page, "Running release")).toContainText("Update available");
    await expect(section(page, "Releases").getByText(r.current, { exact: true })).toHaveCount(0);
    await expect(section(page, "Releases").getByText(r.previous, { exact: true })).toHaveCount(0);

    await releaseRow(page, r.next)
      .locator("..")
      .getByRole("button", { name: "Release notes" })
      .click();
    await expect(section(page, "Releases")).toContainText(
      "Saved searches can be pinned to the sidebar.",
    );

    await upgradeTo(page, r.next, "Upgrade");
    const last = section(page, "Last upgrade");
    await expect(last).toContainText(`${r.current} → ${r.next}`);
    await expect(last).toContainText("Running");

    await expect(last).toContainText("Succeeded", { timeout: UPGRADE_TIMEOUT });
    await expect(toasts(page).getByText(`Now running ${r.next}`, { exact: true })).toBeVisible();
    await page.reload();
    await runningVersion(page, r.next);
    await expect(section(page, "Running release")).toContainText("Up to date");
    await expect(section(page, "Running release")).toContainText(`Undo returns to ${r.current}`);
    await expect(
      section(page, "Running release").getByRole("button", { name: "Undo last upgrade" }),
    ).toBeVisible();
    await expect(section(page, "Releases")).toContainText("No newer release is published.");
    expect((await settled(rpc)).currentVersion).toBe(r.next);
  });

  test("an older release is not offered", async ({ page }) => {
    await openUpdates(page);
    await runningVersion(page, r.next);
    await expect(section(page, "Releases").getByText(r.current, { exact: true })).toHaveCount(0);
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
    await expect(last).toContainText(`${r.next} → ${r.current}`);
    await expect(last).toContainText("Succeeded", { timeout: UPGRADE_TIMEOUT });
    await page.reload();
    await runningVersion(page, r.current);
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
        targetLabel: `${r.next} → ${r.current}`,
      }),
    );
  });

  test("a release whose preflight fails is never installed, and the snapshot is restored", async ({
    page,
  }) => {
    await openUpdates(page);
    await upgradeTo(page, r.preflightFails, "Upgrade");
    const last = section(page, "Last upgrade");
    await expect(last).toContainText("Failed", { timeout: UPGRADE_TIMEOUT });
    await expect(last).toContainText(
      `${r.preflightFails} failed, so the updater restored the database snapshot and switched back to ${r.current}.`,
    );
    await expect(last).toContainText("preflight failed");
    await expect(last).toContainText(`${r.preflightFails} is an e2e release whose preflight fails`);
    await expect(toasts(page).getByText("The upgrade failed", { exact: true })).toBeVisible();
    await runningVersion(page, r.current);
  });

  test("an upgrade in progress disables Upgrade, and a release that never becomes ready is switched back", async ({
    page,
    rpc,
  }) => {
    await openUpdates(page);
    await upgradeTo(page, r.neverReady, "Upgrade");
    const last = section(page, "Last upgrade");
    await expect(last).toContainText("Running");
    await expect(releaseRow(page, r.next).getByRole("button", { name: "Upgrade" })).toBeDisabled();
    await expect(last).toContainText("Failed", { timeout: UPGRADE_TIMEOUT });
    await expect(last).toContainText(
      `${r.neverReady} failed, so the updater restored the database snapshot and switched back to ${r.current}.`,
    );
    await expect(last).toContainText("was not ready within");
    await runningVersion(page, r.current);
    expect((await settled(rpc)).currentVersion).toBe(r.current);
  });

  test("an upgrade the updater did not finish is shown as needing attention", async ({
    page,
    rpc,
  }) => {
    await openUpdates(page);
    const last = section(page, "Last upgrade");
    const registry = await registryAddress();
    expect(registry).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    await docker(
      "cli-host",
      ["rmi", ...["", "-preflight", "-worker"].map((kind) => `${IMAGE}:${r.next}${kind}`)],
      { check: true },
    );
    await registryPulls("I", registry);
    try {
      await upgradeTo(page, r.next, "Upgrade");
      await expect(last).toContainText(`${r.current} → ${r.next}`);
      await expect(last).toContainText("Running");
      await docker("cli-host", ["kill", "metis-updater"], { check: true });
    } finally {
      await registryPulls("D", registry);
      await docker("cli-host", ["start", "metis-updater"], { check: true });
    }
    await expect(last).toContainText("Needs attention", { timeout: UPGRADE_TIMEOUT });
    await expect(last).toContainText(
      `Switching back to ${r.current} failed too. On the server, check sudo metis status and sudo metis logs app.`,
    );
    await expect(last).toContainText("the updater stopped while this upgrade was running");
    await expect(toasts(page).getByText("The upgrade failed", { exact: true })).toBeVisible();
    await runningVersion(page, r.current);
    expect((await settled(rpc)).currentVersion).toBe(r.current);
  });

  test("a release that needs a newer server CLI is refused with the self-update step", async ({
    page,
    rpc,
  }) => {
    const message = `This release needs Metis CLI ${r.needsCliMin} or later. Run sudo metis self-update on the server, then try again.`;
    const before = await settled(rpc);
    await openUpdates(page);
    await releaseRow(page, r.needsCli)
      .getByRole("button", { name: "Upgrade", exact: true })
      .click();
    const dialog = page.getByRole("alertdialog", { name: `Upgrade to ${r.needsCli}` });
    await enterCode(page, await harness.totp());
    await dialog.getByRole("button", { name: "Upgrade", exact: true }).click();
    await expect(dialog.getByText(message, { exact: true })).toBeVisible();
    const after = await settled(rpc);
    expect(after.currentVersion).toBe(r.current);
    expect(after.upgrade?.id).toBe(before.upgrade?.id);
  });

  test("an updater that stops answering is shown as unreachable", async ({ page, rpc }) => {
    await docker("cli-host", ["stop", "metis-updater"], { check: true });
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
      await docker("cli-host", ["start", "metis-updater"], { check: true });
    }
    await expect
      .poll(async () => (await rpc<{ reachable: boolean }>("dashboard.system.updates")).reachable, {
        timeout: 60_000,
      })
      .toBe(true);
    await page.reload();
    await runningVersion(page, r.current);
  });
}
