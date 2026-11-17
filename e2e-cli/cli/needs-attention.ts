import { expect, test } from "vitest";

import { shell, status } from "../clients/hosts";
import { releases } from "../lib/releases";

async function lastUpgrade(): Promise<string> {
  return JSON.stringify((await status("cli-host")).lastUpgrade ?? null);
}

export default function needsAttentionTests() {
  const r = releases();

  test("an update that never becomes ready and cannot restore its snapshot needs attention", async () => {
    const started = await shell(
      "cli-host",
      `METIS_UPDATER_READY_TIMEOUT=45s setsid nohup metis update ${r.neverReady} > /root/update.log 2>&1 < /dev/null &`,
    );
    expect(started.code).toBe(0);
    await expect
      .poll(lastUpgrade, { timeout: 300_000, interval: 2_000 })
      .toMatch(/UPGRADE_STEP_READY/);
    const removed = await shell("cli-host", "rm -rf /opt/metis-suite/snapshots/pending");
    expect(removed.code).toBe(0);
    await expect
      .poll(lastUpgrade, { timeout: 300_000, interval: 2_000 })
      .toMatch(/UPGRADE_STATE_ROLLBACK_FAILED/);
    const last = await lastUpgrade();
    expect(last).toContain(`restoring ${r.current} also failed`);
    expect(last).toContain("the database snapshot is in");
  });
}
