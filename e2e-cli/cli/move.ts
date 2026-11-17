import { harness } from "@metis/e2e/clients/harness";
import { expect as expectPage } from "@playwright/test";
import { expect, test } from "vitest";

import { APP, envValue, INSTALL_DIR, metis, shell, status, waitReady } from "../clients/hosts";
import { updates } from "../clients/updates";
import { env } from "../lib/env";
import { withAnaPage } from "./support/browser";
import { createNamespaces, type Database, external } from "./support/database";
import { output } from "./support/output";
import { anaCookie, anaRpc, forgetSession } from "./support/session";

export const DEPLOYMENT_ENV = "/root/deployment.env";
export const NAMESPACES = [
  "one-app",
  "one-mastra",
  "two-app",
  "two-mastra",
  "load-app",
  "load-mastra",
];

async function move(app: Database, mastra: Database): Promise<string> {
  const run = await metis("cli-host", [
    "db",
    "move",
    "--to",
    app.url,
    "--token",
    app.token,
    "--mastra-url",
    mastra.url,
    "--mastra-token",
    mastra.token,
    "--yes",
  ]);
  expect(run.code, output(run)).toBe(0);
  await waitReady(APP);
  forgetSession();
  expect(await envValue("cli-host", "METIS_DB_DRIVER")).toBe("sqld");
  expect(await envValue("cli-host", "DATABASE_URL")).toBe(app.url);
  expect(await envValue("cli-host", "DATABASE_AUTH_TOKEN")).toBe(app.token);
  expect(await envValue("cli-host", "MASTRA_DATABASE_URL")).toBe(mastra.url);
  return output(run);
}

async function signedInAs(): Promise<string> {
  const res = await fetch(`${APP}/api/auth/get-session`, {
    headers: { cookie: await anaCookie() },
  });
  expect(res.status).toBe(200);
  return res.text();
}

export default function moveTests() {
  test("db move copies the server's databases to an outside sqld and the app runs on it", async () => {
    await createNamespaces(NAMESPACES);
    expect(env.external.databaseToken).not.toBe("");
    const installed = await status("cli-host");
    expect(installed.components.map((c) => c.name)).toEqual(
      expect.arrayContaining(["sqld", "updater"]),
    );

    const said = await move(external("one-app"), external("one-mastra"));
    expect(said).toContain("Copied both databases");
    expect(said).toContain("Metis runs on the new databases");
    expect(said).toContain(
      "sqld keeps the old copy. Once you are sure, remove it with sudo metis remove sqld --purge.",
    );
    expect(await signedInAs()).toContain((await harness.account()).email);
  });

  test("on an outside database the Updates page offers no undo and says to back up first", async () => {
    const state = await updates(await anaRpc());
    expect(state.reachable).toBe(true);
    expect(state.snapshots).toBe(false);
    expect(state.rollbackVersion).toBeNull();

    await withAnaPage(async (page) => {
      await page.goto("/dashboard/system/updates");
      const main = page.getByRole("main");
      const section = (title: string) =>
        main
          .locator("section")
          .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
      await expectPage(section("Running release")).toContainText("Not available");
      await expectPage(section("Running release")).toContainText(
        "The database is not this stack's sqld, so the updater cannot snapshot it and an upgrade cannot be undone. Back up the database before upgrading.",
      );
      await expectPage(
        section("Running release").getByRole("button", { name: "Undo last upgrade" }),
      ).toHaveCount(0);
      await expectPage(section("Releases")).toContainText(
        "Upgrading pulls the release, runs preflight, which migrates the database, then switches the app and waits until it is ready. If a step fails, the updater switches back on its own.",
      );
    });
  });

  test("db move moves again, from one outside sqld to another", async () => {
    const said = await move(external("two-app"), external("two-mastra"));
    expect(said).toContain("Metis runs on the new databases");
    expect(await signedInAs()).toContain((await harness.account()).email);
    await shell("cli-host", `cp ${INSTALL_DIR}/.env ${DEPLOYMENT_ENV}`, { check: true });
  });
}
