import { expect, test } from "../fixtures";
import { calendarPath, drivePath, mailPath, workspacePath } from "../harness";
import { messageHeading } from "../mail";
import { openSearch, result, searchBox, searchDialog, typeQuery } from "../search";

test("the rail opens search, the query is highlighted and a mail result opens the message", async ({
  page,
  account,
}) => {
  await page.goto(mailPath(account));
  const dialog = await openSearch(page);
  await typeQuery(page, "from:raj@demo.trymetis.email kickoff");
  await expect(dialog.locator(".sq-key")).toHaveText("from");
  await expect(dialog.locator(".sq-value")).toHaveText("raj@demo.trymetis.email");
  await expect(dialog.locator(".sq-text")).toHaveText("kickoff");

  const row = result(page, /Rebrand kickoff/);
  await expect(row).toBeVisible();
  await expect(
    dialog.getByRole("complementary", { name: "Preview" }).getByRole("heading", {
      name: "Rebrand kickoff",
    }),
  ).toBeVisible();
  await row.click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/m/${account.mailboxSlug}/`));
  await expect(messageHeading(page)).toHaveText("Rebrand kickoff");
});

test("Ctrl+K opens search and the retired in: key is marked with a hint", async ({
  page,
  account,
}) => {
  await page.goto(calendarPath(account));
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = searchDialog(page);
  await expect(dialog).toBeVisible();
  await typeQuery(page, "in:inbox");
  await expect(dialog.getByRole("alert")).toHaveText("Use mail-folder: or drive-folder:");
  await expect(dialog.locator(".sq-invalid").first()).toHaveText("in");
});

test("an unfinished group keeps its colors and asks to be closed", async ({ page, account }) => {
  await page.goto(mailPath(account));
  const dialog = await openSearch(page);
  await typeQuery(page, "(from:raj OR");
  await expect(
    dialog.getByText("Finish the search: close every quote and parenthesis."),
  ).toBeVisible();
});

test("autocomplete suggests a key, Tab inserts it and its values follow", async ({
  page,
  account,
}) => {
  await page.goto(mailPath(account));
  await openSearch(page);
  await typeQuery(page, "mail-fo");
  await expect(result(page, /^mail-folder:/)).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(searchBox(page)).toHaveText("mail-folder:");
  await expect(result(page, /^inbox/)).toBeVisible();
  await expect(result(page, /^archive/)).toBeVisible();
});

test("opening search from a drive starts the query with that drive", async ({ page, account }) => {
  await page.goto(drivePath(account, "s3"));
  await openSearch(page);
  await expect(searchBox(page)).toHaveText(`drive:${account.driveSlugs.s3}`);
});

test("the Files toggle limits results to files and a file opens its preview", async ({
  page,
  account,
}) => {
  await page.goto(workspacePath(account, "/workflow"));
  const dialog = await openSearch(page);
  await dialog.getByRole("button", { name: "Files", exact: true }).click();
  await expect(searchBox(page)).toHaveText("type:file");
  await page.keyboard.type(`drive:${account.driveSlugs.s3} welcome`);
  const row = result(page, /welcome\.txt/);
  await expect(row).toBeVisible();
  await expect(dialog.getByRole("group", { name: "Mail" })).toHaveCount(0);

  await page.keyboard.press("Tab");
  await expect(result(page, "Download")).toBeVisible();
  await expect(result(page, "Rename")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(row).toBeVisible();

  await row.click();
  await expect(page).toHaveURL(new RegExp(`/d/${account.driveSlugs.s3}`));
  await expect(page.getByRole("complementary", { name: "Preview of welcome.txt" })).toBeVisible();
});

test("an event result opens the event in the calendar", async ({ page, account }) => {
  await page.goto(mailPath(account));
  await openSearch(page);
  await typeQuery(page, 'type:event "Design review" after:2026-10-01 before:2026-10-15');
  const row = result(page, /Design review/);
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/\/c\//);
  await expect(page.getByRole("dialog", { name: /Design review/ })).toBeVisible();
});

test("a member result opens the member's profile with their mail", async ({ page, account }) => {
  await page.goto(mailPath(account));
  await openSearch(page);
  await typeQuery(page, `type:member ${account.email}`);
  const row = searchDialog(page)
    .getByRole("group", { name: "Members" })
    .getByRole("option", { name: new RegExp(account.name) });
  await expect(row).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/members\//);
  await expect(page.getByRole("heading", { level: 1, name: account.name })).toBeVisible();
  await expect(page.getByText("Recent mail with them")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Search everything with this person" }),
  ).toBeVisible();
});

test("the members page lists the workspace's members and links to profiles", async ({
  page,
  account,
}) => {
  await page.goto(workspacePath(account, "/members"));
  await expect(page.getByRole("heading", { level: 1, name: "Members" })).toBeVisible();
  const list = page.getByRole("list", { name: "Members" });
  await list.getByRole("link", { name: new RegExp(account.email) }).click();
  await expect(page).toHaveURL(/\/members\/.+/);
  await expect(page.getByRole("heading", { level: 1, name: account.name })).toBeVisible();
});

test("on a phone search is a full-height sheet without the preview pane", async ({
  page,
  account,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(mailPath(account));
  await expect(
    page.getByRole("main").getByRole("button", { name: "Open sidebar", exact: true }),
  ).toBeVisible();
  const dialog = await openSearch(page);
  await typeQuery(page, "rebrand");
  await expect(result(page, /Rebrand kickoff/)).toBeVisible();
  await expect(dialog.getByRole("complementary", { name: "Preview" })).toHaveCount(0);
  await expect(
    result(page, /Rebrand kickoff/).getByRole("button", {
      name: /^Actions for/,
    }),
  ).toBeVisible();
});
