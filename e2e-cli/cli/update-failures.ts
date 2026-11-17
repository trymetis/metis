import { expect, test } from "vitest";

import { APP, docker, metis, waitReady } from "../clients/hosts";
import { settled } from "../clients/updates";
import { releases } from "../lib/releases";
import { output } from "./support/output";
import { anaRpc, forgetSession } from "./support/session";

export default function updateFailureTests() {
  const r = releases();

  test("an update whose preflight fails restores the snapshot and keeps the running release", async () => {
    const result = await metis("cli-host", ["update", r.preflightFails]);
    expect(result.code).not.toBe(0);
    expect(output(result)).toContain("preflight failed");
    await waitReady(APP);

    forgetSession();
    const updates = await settled(await anaRpc());
    expect(updates.currentVersion).toBe(r.current);
    expect(updates.upgrade).toMatchObject({
      toVersion: r.preflightFails,
      state: "failed",
      restored: true,
    });
    const env = await docker("cli-host", ["inspect", "-f", "{{.Config.Env}}", "metis-app"]);
    expect(env.stdout).not.toContain("METIS_MAINTENANCE");
  });
}
