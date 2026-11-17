import { expect, test } from "vitest";

import { APP, metis, status, waitReady } from "../clients/hosts";
import { releases } from "../lib/releases";
import { output } from "./support/output";

export default function selfUpdateTests() {
  const r = releases();

  test("self-update replaces the CLI with the newest one, restarts the updater and applies the new CLI's catalog", async () => {
    expect(output(await metis("cli-host", ["version"]))).toContain(r.cli);

    const updated = await metis("cli-host", ["self-update", "--yes"]);
    expect(updated.code, output(updated)).toBe(0);
    expect(output(updated)).toContain(
      `Metis CLI ${r.cliNext} is installed at /usr/local/bin/metis`,
    );
    const applied = output(updated).split("The new CLI may define the containers differently.")[1];
    expect(applied, "self-update went on to metis apply").toBeDefined();
    expect(applied).toMatch(/Everything matches metis\.json|Applied/);

    expect(output(await metis("cli-host", ["version"]))).toContain(r.cliNext);
    await waitReady(APP);
    const updater = (await status("cli-host")).containers.find((c) => c.name === "metis-updater");
    expect(updater?.state).toBe("running");

    const again = await metis("cli-host", ["self-update", "--yes"]);
    expect(output(again)).toContain(`Metis CLI ${r.cliNext} is the newest`);
  });
}
