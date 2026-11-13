import { SEEDED_EXPORTS } from "@metis/e2e/lib/exports";

import { expect, test } from "../fixtures";

test("the owner sees each export and where it went, with no controls", async ({ page }) => {
  await page.goto("/dashboard/system/exports");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: "Exports" })).toBeVisible();

  const rows = main.getByRole("row");
  for (const entry of SEEDED_EXPORTS) {
    const row = rows.filter({ hasText: entry.fileName });
    await expect(row).toContainText(entry.appVersion);
    for (const location of entry.locations) await expect(row).toContainText(location.location);
  }
  const newest = rows.filter({ hasText: "metis-export-20261111T100000Z.tar" });
  await expect(newest).toContainText("In S3");
  await expect(newest).toContainText("On a computer");
  await expect(newest).toContainText("Host owner-laptop");
  await expect(newest).toContainText("a1b2c3d4e5f60718293a4b5c6d7e8f90 (passphrase)");
  await expect(rows.filter({ hasText: "metis-export-20261110T090000Z.tar" })).toContainText(
    "On the server",
  );
  await expect(main).toContainText("Metis does not check that a file is still there");
  await expect(main.getByRole("button")).toHaveCount(0);
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "Exports", exact: true }),
  ).toBeVisible();
});
