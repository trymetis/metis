import { expect, test } from "../fixtures";
import { APP, harness, mailPath, SIGNED_OUT } from "../harness";
import {
  enrollTotp,
  inviteToSignUp,
  newSecondUser,
  rememberSecondUser,
  SECOND_STATE,
  signUpByInvite,
} from "../second-user";

export default function accountSpecs() {
  test("signup by invite, the 2FA gate before enrolling, and 2FA enrollment", async ({
    browser,
    rpc,
    account,
  }) => {
    const user = newSecondUser();
    const url = await inviteToSignUp(rpc, user.email);
    expect(url).toContain("/invite/accept");

    const context = await browser.newContext({
      baseURL: APP,
      storageState: SIGNED_OUT,
      timezoneId: "UTC",
    });
    const page = await context.newPage();
    await signUpByInvite(page, url, user);

    await test.step("before enrolling, the session is sent to /2fa/setup and the API answers 403", async () => {
      for (const path of [mailPath(account), "/settings/account", "/w/any-workspace/m"]) {
        await page.goto(path);
        await expect(page).toHaveURL(/\/2fa\/setup/);
      }
      const api = await page.request.get(
        `/api/drive/download?w=${account.workspaceSlug}&d=${account.driveSlugs.s3}&id=welcome.txt`,
        { maxRedirects: 0 },
      );
      expect(api.status()).toBe(403);
    });

    await page.goto("/2fa/setup");
    const secret = await enrollTotp(page, user.password);
    expect(secret).toMatch(/^[A-Z2-7]+=*$/);
    await expect(page).toHaveURL(/\/w\//);
    await context.storageState({ path: SECOND_STATE });
    await context.close();
    rememberSecondUser({ ...user, secret });
  });

  test("sign in with a backup code", async ({ browser, account }) => {
    const [code] = (await harness.backupCodes()).slice(-1);
    const context = await browser.newContext({
      baseURL: APP,
      storageState: SIGNED_OUT,
      timezoneId: "UTC",
    });
    const page = await context.newPage();
    await page.goto("/");
    const main = page.getByRole("main");
    await main.getByRole("textbox", { name: "Email address" }).fill(account.email);
    await main.getByRole("textbox", { name: "Password" }).fill(account.password);
    await main.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(/\/2fa\/verify/);
    await main.getByRole("button", { name: "Use a backup code instead", exact: true }).click();
    await main.getByPlaceholder("abcde-12345").fill(code ?? "");
    await main.getByRole("button", { name: "Verify", exact: true }).click();
    await page.waitForURL(/\/w\//);
    await context.close();
  });
}
