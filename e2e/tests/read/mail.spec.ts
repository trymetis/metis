import { readFile } from "node:fs/promises";

import { PEOPLE, SUBJECTS } from "@metis/e2e/lib/cast";
import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { mailPath, workspacePath } from "../harness";
import {
  anyRowLabel,
  folders,
  mailList,
  mailRow,
  messageHeading,
  messageToolbar,
  openMail,
  rowLabel,
  scheduledRow,
  showTab,
} from "../mail";

const SEEDED = [
  "Rebrand kickoff",
  "Your order A-42 has shipped",
  "Invitation: Rebrand review @ Thu Oct 8, 2026 15:00 UTC",
  "INR 1,250.00 debited from a/c **4821",
  "This week at the shop",
];
const TAB_OF: Record<string, string> = { Promo: "Promos" };

test("the inbox lists the seeded messages with their decision-model labels", async ({
  page,
  account,
}) => {
  await page.goto(mailPath(account));
  expect(await page.title()).toContain(account.email);
  await showTab(page, "All");
  for (const subject of SEEDED) await expect(mailRow(page, subject)).toBeVisible();
  for (const subject of [
    "Rebrand kickoff",
    "Your order A-42 has shipped",
    "This week at the shop",
  ]) {
    await expect(anyRowLabel(mailRow(page, subject)), subject).toBeVisible();
  }
});

test("a label tab shows only that label", async ({ page, account }) => {
  await page.goto(mailPath(account));
  await showTab(page, "All");
  const chip = anyRowLabel(mailRow(page, "Rebrand kickoff"));
  await expect(chip).toBeVisible();
  const label = (await chip.innerText()).trim();
  await showTab(page, TAB_OF[label] ?? label);
  const rows = mailList(page);
  await expect(mailRow(page, "Rebrand kickoff")).toBeVisible();
  for (const row of await rows.all()) await expect(rowLabel(row, label)).toBeVisible();
});

test("the Clients custom label is listed", async ({ page, account }) => {
  await page.goto(mailPath(account));
  await expect(folders(page).getByRole("link", { name: "Clients", exact: true })).toBeVisible();
});

test("opening a message shows its summary card and three smart replies", async ({
  page,
  account,
}) => {
  await page.goto(mailPath(account));
  await showTab(page, "All");
  await openMail(page, "Rebrand kickoff");
  const main = page.getByRole("main");
  await expect(main.getByText("TL;DR", { exact: true })).toBeVisible();
  await expect(
    main.getByRole("button", { name: "Reply 3 smart replies", exact: true }),
  ).toBeVisible();
  await expect(main.getByRole("button", { name: "Accept both" })).toBeVisible();
});

async function openFromToolbar(page: Page, name: string): Promise<Page> {
  const opened = page.context().waitForEvent("page");
  await messageToolbar(page).getByRole("link", { name, exact: true }).click();
  return opened;
}

test("View original shows the summary and the raw source, and downloads and copies the same message", async ({
  page,
  account,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(mailPath(account));
  await showTab(page, "All");
  await openMail(page, SUBJECTS.kickoff);
  const tab = await openFromToolbar(page, "View original");
  await expect(tab.getByRole("heading", { level: 1, name: "Original message" })).toBeVisible();
  await expect(tab).toHaveTitle(`Original — ${SUBJECTS.kickoff}`);

  const summary = tab.getByLabel("Message summary");
  await expect(summary.getByRole("term")).toHaveText([
    "Message ID",
    "Date",
    "From",
    "To",
    "Subject",
    "SPF",
    "DKIM",
    "DMARC",
  ]);
  await expect(summary.getByRole("definition")).toHaveText([
    /^<[0-9a-z]+@demo\.trymetis\.email>$/,
    "Mon, 21 Sep 2026 09:15:00 +0000",
    `${PEOPLE.raj.name} <${PEOPLE.raj.email}>`,
    `${PEOPLE.ana.name} <${PEOPLE.ana.email}>`,
    SUBJECTS.kickoff,
    "Not reported",
    "Not reported",
    "Not reported",
  ]);
  await expect(tab.getByText(/^Authentication results as reported by/)).toHaveCount(0);

  const shown = (await tab.getByLabel("Raw message").textContent()) ?? "";
  const messageId = (await summary.getByRole("definition").first().textContent()) ?? "";
  expect(shown).toContain(`Message-ID: ${messageId}`);
  expect(shown).toContain(`Subject: ${SUBJECTS.kickoff}`);
  expect(shown).toContain("We agreed to start the rebrand on October 5.");

  const download = tab.waitForEvent("download");
  await tab.getByRole("link", { name: "Download original" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`${SUBJECTS.kickoff}.eml`);
  const saved = await readFile(await file.path(), "utf8");
  expect(saved.replace(/\r\n/g, "\n")).toBe(shown.replace(/\r\n/g, "\n"));

  const copy = tab.getByRole("button", { name: "Copy to clipboard" });
  await copy.click();
  await expect(tab.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await tab.evaluate("navigator.clipboard.readText()")).toBe(shown);
  await expect(copy).toBeVisible();
  await tab.close();
});

test("View original answers a link without a message or for another mailbox with an error page", async ({
  page,
  account,
}) => {
  await page.goto(mailPath(account, "original"));
  await expect(page.getByRole("heading", { level: 1, name: "Message not found" })).toBeVisible();
  await expect(page.getByText("The link does not name a message.")).toBeVisible();

  await page.goto(workspacePath(account, "/m/not-a-mailbox/original?id=1"));
  await expect(page.getByRole("heading", { level: 1, name: "Message not found" })).toBeVisible();
  await expect(page.getByText("This mailbox is not available to you.")).toBeVisible();
});

test("Print opens the message on a print page in a new tab", async ({ page, account }) => {
  await page.goto(mailPath(account));
  await showTab(page, "All");
  await openMail(page, SUBJECTS.kickoff);
  const tab = await openFromToolbar(page, "Print");
  await expect(tab).toHaveTitle(SUBJECTS.kickoff);
  const header = tab.getByRole("banner");
  await expect(header.getByRole("heading", { level: 1 })).toHaveText(SUBJECTS.kickoff);
  await expect(header.getByRole("paragraph")).toHaveText([
    `From: ${PEOPLE.raj.name} <${PEOPLE.raj.email}>`,
    `To: ${PEOPLE.ana.name} <${PEOPLE.ana.email}>`,
    "Date: 9/21/2026, 9:15:00 AM UTC",
  ]);
  await expect(tab.getByText(/We agreed to start the rebrand on October 5/)).toBeVisible();
  await tab.close();
});

test("the muted thread is kept out of the inbox list", async ({ page, account }) => {
  await page.goto(mailPath(account));
  await showTab(page, "All");
  await expect(mailRow(page, "Rebrand kickoff")).toBeVisible();
  await expect(mailRow(page, "[Codeyard] Your sign-in verification code")).toHaveCount(0);
});

test("the read-later message is listed under Read later", async ({ page, account }) => {
  await page.goto(mailPath(account, "read-later"));
  await expect(page.getByRole("heading", { level: 1, name: "Read later" })).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(mailRow(page, "Your order A-42 has shipped")).toBeVisible();
});

test("the seeded scheduled send is listed under Scheduled", async ({ page, account }) => {
  await page.goto(mailPath(account, "scheduled"));
  await expect(page.getByRole("heading", { level: 2, name: "Pending (1)" })).toBeVisible();
  const row = scheduledRow(page, "Moodboard for the rebrand");
  await expect(row).toContainText("To: ana@demo.trymetis.email");
  await expect(row.getByRole("button", { name: "Cancel" })).toBeVisible();
});

test("search finds a message and leaves the others out", async ({ page, account }) => {
  await page.goto(mailPath(account));
  await showTab(page, "All");
  await expect(mailRow(page, "Rebrand kickoff")).toBeVisible();
  const search = page.getByRole("textbox", { name: "Search emails" });
  await search.fill("A-42");
  await search.press("Enter");
  await expect(mailRow(page, "Your order A-42 has shipped")).toBeVisible();
  await expect(mailRow(page, "Rebrand kickoff")).toHaveCount(0);
});

test("the all mailbox lists every mailbox's mail", async ({ page, account }) => {
  await page.goto(workspacePath(account, "/m/all/inbox"));
  await showTab(page, "All");
  const row = mailRow(page, "Rebrand kickoff");
  await expect(row).toBeVisible();
  await expect(row).toContainText(account.email);
});

test("the m chord switches folders", async ({ page, account }) => {
  await page.goto(mailPath(account));
  await expect(mailRow(page, "Rebrand kickoff")).toBeVisible();
  await page.getByRole("heading", { level: 1, name: "Inbox" }).click();
  await page.keyboard.press("m");
  await page.keyboard.press("s");
  await expect(page).toHaveURL(new RegExp(`${mailPath(account, "sent")}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Sent" })).toBeVisible();
});

test("j and k move between messages", async ({ page, account }) => {
  await page.goto(mailPath(account));
  await showTab(page, "All");
  await expect(mailRow(page, "Rebrand kickoff")).toBeVisible();
  await page.getByRole("heading", { level: 1, name: "Inbox" }).click();
  const detail = messageHeading(page);
  await page.keyboard.press("j");
  await expect(messageToolbar(page)).toBeVisible();
  const first = await detail.innerText();
  await page.keyboard.press("j");
  await expect(detail).not.toHaveText(first);
  await page.keyboard.press("k");
  await expect(detail).toHaveText(first);
});
