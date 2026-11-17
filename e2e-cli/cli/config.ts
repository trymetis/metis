import { sectionForm } from "@metis/e2e/api/support/config";
import { expect, test } from "vitest";

import { APP, envValue, metis, waitReady } from "../clients/hosts";
import {
  callsGetMaintenanceJson,
  healthChecksAnswer,
  inMaintenance,
  pagesShowMaintenance,
} from "./support/maintenance";
import { output } from "./support/output";
import { anaRpc, forgetSession } from "./support/session";

const MAINTENANCE_SINCE = "2026-01-01T09:30:00Z";

async function relayValues(): Promise<string[]> {
  const form = await sectionForm(await anaRpc(), "relay");
  return Object.values(form.values).map(String);
}

async function config(args: string[]): Promise<string> {
  const run = await metis("cli-host", ["config", ...args, "--yes"]);
  expect(run.code, output(run)).toBe(0);
  return output(run);
}

export default function configTests() {
  test("config set stores a dashboard setting in .env and forces it into the running app", async () => {
    expect(await relayValues()).toContain("32");
    expect(await config(["set", "METIS_DRIVE_RELAY_MAX_MB=64"])).toContain("Stored in");
    expect(await envValue("cli-host", "METIS_DRIVE_RELAY_MAX_MB")).toBe("64");
    await waitReady(APP);
    forgetSession();
    expect(await relayValues()).toContain("64");

    await config(["set", "METIS_DRIVE_RELAY_MAX_MB=32"]);
    await waitReady(APP);
    forgetSession();
    expect(await relayValues()).toContain("32");
  });

  test("config unset removes a boot setting from .env", async () => {
    await config(["set", "METIS_E2E_MARKER=on"]);
    expect(await envValue("cli-host", "METIS_E2E_MARKER")).toBe("on");
    await config(["unset", "METIS_E2E_MARKER"]);
    expect(await envValue("cli-host", "METIS_E2E_MARKER")).toBeUndefined();
    await waitReady(APP);
  });

  test("config set METIS_MAINTENANCE warns, freezes the app the way an operator does, and unset takes it out", async () => {
    try {
      const said = await config(["set", `METIS_MAINTENANCE=${MAINTENANCE_SINCE}`]);
      expect(said).toContain(
        "METIS_MAINTENANCE goes into .env, so the app stays in maintenance through every metis update, undo and apply until sudo metis config unset METIS_MAINTENANCE.",
      );
      await expect.poll(() => inMaintenance(APP), { timeout: 120_000 }).toBe(true);
      await pagesShowMaintenance(APP);
      await callsGetMaintenanceJson(APP);
      await healthChecksAnswer(APP);
    } finally {
      await config(["unset", "METIS_MAINTENANCE"]);
    }
    await waitReady(APP);
    expect(await inMaintenance(APP)).toBe(false);
    forgetSession();
  });
}
