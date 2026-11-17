import { harness } from "@metis/e2e/clients/harness";
import { signIn } from "@metis/e2e/clients/sign-in";
import { expect, test } from "vitest";

import { APP, install, status, waitReady } from "../clients/hosts";
import { releases } from "../lib/releases";
import { ARCHIVE, IDENTITY } from "./export";
import { output } from "./support/output";

export default function restoreTests() {
  const r = releases();

  test("setup --from-export restores the stack's archive onto the wiped server, and the owner signs in again", async () => {
    const restored = await install(
      "cli-host",
      ["--from-export", ARCHIVE, "--identity", IDENTITY, "--version", r.current],
      { METIS_CLI_VERSION: r.cli },
    );
    expect(restored.code, output(restored)).toBe(0);
    await waitReady(APP);
    expect((await status("cli-host")).version).toBe(r.current);

    const account = await harness.account();
    const cookie = await signIn(account.email, account.password, () => harness.totp());
    const res = await fetch(`${APP}/api/auth/get-session`, { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(account.email);
  });
}
