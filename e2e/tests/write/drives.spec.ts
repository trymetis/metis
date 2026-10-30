import { readFile } from "node:fs/promises";

import { CLIENTS_FOLDER } from "@metis/e2e/lib/cast";
import type { Page } from "@playwright/test";

import { driveSidebar, entry, entryActions, folderPath } from "../drive";
import { expect, type Rpc, test, uniqueName } from "../fixtures";
import type { Account } from "../harness";
import { drivePath } from "../harness";

const KINDS = ["s3", "s3Relay", "webdav", "ftps", "ftp", "ftpsImplicit", "sftp"] as const;
const UPLOAD = "hello from the e2e suite\n";

interface Entry {
  id: string;
  name: string;
  kind: string;
}

async function list(rpc: Rpc, account: Account, driveSlug: string, parentId: string | null) {
  const { entries } = await rpc<{ entries: Entry[] }>("drive.list", {
    workspaceSlug: account.workspaceSlug,
    driveSlug,
    parentId,
  });
  return entries;
}

async function idOf(
  rpc: Rpc,
  account: Account,
  driveSlug: string,
  parentId: string | null,
  name: string,
) {
  const found = (await list(rpc, account, driveSlug, parentId)).find((e) => e.name === name);
  if (!found) throw new Error(`${name} is not in ${parentId ?? "the root"}`);
  return found.id;
}

async function entryAction(page: Page, name: string, action: string) {
  await entryActions(page, name).click();
  await page
    .getByRole("menu", { name: `Actions for ${name}` })
    .getByRole("menuitem", { name: action, exact: true })
    .click();
}

export default function driveSpecs() {
  for (const kind of KINDS) {
    test(`${kind}: create a folder, upload into it, rename, move, download and delete`, async ({
      page,
      rpc,
      account,
    }, testInfo) => {
      const driveSlug = account.driveSlugs[kind] ?? "";
      const base = kind === "ftp" ? CLIENTS_FOLDER : null;
      const root = base ? folderPath(drivePath(account, kind), base) : drivePath(account, kind);
      const folder = uniqueName(testInfo);

      try {
        await lifecycle();
      } finally {
        for (const name of ["renamed.txt", folder]) {
          const left = (await list(rpc, account, driveSlug, base)).find((e) => e.name === name);
          if (left)
            await rpc("drive.delete", {
              workspaceSlug: account.workspaceSlug,
              driveSlug,
              fileId: left.id,
            });
        }
      }

      async function lifecycle() {
        await page.goto(root);
        await page.getByRole("button", { name: "New folder", exact: true }).click();
        const create = page.getByRole("dialog", { name: "New folder" });
        await create.getByRole("textbox").fill(folder);
        await create.getByRole("button", { name: "Create", exact: true }).click();
        await expect(create).toBeHidden();
        await expect(entry(page, folder)).toBeVisible();
        const folderId = await idOf(rpc, account, driveSlug, base, folder);

        await entry(page, folder).dblclick();
        await expect(
          page.getByRole("navigation", { name: "breadcrumb" }).getByText(folder, { exact: true }),
        ).toBeVisible();
        const chooser = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "Upload", exact: true }).click();
        await (
          await chooser
        ).setFiles({
          name: "hello.txt",
          mimeType: "text/plain",
          buffer: Buffer.from(UPLOAD),
        });
        await expect(entry(page, "hello.txt")).toBeVisible();

        await entryAction(page, "hello.txt", "Rename");
        const rename = page.getByRole("dialog", { name: "Rename" });
        await expect(rename.getByRole("textbox")).toHaveValue("hello.txt");
        await rename.getByRole("textbox").fill("renamed.txt");
        await rename.getByRole("button", { name: "Rename", exact: true }).click();
        await expect(rename).toBeHidden();
        await expect(entry(page, "renamed.txt")).toBeVisible();
        await expect(entry(page, "hello.txt")).toHaveCount(0);

        const fileId = await idOf(rpc, account, driveSlug, folderId, "renamed.txt");
        await rpc("drive.move", {
          workspaceSlug: account.workspaceSlug,
          driveSlug,
          fileId,
          parentId: base,
        });
        await page.goto(root);
        await expect(entry(page, "renamed.txt")).toBeVisible();

        const download = page.waitForEvent("download", { timeout: 30_000 });
        await entryAction(page, "renamed.txt", "Download");
        const saved = await (await download).path();
        expect(await readFile(saved, "utf8")).toBe(UPLOAD);

        for (const name of ["renamed.txt", folder]) {
          await entryAction(page, name, "Delete");
          await page
            .getByRole("alertdialog", { name: `Delete ${name}?` })
            .getByRole("button", { name: "Delete", exact: true })
            .click();
          await expect(entry(page, name)).toHaveCount(0);
        }
        await expect
          .poll(async () => (await list(rpc, account, driveSlug, base)).map((e) => e.name))
          .not.toEqual(expect.arrayContaining([folder]));
        expect((await list(rpc, account, driveSlug, base)).map((e) => e.name)).not.toContain(
          "renamed.txt",
        );
      }
    });
  }

  test("pin a folder to the sidebar and unpin it", async ({ page, account }) => {
    await page.goto(drivePath(account, "sftp"));
    await expect(entry(page, "Team")).toBeVisible();
    await entryAction(page, "Team", "Pin to sidebar");
    const sidebar = driveSidebar(page);
    const unpin = sidebar.getByRole("button", { name: "Unpin Team" });
    await expect(unpin).toBeVisible();
    await page.reload();
    await expect(unpin).toBeVisible();
    await sidebar.getByRole("button", { name: "Team", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(encodeURIComponent("Team/")));
    await unpin.click();
    await expect(unpin).toHaveCount(0);
    await page.reload();
    await expect(sidebar.getByRole("button", { name: "Unpin Team" })).toHaveCount(0);
  });
}
