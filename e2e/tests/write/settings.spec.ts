import { env } from "@metis/e2e/lib/env";
import type { Page } from "@playwright/test";

import { withTotp } from "../../clients/totp";
import { enterCode, signIn } from "../auth";
import { expect, test, uniqueName } from "../fixtures";
import { type Account, APP, calendarPath, harness, SIGNED_OUT, workspacePath } from "../harness";
import { enrollTotp, ensureSecondUser, secondUserContext, totpFor } from "../second-user";

function accountCard(page: Page, email: string) {
  return page
    .getByRole("main")
    .locator('div:has(> button[aria-label$=" calendars"])')
    .filter({ has: page.getByText(email, { exact: true }) })
    .locator("..");
}

function securitySection(page: Page, heading: string) {
  return page
    .getByRole("main")
    .locator("section")
    .filter({ has: page.getByRole("heading", { level: 2, name: heading }) });
}

async function setWorkspaceCalendar(page: Page, account: Account, calendar: string, on: boolean) {
  await page.goto(workspacePath(account, "/settings/calendars"));
  const card = accountCard(page, account.email);
  await card.getByRole("button", { name: "Show calendars" }).click();
  const toggle = card.getByRole("switch", {
    name: `Show ${calendar} in this workspace`,
  });
  await expect(toggle).toHaveAttribute("aria-checked", String(!on));
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", String(on));
  const save = card.getByRole("button", { name: "Save", exact: true });
  const saved = page.waitForResponse("**/rpc/workspaceCalendars/setVisibility");
  await save.click();
  expect((await saved).ok()).toBe(true);
  await expect(save).toBeDisabled();
}

export default function settingsSpecs() {
  test("hiding a calendar in this workspace hides it from the calendar view, and showing it brings it back", async ({
    page,
    account,
  }) => {
    const sidebar = page.getByRole("complementary", { name: "Calendars" });
    await setWorkspaceCalendar(page, account, "Bulk", false);
    try {
      await page.goto(calendarPath(account));
      await expect(sidebar.getByRole("checkbox", { name: "Show Work" })).toBeVisible();
      await expect(sidebar.getByRole("checkbox", { name: "Show Bulk" })).toHaveCount(0);
    } finally {
      await setWorkspaceCalendar(page, account, "Bulk", true);
    }
    await page.goto(calendarPath(account));
    await expect(sidebar.getByRole("checkbox", { name: "Show Bulk" })).toBeVisible();
  });

  test("create a workspace, switch with Alt+number, change the theme and restore it", async ({
    page,
    rpc,
    account,
  }, testInfo) => {
    const name = uniqueName(testInfo);
    const main = page.getByRole("main");
    await page.goto(workspacePath(account, "/settings/general"));
    await page
      .getByRole("navigation", { name: "App navigation" })
      .getByRole("button", { name: "New workspace", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Create a workspace" });
    await dialog.getByRole("textbox", { name: "Name" }).fill(name);
    await dialog.getByRole("button", { name: "Create workspace", exact: true }).click();
    await expect(dialog).toBeHidden();
    let created: { slug: string; name: string } | undefined;
    await expect
      .poll(async () => {
        created = (
          await rpc<{ workspaces: { slug: string; name: string }[] }>("workspaces.list")
        ).workspaces.find((w) => w.name === name);
        return created;
      })
      .toBeDefined();
    try {
      await page.goto(workspacePath(account, "/settings/general"));
      await expect(
        page
          .getByRole("navigation", { name: "App navigation" })
          .getByRole("link", { name: `Switch to ${name}`, exact: true }),
      ).toBeVisible();
      await main.getByRole("heading", { level: 1, name: "General" }).click();
      await page.keyboard.press("Alt+2");
      await expect(page).toHaveURL(new RegExp(`/w/${created?.slug}/`));
      await page.keyboard.press("Alt+1");
      await expect(page).toHaveURL(new RegExp(`/w/${account.workspaceSlug}/`));

      await page.goto(workspacePath(account, "/settings/general"));
      const blue = main.getByRole("button", { name: "Blue", exact: true });
      const violet = main.getByRole("button", { name: "Violet", exact: true });
      await expect(blue).toHaveAttribute("aria-pressed", "true");
      const html = page.locator("html");
      const blueBrand = await html.getAttribute("data-brand");
      expect(blueBrand).toBeTruthy();
      const brandSaved = () => page.waitForResponse("**/rpc/workspaceThemes/select");
      const toViolet = brandSaved();
      await violet.click();
      expect((await toViolet).ok()).toBe(true);
      await expect(violet).toHaveAttribute("aria-pressed", "true");
      await expect(blue).toHaveAttribute("aria-pressed", "false");
      await expect(html).not.toHaveAttribute("data-brand", blueBrand ?? "");
      await page.reload();
      await expect(violet).toHaveAttribute("aria-pressed", "true");
      await page.goto("/settings/account");
      await expect(html).not.toHaveAttribute("data-brand", /.+/);
      await page.goto(workspacePath(account, "/settings/general"));
      const toBlue = brandSaved();
      await blue.click();
      await expect(blue).toHaveAttribute("aria-pressed", "true");
      expect((await toBlue).ok()).toBe(true);
    } finally {
      await withTotp((code) =>
        rpc("workspaces.delete", {
          workspaceSlug: created?.slug,
          code,
        }),
      );
    }
  });

  test("a custom theme is built, used, edited and deleted from the workspace settings", async ({
    page,
    rpc,
    account,
  }, testInfo) => {
    const name = uniqueName(testInfo);
    const renamed = `${name} renamed`;
    const main = page.getByRole("main");
    const html = page.locator("html");
    await page.goto(workspacePath(account, "/settings/general"));
    const blue = main.getByRole("button", { name: "Blue", exact: true });
    await expect(blue).toHaveAttribute("aria-pressed", "true");
    const blueBrand = await html.getAttribute("data-brand");
    try {
      await main.getByRole("button", { name: "Create theme", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Create a theme" });
      await dialog.getByRole("textbox", { name: "Name" }).fill(name);
      await dialog.getByLabel("Accent color").fill("#0d9488");
      await dialog.getByRole("radio", { name: "Strong" }).click();
      const created = page.waitForResponse("**/rpc/workspaceThemes/save");
      await dialog.getByRole("button", { name: "Create and use", exact: true }).click();
      expect((await created).ok()).toBe(true);
      await expect(dialog).toBeHidden();

      const custom = main.getByRole("button", { name, exact: true });
      await expect(custom).toHaveAttribute("aria-pressed", "true");
      await expect(blue).toHaveAttribute("aria-pressed", "false");
      await expect(html).not.toHaveAttribute("data-brand", blueBrand ?? "");
      await expect(main.getByRole("heading", { level: 4, name: "Custom" })).toBeVisible();

      await main.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
      const edit = page.getByRole("dialog", { name: `Edit ${name}` });
      await edit.getByRole("textbox", { name: "Name" }).fill(renamed);
      await edit.getByRole("button", { name: "Advanced: set each color" }).click();
      const accentField = edit.getByRole("textbox", { name: "Light Accent", exact: true });
      await accentField.fill("not a color");
      await expect(
        edit.getByText("Use a color like #1a2b3c or rgba(26, 43, 60, 0.5)."),
      ).toBeVisible();
      await expect(edit.getByRole("button", { name: "Save theme" })).toBeDisabled();
      await accentField.fill("#115e59");
      const saved = page.waitForResponse("**/rpc/workspaceThemes/save");
      await edit.getByRole("button", { name: "Save theme" }).click();
      expect((await saved).ok()).toBe(true);
      await expect(edit).toBeHidden();
      await page.reload();
      await expect(main.getByRole("button", { name: renamed, exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      await main.getByRole("button", { name: `Delete ${renamed}`, exact: true }).click();
      const confirm = page.getByRole("alertdialog", { name: `Delete ${renamed}?` });
      await expect(confirm).toContainText("switches to Graphite");
      await confirm.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(confirm).toBeHidden();
      await expect(main.getByRole("button", { name: renamed, exact: true })).toHaveCount(0);
      await expect(main.getByRole("button", { name: "Graphite", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    } finally {
      const { themes } = await rpc<{ themes: { id: string; name: string; source: string }[] }>(
        "workspaceThemes.list",
        { workspaceSlug: account.workspaceSlug },
      );
      for (const theme of themes.filter(
        (t) => t.source === "workspace" && t.name.startsWith(name),
      )) {
        await rpc("workspaceThemes.delete", {
          workspaceSlug: account.workspaceSlug,
          themeId: theme.id,
        });
      }
      const blueTheme = themes.find((t) => t.source === "system" && t.name === "Blue");
      if (blueTheme) {
        await rpc("workspaceThemes.select", {
          workspaceSlug: account.workspaceSlug,
          themeId: blueTheme.id,
        });
      }
    }
  });

  test("turning a mailbox's AI back on asks for TOTP", async ({ page, account }) => {
    await page.goto(workspacePath(account, "/settings/mailboxes"));
    const main = page.getByRole("main");
    const on = main.getByRole("switch", {
      name: "AI is on for this mailbox here",
      exact: true,
    });
    const off = main.getByRole("switch", {
      name: "AI is off for this mailbox here",
      exact: true,
    });
    await expect(on).toHaveAttribute("aria-checked", "true");
    await on.click();
    await expect(off).toHaveAttribute("aria-checked", "false");
    await off.click();
    const confirm = page.getByRole("alertdialog", {
      name: "Turn AI on for this mailbox here?",
    });
    await expect(confirm).toBeVisible();
    await enterCode(page, await harness.totp());
    await confirm.getByRole("button", { name: "Turn AI on", exact: true }).click();
    await expect(confirm).toBeHidden();
    await expect(on).toHaveAttribute("aria-checked", "true");
  });

  test("regenerating backup codes on the security page shows a fresh set", async ({
    page,
    account,
  }) => {
    const before = await harness.backupCodes();
    await page.goto("/settings/security");
    const section = securitySection(page, "Regenerate backup codes");
    await section.getByRole("textbox", { name: "Account password" }).fill(account.password);
    await section.getByRole("button", { name: "Regenerate", exact: true }).click();
    await expect(section.getByText("Save these backup codes")).toBeVisible();
    const codes = section.getByRole("listitem");
    await expect.poll(() => codes.count()).toBeGreaterThanOrEqual(8);
    const shown = await codes.allInnerTexts();
    for (const code of shown) expect(before).not.toContain(code.trim());
  });

  test("showing the authenticator QR code asks to confirm it's you, opens in a dialog and is gone once closed", async ({
    page,
  }) => {
    await page.goto("/settings/security");
    const section = securitySection(page, "Add another device");
    await section.getByRole("button", { name: "Show QR code", exact: true }).click();
    const confirm = page.getByRole("alertdialog", { name: "Show your authenticator QR code" });
    await expect(confirm).toBeVisible();
    await enterCode(page, await harness.totp());
    await confirm.getByRole("button", { name: "Show QR code", exact: true }).click();
    const shown = page.getByRole("dialog", { name: "Scan with your other device" });
    await expect(
      shown.getByRole("img", { name: "QR code for your authenticator app" }),
    ).toBeVisible();
    await shown.getByRole("button", { name: "Done", exact: true }).click();
    await expect(shown).toBeHidden();
    await expect(page.getByRole("img", { name: "QR code for your authenticator app" })).toHaveCount(
      0,
    );
  });

  test("turning sign-in alerts off survives a reload and shows in security activity", async ({
    page,
    rpc,
  }) => {
    await page.goto("/settings/security");
    const toggle = page.getByRole("main").getByRole("switch", {
      name: "Email me when someone signs in",
    });
    await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    try {
      const saved = page.waitForResponse("**/rpc/user/updatePreferences");
      await toggle.click();
      expect((await saved).ok()).toBe(true);
      await page.reload();
      await expect(toggle).toBeEnabled();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await expect(
        page
          .getByRole("list", { name: "Audit events" })
          .getByRole("listitem")
          .filter({ hasText: "turned off sign-in alerts" })
          .first(),
      ).toBeVisible();
    } finally {
      await rpc("user.updatePreferences", { signInAlerts: true });
    }
    await page.reload();
    await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  test("detach and delete a calendar the test connected itself", async ({ page, rpc, account }) => {
    const email = `${env.caldavStress.user}@demo.trymetis.email`;
    await rpc("connections.createCredential", {
      email,
      credentials: {
        provider: "caldav",
        server: env.servers.caldav,
        user: env.caldavStress.user,
        pass: env.caldavStress.pass,
      },
      attachToWorkspaceSlug: account.workspaceSlug,
    });

    await page.goto(workspacePath(account, "/settings/calendars"));
    const card = accountCard(page, email);
    await card.getByRole("button", { name: "Remove", exact: true }).click();
    await page
      .getByRole("alertdialog", {
        name: `Remove ${email} from this workspace?`,
      })
      .getByRole("button", { name: "Remove", exact: true })
      .click();
    await expect(card).toHaveCount(0);
    await expect(accountCard(page, account.email)).toBeVisible();

    await page.goto("/settings/calendars");
    const main = page.getByRole("main");
    await main.getByRole("button", { name: `Delete calendar for ${email}` }).click();
    await page
      .getByRole("alertdialog", { name: `Remove the calendar for ${email}?` })
      .getByRole("button", { name: "Remove calendar", exact: true })
      .click();
    await expect(main.getByRole("button", { name: `Delete calendar for ${email}` })).toHaveCount(0);
    await expect(
      main.getByRole("button", {
        name: `Delete calendar for ${account.email}`,
      }),
    ).toBeVisible();
  });

  test("a member changes their password, loses access when they disable 2FA, re-enrolls and deletes their account", async ({
    browser,
    rpc,
  }) => {
    const user = await ensureSecondUser(browser, rpc);
    const second = await secondUserContext(browser);
    let page = second.page;
    const newPassword = `${user.password}-changed`;
    try {
      await page.goto("/settings/security");
      const change = securitySection(page, "Change password");
      await change.getByRole("textbox", { name: "Current password" }).fill(user.password);
      await change.getByRole("textbox", { name: "New password" }).fill(newPassword);
      await change.getByRole("button", { name: "Change password", exact: true }).click();
      const confirm = page.getByRole("dialog", {
        name: "Confirm password change",
      });
      await enterCode(page, totpFor(user));
      await confirm.getByRole("button", { name: "Verify", exact: true }).click();
      await expect(confirm).toBeHidden();

      const fresh = await browser.newContext({
        baseURL: APP,
        storageState: SIGNED_OUT,
        timezoneId: "UTC",
      });
      const signedIn = await fresh.newPage();
      await signIn(signedIn, { email: user.email, password: newPassword }, async () =>
        totpFor(user),
      );
      await second.context.close();
      second.context = fresh;
      second.page = signedIn;
      page = signedIn;

      await page.goto("/settings/security");
      const disable = securitySection(page, "Disable two-factor authentication");
      await disable.getByRole("textbox", { name: "Account password" }).fill(newPassword);
      await disable.getByRole("button", { name: "Disable 2FA", exact: true }).click();
      const turnOff = page.getByRole("alertdialog", { name: "Disable two-factor auth?" });
      await enterCode(page, totpFor(user));
      await turnOff.getByRole("button", { name: "Disable 2FA", exact: true }).click();
      await page.waitForURL(/\/2fa\/setup/);
      await page.goto("/settings/account");
      await expect(page).toHaveURL(/\/2fa\/setup/);

      const secret = await enrollTotp(page, newPassword);
      const reenrolled = { ...user, secret };
      await page.goto("/settings/security");
      const remove = securitySection(page, "Delete account");
      await remove
        .getByRole("textbox", { name: `Type “${user.email}” to confirm` })
        .fill(user.email);
      await remove.getByRole("button", { name: "Delete account", exact: true }).click();
      await page
        .getByRole("alertdialog", { name: "Delete your account?" })
        .getByRole("button", { name: "Continue", exact: true })
        .click();
      const code = page.getByRole("alertdialog", { name: "Confirm it’s you" });
      await enterCode(page, totpFor(reenrolled));
      await code.getByRole("button", { name: "Delete account", exact: true }).click();
      await page.waitForURL(`${APP}/`);

      const gone = await browser.newContext({
        baseURL: APP,
        storageState: SIGNED_OUT,
      });
      const gonePage = await gone.newPage();
      await gonePage.goto("/");
      const signInForm = gonePage.getByRole("main");
      await signInForm.getByRole("textbox", { name: "Email address" }).fill(user.email);
      await signInForm.getByRole("textbox", { name: "Password" }).fill(newPassword);
      const refused = gonePage.waitForResponse("**/api/auth/sign-in/email");
      await signInForm.getByRole("button", { name: "Sign in", exact: true }).click();
      expect((await refused).ok()).toBe(false);
      await expect(signInForm.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
      await expect(gonePage).toHaveURL(`${APP}/`);
      await gone.close();
    } finally {
      await second.context.close();
    }
  });
}
