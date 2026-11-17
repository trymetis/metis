import { signIn } from "@metis/e2e/tests/auth";
import { test as setup } from "@metis/e2e/tests/fixtures";
import { ANA_STATE, harness } from "@metis/e2e/tests/harness";

setup("sign in as Ana", async ({ page, account }) => {
  setup.setTimeout(15 * 60_000);
  await signIn(page, account, () => harness.totp());
  await page.context().storageState({ path: ANA_STATE });
});
