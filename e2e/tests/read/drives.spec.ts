import { BRIEF, CLIENTS, CLIENTS_FOLDER, REBRAND_FOLDER } from "@metis/e2e/lib/cast";

import { driveSidebar, entry, files, folderPath, openPreview } from "../drive";
import { expect, test } from "../fixtures";
import { drivePath } from "../harness";

const UNRESTRICTED = ["s3", "s3Relay", "webdav", "ftps", "ftpsImplicit", "sftp"];

test("every drive lists the seeded files", async ({ page, account }) => {
  for (const kind of UNRESTRICTED) {
    await page.goto(drivePath(account, kind));
    for (const name of ["Clients", "Finance", "Team", "welcome.txt"]) {
      await expect(entry(page, name), `${kind}: ${name}`).toBeVisible();
    }
    const edge = entry(page, "edge");
    if (kind.startsWith("s3")) await expect(edge, kind).toBeVisible();
    else await expect(edge, kind).toHaveCount(0);
  }
});

test("the Rebrand pins show on the S3 and WebDAV drives only", async ({ page, account }) => {
  for (const kind of ["s3", "webdav"]) {
    await page.goto(drivePath(account, kind));
    await expect(
      driveSidebar(page).getByRole("button", { name: "Rebrand", exact: true }),
    ).toBeVisible();
  }
  await page.goto(drivePath(account, "sftp"));
  await expect(entry(page, "welcome.txt")).toBeVisible();
  await expect(
    driveSidebar(page).getByRole("button", { name: "Rebrand", exact: true }),
  ).toHaveCount(0);
});

test("the FTP drive's root restriction shows only Clients/ and refuses a direct link to a hidden file", async ({
  page,
  account,
}) => {
  await page.goto(drivePath(account, "ftp"));
  await expect(entry(page, "Clients")).toBeVisible();
  for (const name of ["edge", "Finance", "Team", "welcome.txt"])
    await expect(entry(page, name)).toHaveCount(0);

  const hidden = await page.request.get(
    `/api/drive/download?w=${account.workspaceSlug}&d=${account.driveSlugs.ftp}&id=welcome.txt`,
    { maxRedirects: 0 },
  );
  expect(hidden.status()).toBeGreaterThanOrEqual(400);
  const visible = await page.request.get(
    `/api/drive/download?w=${account.workspaceSlug}&d=${account.driveSlugs.ftp}&id=${encodeURIComponent(BRIEF)}`,
    { maxRedirects: 0 },
  );
  expect(visible.status()).toBe(302);
});

test("/d/all aggregates every drive", async ({ page, account }) => {
  await page.goto(drivePath(account, "all"));
  await expect(driveSidebar(page).getByRole("button", { name: "Switch drive" })).toContainText(
    "7 drives",
  );
  await expect(entry(page, account.email)).toHaveCount(7);
});

test("search finds a file by name on every drive", async ({ page, account }) => {
  for (const kind of UNRESTRICTED) {
    await test.step(kind, async () => {
      await page.goto(drivePath(account, kind));
      await expect(entry(page, "welcome.txt")).toBeVisible();
      const search = page.waitForResponse(/\/rpc\/drive\/search/);
      await page.getByRole("textbox", { name: "Search this drive" }).fill("welcome");
      await search;
      await expect.soft(entry(page, "welcome.txt"), kind).toBeVisible();
      await expect.soft(entry(page, "Clients"), kind).toHaveCount(0);
    });
  }
});

test("every preview renderer shows its file", async ({ page, account }) => {
  const drive = drivePath(account, "s3");
  const cases: [string, string, (preview: import("@playwright/test").Locator) => Promise<void>][] =
    [
      [
        "Team/",
        "Meeting notes 2026-10-05.md",
        (p) =>
          expect(p.getByRole("heading", { name: "Meeting notes, 5 October 2026" })).toBeVisible(),
      ],
      [
        REBRAND_FOLDER,
        "moodboard.pdf",
        (p) => expect(p.getByRole("button", { name: "Next page" })).toBeVisible(),
      ],
      [REBRAND_FOLDER, "logo-options.png", (p) => expect(p.getByRole("img")).toBeVisible()],
      [REBRAND_FOLDER, "wordmark.svg", (p) => expect(p.getByRole("img")).toBeVisible()],
      ["Finance/2025/", "invoices.csv", (p) => expect(p.getByRole("table")).toBeVisible()],
      ["Finance/2025/", "expenses.tsv", (p) => expect(p.getByRole("table")).toBeVisible()],
      ["Team/website/", "Dockerfile", (p) => expect(p.locator("pre")).toContainText(/FROM/)],
      ["Team/", "brand-tokens.json", (p) => expect(p.locator("pre")).toBeVisible()],
      [
        REBRAND_FOLDER,
        "logo-pack.zip",
        (p) => expect(p.getByText(/Name · \d+ entries/)).toBeVisible(),
      ],
      ["Team/", "voice-memo.wav", (p) => expect(p.locator("audio")).toBeAttached()],
      [
        `${CLIENTS_FOLDER}${CLIENTS.kaltwasser}/`,
        "Pitch deck.pptx",
        (p) => expect(p.getByText("There is no preview for this file type.")).toBeVisible(),
      ],
      [
        "Team/website/",
        "site-backup.tar.gz",
        (p) => expect(p.getByText("There is no preview for this file type.")).toBeVisible(),
      ],
      [
        `${CLIENTS_FOLDER}${CLIENTS.saffron}/`,
        "menu-proof.indd",
        (p) =>
          expect(
            p.getByText(
              /^(There is no preview for this file type\.|This file can't be previewed here\.)$/,
            ),
          ).toBeVisible(),
      ],
    ];
  for (const [folder, name, check] of cases) {
    await page.goto(folderPath(drive, folder));
    const preview = await openPreview(page, name);
    await test.step(name, () => check(preview));
    await preview.getByRole("button", { name: "Close preview" }).click();
  }
});

test("every file just over a preview cap is refused a preview", async ({ page, account }) => {
  const drive = drivePath(account, "s3");
  for (const [folder, name] of [
    ["edge/preview/tables/", "rows-500000-over-cap.csv"],
    ["edge/preview/text/", "long-over-cap.md"],
    ["edge/preview/images/", "noise-26mb-over-cap.png"],
    ["edge/preview/docs/", "padded-51mb-over-cap.pdf"],
    ["edge/preview/archives/", "stored-101mb-over-cap.zip"],
    ["edge/preview/audio/", "tone-201mb-over-cap.wav"],
  ] as const) {
    await page.goto(folderPath(drive, folder));
    const preview = await openPreview(page, name);
    await expect(preview.getByText(/too large to preview/), name).toBeVisible();
  }
});

test("hostile files never execute", async ({ page, account }) => {
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  const drive = drivePath(account, "s3");
  await page.goto(folderPath(drive, "edge/preview/hostile/"));
  const title = await page.title();
  for (const name of [
    "evil.svg",
    "evil.html",
    "evil.md",
    "script.pdf",
    "fake.png",
    "traversal.zip",
  ]) {
    const preview = await openPreview(page, name);
    await page.waitForLoadState("networkidle");
    expect(await page.title(), name).toBe(title);
    await preview.getByRole("button", { name: "Close preview" }).click();
  }
  expect(dialogs).toEqual([]);
  expect(page.url()).toContain(encodeURIComponent("edge/preview/hostile/"));
});

test("the d chord and j/k walk the drive history", async ({ page, account }) => {
  const s3 = drivePath(account, "s3");
  await page.goto(s3);
  await expect(entry(page, "Clients")).toBeVisible();
  await entry(page, "Clients").dblclick();
  await expect(page).toHaveURL(new RegExp(encodeURIComponent(CLIENTS_FOLDER)));
  await files(page).click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("d");
  await page.keyboard.press("h");
  await expect(page).toHaveURL(new RegExp(`${drivePath(account, "all")}$`));
  await page.keyboard.press("k");
  await expect(page).toHaveURL(new RegExp(encodeURIComponent(CLIENTS_FOLDER)));
  await page.keyboard.press("j");
  await expect(page).toHaveURL(new RegExp(`${drivePath(account, "all")}$`));
});
