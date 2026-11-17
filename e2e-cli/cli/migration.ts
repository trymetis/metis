import { readdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { APP, fresh, install, metis, status, waitReady } from "../clients/hosts";
import { releases, ROOT } from "../lib/releases";
import { installDatabase, query } from "./support/database";
import { output } from "./support/output";

async function applied(): Promise<string[]> {
  const [rows = []] = await query(await installDatabase("app"), [
    "SELECT id FROM schema_migration ORDER BY id",
  ]);
  return rows.map((row) => row[0] ?? "");
}

function treeMigrations(): string[] {
  return readdirSync(join(ROOT, "apps/web/migrations"))
    .filter((name) => /^\d{4}_.+\.ts$/.test(name))
    .map((name) => name.replace(/\.ts$/, ""))
    .toSorted();
}

export default function migrationTests() {
  const r = releases();

  test(`an install of the published ${r.previous} updates to ${r.current}, and preflight applies the migrations between them`, async () => {
    await fresh("cli-host");
    const installed = await install("cli-host", [
      "--owner-email",
      "owner@example.com",
      "--with",
      "updater",
      "--version",
      r.previous,
    ]);
    expect(installed.code, output(installed)).toBe(0);
    await waitReady(APP);
    expect((await status("cli-host")).version).toBe(r.previous);
    const before = await applied();
    expect(before.length).toBeGreaterThan(0);

    const updated = await metis("cli-host", ["update", r.current]);
    expect(updated.code, output(updated)).toBe(0);
    await waitReady(APP);
    expect((await status("cli-host")).version).toBe(r.current);

    const after = await applied();
    const ran = after.filter((id) => !before.includes(id));
    console.log(
      `[cli] preflight of ${r.current} applied ${ran.length === 0 ? "no migration" : ran.join(", ")} on a ${r.previous} database`,
    );
    expect(after).toEqual(treeMigrations());
    expect(ran).toEqual(treeMigrations().filter((id) => !before.includes(id)));
    expect(after).toEqual(expect.arrayContaining(before));
  });
}
