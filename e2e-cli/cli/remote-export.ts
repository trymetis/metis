import { beforeAll, expect, test } from "vitest";

import { fresh, metis, readFile, shell } from "../clients/hosts";
import { releases } from "../lib/releases";
import { IDENTITY } from "./export";
import { DEPLOYMENT_ENV } from "./move";
import { external, fingerprint } from "./support/database";
import { output } from "./support/output";
import { installCliOnly } from "./support/remote";

const OUT = "/root/remote-export";
const LOADED_ENV = "/root/loaded.env";

export default function remoteExportTests() {
  const r = releases();
  const archive = { path: "" };

  beforeAll(async () => {
    await fresh("cli-host");
    await installCliOnly();
    await shell("cli-host", `rm -rf ${OUT} ${LOADED_ENV}`, { check: true });
  });

  test("db export --env-file exports a deployment's outside databases from a machine with no install", async () => {
    const exported = await metis("cli-host", [
      "db",
      "export",
      "--env-file",
      DEPLOYMENT_ENV,
      "--recipient",
      "/root/stack.pub",
      "--out",
      OUT,
      "--force",
      "--app-version",
      r.current,
    ]);
    expect(exported.code, output(exported)).toBe(0);
    expect(output(exported)).toContain(`from Metis ${r.current}`);
    expect(output(exported)).toContain(
      "The app stays in maintenance until you remove METIS_MAINTENANCE and redeploy.",
    );
    const listed = await shell("cli-host", `ls ${OUT}`, { check: true });
    const name = listed.stdout.trim();
    expect(name).toMatch(/^metis-export-\d{8}T\d{6}Z\.tar$/);
    archive.path = `${OUT}/${name}`;
  });

  test("db load loads that archive into two empty databases with every row and sequence", async () => {
    const app = external("load-app");
    const mastra = external("load-mastra");
    const loaded = await metis("cli-host", [
      "db",
      "load",
      archive.path,
      "--identity",
      IDENTITY,
      "--database-url",
      app.url,
      "--database-token",
      app.token,
      "--mastra-url",
      mastra.url,
      "--mastra-token",
      mastra.token,
      "--write-env",
      LOADED_ENV,
    ]);
    expect(loaded.code, output(loaded)).toBe(0);
    expect(output(loaded)).toContain("Loaded both databases");
    expect(output(loaded)).toContain(
      `Run the preflight of Metis ${r.current} or newer with this environment, then deploy it.`,
    );
    const written = await readFile("cli-host", LOADED_ENV);
    expect(written).toContain(`DATABASE_URL=${app.url}`);
    expect(written).toContain(`MASTRA_DATABASE_URL=${mastra.url}`);

    const sourceApp = await fingerprint(external("two-app"));
    expect(Number(sourceApp.rows.user)).toBeGreaterThan(0);
    expect(await fingerprint(app)).toEqual(sourceApp);
    const sourceMastra = await fingerprint(external("two-mastra"));
    expect(Object.keys(sourceMastra.rows).length).toBeGreaterThan(0);
    expect(await fingerprint(mastra)).toEqual(sourceMastra);
  });
}
