import { enterCode } from "../auth";
import { expect, test } from "../fixtures";
import { drivePath, harness, mailPath } from "../harness";

test.use({ storageState: { cookies: [], origins: [] } });

test("a wrong TOTP code is refused", async ({ page, account }) => {
  await page.goto("/");
  const main = page.getByRole("main");
  await main.getByRole("textbox", { name: "Email address" }).fill(account.email);
  await main.getByRole("textbox", { name: "Password" }).fill(account.password);
  await main.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/2fa\/verify/);
  const valid = await harness.totp();
  await enterCode(page, valid === "000000" ? "111111" : "000000");
  await main.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByText("Invalid code", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/2fa\/verify/);
});

test("a magic-link request for an unknown address answers exactly like one for a known address", async ({
  page,
  account,
}) => {
  const ask = async (email: string) => {
    await page.goto("/");
    const main = page.getByRole("main");
    await main.getByRole("textbox", { name: "Email address" }).fill(email);
    const response = page.waitForResponse(/\/api\/auth\/sign-in\/magic-link/);
    await main.getByRole("button", { name: "Email me a magic link", exact: true }).click();
    const res = await response;
    await expect(main.getByRole("heading", { level: 2, name: "Check your email" })).toBeVisible();
    return {
      status: res.status(),
      body: await res.text(),
      screen: await main.innerText(),
    };
  };
  const known = await ask(account.email);
  const unknown = await ask("nobody-here@demo.trymetis.email");
  expect(unknown.status).toBe(known.status);
  expect(unknown.body).toBe(known.body);
  expect(unknown.screen.replace("nobody-here@demo.trymetis.email", account.email)).toBe(
    known.screen,
  );
});

test("without a session, app pages redirect to sign-in and the API answers 401", async ({
  page,
  request,
  account,
}) => {
  for (const path of [mailPath(account), "/settings/account", drivePath(account, "s3")]) {
    await page.goto(path);
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/(\?.*)?$/);
  }
  const download = await request.get(
    `/api/drive/download?w=${account.workspaceSlug}&d=${account.driveSlugs.s3}&id=welcome.txt`,
    { maxRedirects: 0 },
  );
  expect(download.status()).toBe(401);
  const chat = await request.post("/api/ai/chat", { data: {} });
  expect(chat.status()).toBe(401);
});
