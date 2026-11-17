import { expect, test } from "vitest";

import { INSTALL_DIR, metis, status } from "../clients/hosts";
import { releases } from "../lib/releases";
import { output } from "./support/output";

export default function statusTests() {
  const r = releases();

  test("the stack install runs the pinned release with every component healthy", async () => {
    const installed = await status("cli-host");
    expect(installed.version).toBe(r.current);
    expect(installed.components.map((c) => c.name)).toEqual(
      expect.arrayContaining(["sqld", "updater", "redis", "worker"]),
    );
    for (const component of installed.components) {
      expect(component.healthy, component.name).toBe(true);
    }
    for (const container of installed.containers) {
      expect(container.state, container.name).toBe("running");
    }
    expect(installed.containers.map((c) => c.name)).toEqual(
      expect.arrayContaining(["metis-app", "metis-sqld", "metis-updater", "metis-redis"]),
    );
  });

  test("the CLI is the version bootstrap pinned", async () => {
    const run = await metis("cli-host", ["version"]);
    expect(run.code, output(run)).toBe(0);
    expect(output(run)).toContain(r.cli);
  });

  test("a second setup on the same server is refused", async () => {
    const run = await metis("cli-host", ["setup", "--yes", "--owner-email", "owner@example.com"]);
    expect(run.code).not.toBe(0);
    expect(output(run)).toContain(`Metis is already installed in ${INSTALL_DIR}`);
  });
}
