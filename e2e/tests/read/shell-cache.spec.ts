import { calendars } from "../calendar";
import { driveSidebar, entry } from "../drive";
import { expect, test } from "../fixtures";
import { calendarPath, drivePath, mailPath } from "../harness";
import { folders, mailList } from "../mail";
import {
  holdRpc,
  readShellCache,
  SHELL_KEYS,
  sessionUserId,
  shellKeys,
  workspaceName,
  workspaceTile,
  writeShellCache,
} from "../shell-cache";

const SEEN_ON_MAIL_CALENDAR_DRIVE = [
  "workspaces.list (query)",
  "workspaceMailboxes.list (query)",
  "mail.customLabels.list (query)",
  "workspaceCalendars.list (query)",
  "calendarEvents.calendars (query)",
  "workspaceDrives.list (query)",
  "drive.pins (query)",
  "drive.quotas (query)",
  "drive.list (top folder, first page)",
];

test("the browser keeps only the shell's lists, owned by the signed-in user", async ({
  page,
  account,
}) => {
  await page.goto(mailPath(account));
  await expect(folders(page).getByRole("link", { name: "Clients", exact: true })).toBeVisible();
  await page.goto(calendarPath(account));
  await expect(calendars(page).getByRole("checkbox", { name: "Show Work" })).toBeVisible();
  await page.goto(drivePath(account, "s3"));
  await expect(entry(page, "welcome.txt")).toBeVisible();

  await expect
    .poll(async () => shellKeys(await readShellCache(page)))
    .toEqual(expect.arrayContaining(SEEN_ON_MAIL_CALENDAR_DRIVE));
  const cache = await readShellCache(page);
  expect(shellKeys(cache).filter((key) => !SHELL_KEYS.includes(key))).toEqual([]);
  expect(cache?.owner?.userId).toBe(await sessionUserId(page));
});

test("a cache written by another server version is emptied on the next load", async ({
  page,
  account,
}) => {
  await page.goto(mailPath(account));
  await expect
    .poll(async () => shellKeys(await readShellCache(page)))
    .toContain("workspaces.list (query)");
  const owner = (await readShellCache(page))?.owner;
  if (!owner) throw new Error("the shell cache has no owner");

  await writeShellCache(
    page,
    { userId: owner.userId, version: "0.0.0-older" },
    { hash: "e2e-left-over", queryKey: [["e2e", "leftOver"], { type: "query" }], data: {} },
  );
  await page.reload();

  await expect.poll(async () => (await readShellCache(page))?.owner?.version).toBe(owner.version);
  expect(shellKeys(await readShellCache(page)).filter((key) => !SHELL_KEYS.includes(key))).toEqual(
    [],
  );
});

test("with the server held, a reload shows the cached shell and the message list waits for the server", async ({
  page,
  account,
  rpc,
}) => {
  const tile = workspaceTile(page, await workspaceName(rpc, account.workspaceSlug));
  const mailbox = folders(page).getByRole("button", { name: "Switch mailbox" });
  const label = folders(page).getByRole("link", { name: "Clients", exact: true });

  await page.goto(mailPath(account));
  await expect(tile).toBeVisible();
  await expect(mailbox).toContainText(account.email);
  await expect(label).toBeVisible();
  await expect(mailList(page).first()).toBeVisible();
  await page.waitForLoadState("networkidle");

  const release = await holdRpc(page);
  await page.reload();
  await expect(tile).toBeVisible();
  await expect(mailbox).toContainText(account.email);
  await expect(label).toBeVisible();
  await expect(page.getByRole("main").locator(".animate-pulse").first()).toBeVisible();

  await release();
  await expect(mailList(page).first()).toBeVisible();
});

test("with the server held, a reload shows the cached calendars of the calendar sidebar", async ({
  page,
  account,
}) => {
  const work = calendars(page).getByRole("checkbox", { name: "Show Work" });

  await page.goto(calendarPath(account));
  await expect(work).toBeVisible();
  await page.waitForLoadState("networkidle");

  const release = await holdRpc(page);
  await page.reload();
  await expect(work).toBeVisible();
  await release();
});

test("with the server held, a reload shows the cached pins and top folder of a drive", async ({
  page,
  account,
}) => {
  const pin = driveSidebar(page).getByRole("button", { name: "Rebrand", exact: true });
  const file = entry(page, "welcome.txt");

  await page.goto(drivePath(account, "s3"));
  await expect(pin).toBeVisible();
  await expect(file).toBeVisible();
  await page.waitForLoadState("networkidle");

  const release = await holdRpc(page);
  await page.reload();
  await expect(pin).toBeVisible();
  await expect(file).toBeVisible();
  await release();
});
