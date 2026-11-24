import { sentInviteLink } from "@metis/e2e/lib/invites";
import type { Page } from "@playwright/test";

import { enterCode } from "../auth";
import { expect, test, uniqueName } from "../fixtures";
import { APP, HARNESS, harness, SIGNED_OUT, workspacePath } from "../harness";
import { newSecondUser, signUpByInvite } from "../second-user";

const BANNED = "This account is banned. Ask the instance owner or an admin.";

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
    const resetItem = async () => {
      await card.getByRole("button", { name: "Drive relay actions" }).click();
      return page.getByRole("menuitem", { name: /^Reset to environment/ });
    };

    await relayMax(page).fill(String(max + 3));
    const blocked = await resetItem();
    await expect(blocked).toBeDisabled();
    await expect(blocked).toContainText("Save or discard your changes first");
    await page.keyboard.press("Escape");
    await saveBar(page).getByRole("button", { name: "Save changes" }).click();
    await confirmTotp(page, "Save changes", "Save");
    await expect(saveBar(page)).toHaveCount(0);
    const saved = await currentVersion(page);

    await (await resetItem()).click();
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
    const matching = await resetItem();
    await expect(matching).toBeDisabled();
    await expect(matching).toContainText("Already matches the environment");
    await page.keyboard.press("Escape");

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

  test("the accounts, workspaces, connections and MCP pages list the seeded instance", async ({
    page,
    account,
  }) => {
    await page.goto("/dashboard/accounts");
    const accountRow = main(page)
      .getByRole("row")
      .filter({
        has: page.getByRole("cell", { name: account.email, exact: true }),
      });
    await expect(accountRow).toBeVisible();
    await expect(accountRow).not.toContainText("2FA setup required");

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

  test("a theme created on the Themes page is offered to workspaces, used, and deleted back to Graphite", async ({
    page,
    rpc,
    account,
  }, testInfo) => {
    const name = uniqueName(testInfo);
    const row = (themeName: string) =>
      main(page)
        .getByRole("row")
        .filter({ has: page.getByRole("cell", { name: themeName, exact: true }) });
    await page.goto("/dashboard/themes");
    await expect(row("Graphite")).toContainText("System");
    await expect(row("Graphite").getByRole("checkbox")).toHaveCount(0);
    try {
      await main(page).getByRole("button", { name: "Create theme", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Create a theme" });
      await dialog.getByRole("textbox", { name: "Name" }).fill(name);
      await dialog.getByLabel("Accent color").fill("#7c3aed");
      const created = page.waitForResponse("**/rpc/dashboard/themes/save");
      await dialog.getByRole("button", { name: "Create theme", exact: true }).click();
      expect((await created).ok()).toBe(true);
      await expect(dialog).toBeHidden();
      await expect(row(name)).toContainText("Instance");
      await expect(row(name)).toContainText("None");

      await page.goto(workspacePath(account, "/settings/general"));
      const offered = main(page).getByRole("button", { name, exact: true });
      await expect(
        main(page).getByRole("heading", { level: 4, name: "From your instance" }),
      ).toBeVisible();
      const selected = page.waitForResponse("**/rpc/workspaceThemes/select");
      await offered.click();
      expect((await selected).ok()).toBe(true);
      await expect(offered).toHaveAttribute("aria-pressed", "true");

      await page.goto("/dashboard/themes");
      await expect(row(name)).toContainText("1 workspace");
      await main(page)
        .getByRole("button", { name: `Delete ${name}`, exact: true })
        .click();
      const confirm = page.getByRole("alertdialog", { name: `Delete ${name}?` });
      await expect(confirm).toContainText("Those workspaces switch to Graphite.");
      await confirm.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(confirm).toBeHidden();
      await expect(main(page).getByText(name, { exact: true })).toHaveCount(0);

      await page.goto(workspacePath(account, "/settings/general"));
      await expect(
        main(page).getByRole("button", { name: "Graphite", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
    } finally {
      const { themes } = await rpc<{ themes: { id: string; name: string; source: string }[] }>(
        "dashboard.themes.list",
      );
      const leftover = themes.find((t) => t.name === name);
      if (leftover) await rpc("dashboard.themes.delete", { themeId: leftover.id });
      const blue = themes.find((t) => t.source === "system" && t.name === "Blue");
      if (blue) {
        await rpc("workspaceThemes.select", {
          workspaceSlug: account.workspaceSlug,
          themeId: blue.id,
        });
      }
    }
  });

  test("select all on the Themes page picks only instance themes and deletes them together", async ({
    page,
    rpc,
  }, testInfo) => {
    const { themes } = await rpc<{ themes: { name: string; palette: unknown }[] }>(
      "dashboard.themes.list",
    );
    const palette = themes.find((t) => t.name === "Rose")?.palette;
    const names = [uniqueName(testInfo), `${uniqueName(testInfo)} b`];
    const made: { id: string }[] = [];
    try {
      for (const name of names) {
        const { theme } = await rpc<{ theme: { id: string } }>("dashboard.themes.save", {
          name,
          palette,
        });
        made.push(theme);
      }
      await page.goto("/dashboard/themes");
      const row = (themeName: string) =>
        main(page)
          .getByRole("row")
          .filter({ has: page.getByRole("cell", { name: themeName, exact: true }) });
      await expect(row(names[0] ?? "")).toBeVisible();

      await main(page).getByRole("checkbox", { name: "Select all instance themes" }).click();
      for (const name of names) {
        await expect(row(name).getByRole("checkbox", { name: `Select ${name}` })).toBeChecked();
      }
      await expect(row("Graphite").getByRole("checkbox")).toHaveCount(0);

      await main(page).getByRole("button", { name: "Delete", exact: true }).click();
      const confirm = page.getByRole("alertdialog", { name: /^Delete \d+ themes\?$/ });
      await confirm.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(confirm).toBeHidden();
      for (const name of names) await expect(row(name)).toHaveCount(0);
      await expect(row("Graphite")).toBeVisible();
    } finally {
      for (const theme of made) {
        await rpc("dashboard.themes.delete", { themeId: theme.id }).catch(() => undefined);
      }
    }
  });

  test("an account invite sent from the Invites page is filtered and accepted, and the Users page bans, unbans and removes the new account", async ({
    page,
    browser,
  }) => {
    const user = newSecondUser();
    await page.goto("/dashboard/accounts/invites");
    const link = await sentInviteLink(HARNESS, user.email, async () => {
      await main(page).getByRole("textbox", { name: "Invite email" }).fill(user.email);
      await main(page).getByRole("button", { name: "Invite", exact: true }).click();
      await expect(toasts(page).getByText(`Invite sent to ${user.email}`)).toBeVisible();
    });

    const inviteRow = main(page)
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: user.email, exact: true }) });
    await main(page).getByRole("searchbox", { name: "Search invites" }).fill(user.email);
    await expect(main(page).getByRole("row")).toHaveCount(2);
    await expect(inviteRow).toContainText("No role");
    await main(page).getByRole("combobox", { name: "Role", exact: true }).click();
    await page.getByRole("option", { name: "Admin", exact: true }).click();
    await expect(main(page).getByText("No invites match.")).toBeVisible();

    const context = await browser.newContext({ baseURL: APP, storageState: SIGNED_OUT });
    try {
      const joiner = await context.newPage();
      await signUpByInvite(joiner, link, user);

      await page.goto("/dashboard/accounts/users");
      await main(page).getByRole("searchbox", { name: "Search users" }).fill(user.email);
      const row = main(page)
        .getByRole("row")
        .filter({ has: page.getByRole("cell", { name: user.email, exact: true }) });
      await expect(row).toContainText("Active");
      await expect(row).toContainText("2FA setup required");

      await row.getByRole("button", { name: `Actions for ${user.email}` }).click();
      await page.getByRole("menuitem", { name: "Ban…" }).click();
      const dialog = page.getByRole("alertdialog", { name: "Ban user" });
      await dialog.getByRole("textbox", { name: "Reason (optional)" }).fill("e2e ban");
      await enterCode(page, await harness.totp());
      await dialog.getByRole("button", { name: "Ban user", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(row).toContainText("Banned");

      await main(page).getByRole("combobox", { name: "Status", exact: true }).click();
      await page.getByRole("option", { name: "Active", exact: true }).click();
      await expect(main(page).getByText("No users match.")).toBeVisible();
      await main(page).getByRole("combobox", { name: "Status", exact: true }).click();
      await page.getByRole("option", { name: "Banned", exact: true }).click();
      await expect(row).toBeVisible();

      const fresh = await browser.newContext({ baseURL: APP, storageState: SIGNED_OUT });
      const signInPage = await fresh.newPage();
      const blocked = signInPage.getByRole("main");
      await signInPage.goto("/");
      await blocked.getByRole("textbox", { name: "Email address" }).fill(user.email);
      await blocked.getByRole("textbox", { name: "Password" }).fill(user.password);
      await blocked.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(blocked.getByText(BANNED)).toBeVisible();
      await fresh.close();

      await row.getByRole("button", { name: `Actions for ${user.email}` }).click();
      await page.getByRole("menuitem", { name: "Unban" }).click();
      await confirmTotp(page, "Unban user", "Unban user");
      await expect(main(page).getByText("No users match.")).toBeVisible();

      await main(page).getByRole("combobox", { name: "Status", exact: true }).click();
      await page.getByRole("option", { name: "Any status", exact: true }).click();
      await expect(row).toContainText("Active");
      await row.getByRole("button", { name: `Actions for ${user.email}` }).click();
      await page.getByRole("menuitem", { name: "Remove…" }).click();
      await confirmTotp(page, "Remove user", "Remove user");
      await expect(toasts(page).getByText(`Removed ${user.email}`)).toBeVisible();
      await expect(row).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}
