import { env } from "@metis/e2e/lib/env";
import type { Page } from "@playwright/test";

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

  test("create a workspace, switch with Alt+number, change the brand and restore it", async ({
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
      const brandSaved = () => page.waitForResponse("**/rpc/workspaces/setThemeBrand");
      const toViolet = brandSaved();
      await violet.click();
      await expect(violet).toHaveAttribute("aria-pressed", "true");
      await expect(blue).toHaveAttribute("aria-pressed", "false");
      expect((await toViolet).ok()).toBe(true);
      await page.reload();
      await expect(violet).toHaveAttribute("aria-pressed", "true");
      const toBlue = brandSaved();
      await blue.click();
      await expect(blue).toHaveAttribute("aria-pressed", "true");
      expect((await toBlue).ok()).toBe(true);
    } finally {
      await rpc("workspaces.delete", {
        workspaceSlug: created?.slug,
        code: await harness.totp(),
      });
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
          .filter({ hasText: "Sign-in alerts turned off" })
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
      await page
        .getByRole("alertdialog", { name: "Disable two-factor auth?" })
        .getByRole("button", { name: "Disable 2FA", exact: true })
        .click();
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
      const code = page.getByRole("alertdialog", {
        name: "Enter your authenticator code",
      });
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
