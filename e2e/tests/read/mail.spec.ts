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
