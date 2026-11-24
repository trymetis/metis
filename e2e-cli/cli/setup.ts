import { expect as expectPage, type Page } from "@playwright/test";
import * as OTPAuth from "otpauth";
import { expect, test } from "vitest";

import { APP, envValue, fresh, install, waitReady } from "../clients/hosts";
import { releases } from "../lib/releases";
import { withPage } from "./support/browser";
import { output } from "./support/output";

const OWNER = {
  name: "Odile Owner",
  email: "owner@example.com",
  password: "a-long-setup-password-0001",
};
const MIN_REMAINING_SEC = 5;

function authenticator(secret: string): () => Promise<string> {
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
  const used = { code: "" };
  return async () => {
    for (;;) {
      const remaining = totp.period - (Math.floor(Date.now() / 1000) % totp.period);
      const code = totp.generate();
      if (code !== used.code && remaining >= MIN_REMAINING_SEC) {
        used.code = code;
        return code;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  };
}

async function enterCode(page: Page, code: string): Promise<void> {
  const input = page.locator('input[autocomplete="one-time-code"]');
  await input.click();
  await page.keyboard.type(code);
  await expectPage(input).toHaveValue(code);
}

async function session(page: Page): Promise<string> {
  const res = await page.request.get("/api/auth/get-session");
  return res.text();
}

export default function setupTests() {
  const r = releases();
  const owner = {
    setupCode: "",
    code: (): Promise<string> => Promise.reject(new Error("not enrolled")),
  };

  test("metis setup prints the setup code of a fresh install", async () => {
    await fresh("cli-host");
    const installed = await install(
      "cli-host",
      ["--owner-email", OWNER.email, "--with", "updater", "--version", r.current],
      { METIS_CLI_VERSION: r.cli },
    );
    expect(installed.code, output(installed)).toBe(0);
    await waitReady(APP);
    const printed = /Setup code: (\S+)/.exec(output(installed))?.[1] ?? "";
    expect(printed).not.toBe("");
    expect(printed).toBe(await envValue("cli-host", "METIS_SETUP_CODE"));
    owner.setupCode = printed;
  });

  test("/setup refuses a wrong setup code, then creates the owner, who enrolls 2FA", async () => {
    await withPage(null, async (page) => {
      await page.goto("/setup");
      const main = page.getByRole("main");
      await expectPage(main.getByRole("heading", { name: "Set up Metis Suite" })).toBeVisible();
      await expectPage(main.getByRole("textbox", { name: "Email address" })).toHaveValue(
        OWNER.email,
      );
      await main.getByRole("textbox", { name: "Name" }).fill(OWNER.name);
      await main.getByRole("textbox", { name: "Password" }).fill(OWNER.password);

      await main.getByRole("textbox", { name: "Setup code" }).fill("not-the-setup-code");
      await main.getByRole("button", { name: "Create account" }).click();
      await expectPage(main.locator("form p")).toBeVisible();
      await expectPage(page).toHaveURL(/\/setup$/);

      await main.getByRole("textbox", { name: "Setup code" }).fill(owner.setupCode);
      await main.getByRole("button", { name: "Create account" }).click();
      await page.waitForURL(/\/2fa\/setup/);

      await expectPage(
        main.getByRole("heading", { name: "Set up two-factor authentication" }),
      ).toBeVisible();
      await main.getByPlaceholder("Your password").fill(OWNER.password);
      await main.getByRole("button", { name: "Continue", exact: true }).click();
      await main.getByText("Can't scan? Show manual key").click();
      const secret = (await main.getByRole("code").innerText()).trim();
      expect(secret).toMatch(/^[A-Z2-7]+=*$/);
      owner.code = authenticator(secret);

      await main.getByRole("button", { name: "I've saved my backup codes, continue" }).click();
      await enterCode(page, await owner.code());
      await main.getByRole("button", { name: "Verify and enable" }).click();
      await expectPage(main.getByRole("heading", { name: "Two-factor enabled" })).toBeVisible();
      await page.waitForURL((url) => !url.pathname.startsWith("/2fa"));
      expect(await session(page)).toContain(OWNER.email);
    });
  });

  test("the owner signs in with the password and a code, and /setup is closed", async () => {
    await withPage(null, async (page) => {
      await page.goto("/");
      const main = page.getByRole("main");
      await main.getByRole("textbox", { name: "Email address" }).fill(OWNER.email);
      await main.getByRole("textbox", { name: "Password" }).fill(OWNER.password);
      await main.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForURL(/\/2fa\/verify/);
      await enterCode(page, await owner.code());
      await main.getByRole("button", { name: "Verify", exact: true }).click();
      await page.waitForURL((url) => !url.pathname.startsWith("/2fa") && url.pathname !== "/");
      const signedIn = await session(page);
      expect(signedIn).toContain(OWNER.email);
      expect(signedIn).toContain('"twoFactorEnabled":true');

      await page.goto("/setup");
      await page.waitForURL((url) => !url.pathname.startsWith("/setup"));
    });
  });
}
