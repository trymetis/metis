import { readFile } from "node:fs/promises";

import { SEEDED_CONTACTS } from "@metis/e2e/lib/contacts";

import { expect, test } from "../fixtures";
import { mailPath, workspacePath } from "../harness";
import { mailRow, openMail, rowLabel } from "../mail";
import { openSearch, typeQuery } from "../search";

function contactList(page: import("@playwright/test").Page) {
  return page.getByRole("list", { name: "Contacts" });
}

test("the rail opens Contacts on the all view with every seeded contact", async ({
  page,
  account,
}) => {
  await page.goto(workspacePath(account));
  await page
    .getByRole("navigation", { name: "App navigation" })
    .getByRole("link", { name: "Contacts" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/w/${account.workspaceSlug}/p/all/all$`));
  await expect(page.getByRole("heading", { level: 1, name: "All contacts" })).toBeVisible();
  for (const contact of SEEDED_CONTACTS) {
    await expect(
      contactList(page).getByRole("button", { name: new RegExp(contact.name) }),
    ).toBeVisible();
  }
  await expect(
    contactList(page).getByRole("button", { name: /Kenji Watanabe.*Studio contacts/ }),
  ).toBeVisible();
});

test("the filter narrows the list and a contact card shows its fields", async ({
  page,
  account,
}) => {
  await page.goto(workspacePath(account, "/p/all/all"));
  await page.getByRole("textbox", { name: "Filter contacts" }).fill("rebrand");
  await expect(contactList(page).getByRole("button")).toHaveCount(1);
  await contactList(page)
    .getByRole("button", { name: /Raj Mehta/ })
    .click();
  const card = page.getByRole("article", { name: "Raj Mehta" });
  await expect(card.getByRole("heading", { level: 1, name: "Raj Mehta" })).toBeVisible();
  await expect(card.getByText("raj@demo.trymetis.email (work)")).toBeVisible();
  await expect(card.getByText("+351 912 345 678 (cell)")).toBeVisible();
  await expect(card.getByText("Rebrand lead · Fernhill Studio")).toBeVisible();
  await expect(card.getByRole("button", { name: "Email", exact: true })).toBeEnabled();
  await expect(card.getByText("Recent mail with them")).toBeVisible();
});

test("Download saves the open contact as a vCard", async ({ page, account }) => {
  await page.goto(workspacePath(account, "/p/all/all"));
  await contactList(page)
    .getByRole("button", { name: /Raj Mehta/ })
    .click();
  const card = page.getByRole("article", { name: "Raj Mehta" });
  const download = page.waitForEvent("download");
  await card.getByRole("button", { name: "Download", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Raj Mehta.vcf");
  const text = await readFile((await file.path()) ?? "", "utf8");
  expect(text).toContain("FN:Raj Mehta");
  expect(text).toContain("raj@demo.trymetis.email");
});

test("a contact without an email cannot be emailed or invited", async ({ page, account }) => {
  await page.goto(workspacePath(account, "/p/all/all"));
  await contactList(page)
    .getByRole("button", { name: /Harbour Hall front desk/ })
    .click();
  const card = page.getByRole("article", { name: "Harbour Hall front desk" });
  await expect(card.getByRole("button", { name: "Email", exact: true })).toBeDisabled();
  await expect(card.getByRole("button", { name: "Invite to event", exact: true })).toBeDisabled();
  await expect(card.getByRole("button", { name: "Edit", exact: true })).toBeEnabled();
});

test("picking a book in Show lists only that book", async ({ page, account }) => {
  await page.goto(workspacePath(account, "/p/all/all"));
  await page.getByRole("combobox", { name: "Show" }).click();
  await page.getByRole("option", { name: "Studio contacts" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Studio contacts" })).toBeVisible();
  await expect(contactList(page).getByRole("button")).toHaveCount(SEEDED_CONTACTS.length);
});

test("Settings → Contacts lists the CardDAV address book with its book shown", async ({
  page,
  account,
}) => {
  await page.goto(workspacePath(account, "/settings/contacts"));
  await expect(page.getByRole("heading", { level: 1, name: "Contacts" })).toBeVisible();
  await expect(page.getByText("Fernhill Contacts").first()).toBeVisible();
  await page.getByRole("button", { name: "Show address books" }).click();
  await expect(
    page.getByRole("switch", { name: "Show Studio contacts in this workspace" }),
  ).toBeChecked();
});

test("clicking a saved sender opens a menu with Open contact", async ({ page, account }) => {
  await page.goto(mailPath(account));
  await openMail(page, "Rebrand kickoff");
  await page.getByRole("button", { name: "Raj Mehta (raj@demo.trymetis.email)" }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Add to contacts" })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Copy email" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Open contact" }).click();
  await expect(page).toHaveURL(/\/p\/all\/all\//);
  await expect(page.getByRole("article", { name: "Raj Mehta" })).toBeVisible();
});

test("a search hit for a saved contact offers Open contact", async ({ page, account }) => {
  await page.goto(mailPath(account));
  const dialog = await openSearch(page);
  await typeQuery(page, "type:contact kenji");
  const row = dialog
    .getByRole("group", { name: "Contacts" })
    .getByRole("option", { name: /Kenji Watanabe/ });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /^Actions for/ }).click();
  await expect(dialog.getByText("Open contact", { exact: true })).toBeVisible();
});

test("a summary Contact card for a saved person offers Open contact and Download", async ({
  page,
  account,
}) => {
  await page.goto(mailPath(account, "archive"));
  await expect(
    rowLabel(mailRow(page, "Introducing Lena Hoffmann (Kaltwasser GmbH)"), "Work"),
  ).toBeVisible();
  await openMail(page, "Introducing Lena Hoffmann (Kaltwasser GmbH)");
  const main = page.getByRole("main");
  await expect(main.getByText("Lena Hoffmann", { exact: true }).first()).toBeVisible();
  await expect(main.getByRole("button", { name: "Save contact", exact: true })).toHaveCount(0);
  const download = page.waitForEvent("download");
  await main.getByRole("button", { name: "Download", exact: true }).first().click();
  expect((await download).suggestedFilename()).toMatch(/\.vcf$/);
  await main.getByRole("button", { name: "Open contact", exact: true }).first().click();
  await expect(page).toHaveURL(/\/p\/all\/all\/[^/]+$/);
  await expect(page.getByRole("article", { name: "Lena Hoffmann" })).toBeVisible();
});

test("a summary Contact card for someone not saved offers Save contact", async ({
  page,
  account,
}) => {
  await page.goto(mailPath(account));
  await expect(
    rowLabel(mailRow(page, "Introducing Layla Haddad from Saffron & Sage"), "Work"),
  ).toBeVisible();
  await openMail(page, "Introducing Layla Haddad from Saffron & Sage");
  const main = page.getByRole("main");
  await expect(main.getByRole("button", { name: "Save contact", exact: true })).toBeVisible();
  await expect(main.getByRole("button", { name: "Download", exact: true })).toBeVisible();
  await expect(main.getByRole("button", { name: "Open contact", exact: true })).toHaveCount(0);
});
