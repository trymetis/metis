import type { BrowserContext, Page } from "@playwright/test";
import * as OTPAuth from "otpauth";

import { enterCode } from "../auth";
import { expect, test } from "../fixtures";
import { APP, SIGNED_OUT } from "../harness";
import { inviteToSignUp, signUpByInvite } from "../second-user";

const PASSKEY_NAME = "Passkey";

async function addVirtualAuthenticator(context: BrowserContext, page: Page): Promise<void> {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

function section(page: Page, heading: string) {
  return page
    .getByRole("main")
    .locator("section")
    .filter({ has: page.getByRole("heading", { level: 2, name: heading }) });
}

export default function passkeySpecs() {
  test("a member sets up two-factor with a passkey, adds an authenticator, confirms with either, and removes the passkey", async ({
    browser,
    rpc,
  }) => {
    const id = Date.now().toString(36);
    const user = {
      name: `Pat Passkey ${id}`,
      email: `pat-${id}@demo.trymetis.email`,
      password: `pat-passkey-password-${id}`,
    };
    const newPassword = `${user.password}-changed`;
    const context = await browser.newContext({
      baseURL: APP,
      storageState: SIGNED_OUT,
      timezoneId: "UTC",
    });
    const page = await context.newPage();
    try {
      await addVirtualAuthenticator(context, page);
      await signUpByInvite(page, await inviteToSignUp(rpc, user.email), user);
      const main = page.getByRole("main");

      await test.step("setup starts with a passkey and shows backup codes", async () => {
        await main.getByPlaceholder("Your password").fill(user.password);
        await main.getByRole("button", { name: "Set up a passkey instead", exact: true }).click();
        await expect(main.getByText("Save these backup codes")).toBeVisible();
        await expect(page).toHaveURL(/\/2fa\/setup/);
        await main.getByRole("button", { name: "I've saved my backup codes, continue" }).click();
        await page.waitForURL((url) => !url.pathname.startsWith("/2fa"));
      });

      await test.step("signing in again finishes with the passkey", async () => {
        await context.clearCookies();
        await page.goto("/");
        await main.getByRole("textbox", { name: "Email address" }).fill(user.email);
        await main.getByRole("textbox", { name: "Password" }).fill(user.password);
        await main.getByRole("button", { name: "Sign in", exact: true }).click();
        await page.waitForURL(/\/2fa\/verify/);
        await expect(main.getByText("Use the passkey you added to this account.")).toBeVisible();
        await expect(
          main.getByRole("button", { name: "Use your authenticator instead", exact: true }),
        ).toHaveCount(0);
        await main.getByRole("button", { name: "Use your passkey", exact: true }).click();
        await page.waitForURL(/\/w\//);
      });

      let secret = "";
      const totp = () => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) }).generate();

      await test.step("an authenticator app is added after confirming with the account password", async () => {
        await page.goto("/settings/security");
        const authenticator = section(page, "Authenticator app");
        await authenticator
          .getByRole("button", { name: "Set up an authenticator", exact: true })
          .click();
        const confirm = page.getByRole("alertdialog", { name: "Set up an authenticator app" });
        await expect(confirm.getByRole("button", { name: "Use your passkey" })).toHaveCount(0);
        await confirm.getByRole("textbox", { name: "Account password" }).fill(user.password);
        await confirm.getByRole("button", { name: "Continue", exact: true }).click();
        const scan = page.getByRole("dialog", { name: "Scan the QR code" });
        await scan.getByText("Can't scan? Show manual key").click();
        secret = (await scan.getByRole("code").innerText()).replace(/\s+/g, "");
        await enterCode(page, totp());
        await scan.getByRole("button", { name: "Verify and add", exact: true }).click();
        await expect(scan).toBeHidden();
        await expect(
          authenticator.getByRole("button", { name: "Remove authenticator", exact: true }),
        ).toBeVisible();
        await expect(
          section(page, "Ask me first with").getByRole("combobox", {
            name: "Ask me first with",
          }),
        ).toContainText("Passkey");
      });

      await test.step("a password change is confirmed with the passkey", async () => {
        const change = section(page, "Change password");
        await change.getByRole("textbox", { name: "Current password" }).fill(user.password);
        await change.getByRole("textbox", { name: "New password" }).fill(newPassword);
        await change.getByRole("button", { name: "Change password", exact: true }).click();
        const confirm = page.getByRole("dialog", { name: "Confirm password change" });
        await confirm.getByRole("button", { name: "Use your passkey", exact: true }).click();
        await expect(confirm.getByText("Passkey confirmed")).toBeVisible();
        await confirm.getByRole("button", { name: "Verify", exact: true }).click();
        await expect(confirm).toBeHidden();
        await expect(
          change.getByText("Password changed. Other sessions were signed out."),
        ).toBeVisible();
      });

      await test.step("the passkey is removed with an authenticator code; the authenticator can't follow", async () => {
        const passkeys = section(page, "Passkeys");
        await passkeys.getByRole("button", { name: `Remove ${PASSKEY_NAME}`, exact: true }).click();
        const dialog = page.getByRole("alertdialog", { name: `Remove ${PASSKEY_NAME}?` });
        await dialog
          .getByRole("button", { name: "Use your authenticator instead", exact: true })
          .click();
        await enterCode(page, totp());
        await dialog.getByRole("button", { name: "Remove passkey", exact: true }).click();
        await expect(dialog).toBeHidden();
        await expect(passkeys.getByRole("list", { name: "Passkeys" })).toHaveCount(0);
        await expect(section(page, "Ask me first with")).toHaveCount(0);
        const authenticator = section(page, "Authenticator app");
        await expect(
          authenticator.getByRole("button", { name: "Remove authenticator", exact: true }),
        ).toBeDisabled();
        await expect(
          authenticator.getByText(
            "Add a passkey first. You need at least one way to confirm it’s you.",
          ),
        ).toBeVisible();
      });

      await test.step("security activity lists each change", async () => {
        await page.reload();
        const events = page.getByRole("list", { name: "Audit events" }).getByRole("listitem");
        for (const sentence of [
          `added the passkey \u201c${PASSKEY_NAME}\u201d`,
          "added an authenticator app",
          `removed the passkey \u201c${PASSKEY_NAME}\u201d`,
        ]) {
          await expect(events.filter({ hasText: sentence }).first()).toBeVisible();
        }
      });

      await test.step("turning two-factor off sends the member back to setup", async () => {
        const disable = section(page, "Disable two-factor authentication");
        await disable.getByRole("textbox", { name: "Account password" }).fill(newPassword);
        await disable.getByRole("button", { name: "Disable 2FA", exact: true }).click();
        const turnOff = page.getByRole("alertdialog", { name: "Disable two-factor auth?" });
        await enterCode(page, totp());
        await turnOff.getByRole("button", { name: "Disable 2FA", exact: true }).click();
        await page.waitForURL(/\/2fa\/setup/);
      });
    } finally {
      await context.close();
    }
  });
}
