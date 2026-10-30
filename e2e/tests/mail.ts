import { expect, type Locator, type Page } from "@playwright/test";

import type { Rpc } from "./fixtures";
import { type Account, harness, mailPath } from "./harness";

export const BUILT_IN_LABELS = [
  "Action Required",
  "Work",
  "Personal",
  "Transactions",
  "Updates",
  "Newsletter",
  "Promotional",
  "Social",
] as const;

async function mailboxLink(rpc: Rpc, account: Account): Promise<string> {
  const { mailboxes } = await rpc<{
    mailboxes: { linkId: string; email: string }[];
  }>("workspaceMailboxes.list", { workspaceSlug: account.workspaceSlug });
  const linkId = mailboxes.find((m) => m.email === account.email)?.linkId;
  if (!linkId) throw new Error("Ana's mailbox is not linked");
  return linkId;
}

export async function setMailboxAi(rpc: Rpc, account: Account, on: boolean): Promise<void> {
  await rpc("mailboxes.setPolicy", {
    linkId: await mailboxLink(rpc, account),
    aiEnabled: on,
    ...(on ? { code: await harness.totp() } : {}),
  });
}

export function mailList(page: Page): Locator {
  return page.getByRole("main").locator('[aria-roledescription="draggable"]');
}

export function mailRow(page: Page, subject: string): Locator {
  return mailList(page).filter({
    has: page.getByText(subject, { exact: true }),
  });
}

export function rowLabel(row: Locator, label: string): Locator {
  return row.getByText(label === "Promotional" ? "Promo" : label, {
    exact: true,
  });
}

export function anyRowLabel(row: Locator): Locator {
  return row.getByText(
    /^(Action Required|Work|Personal|Transactions|Updates|Newsletter|Promo|Social)$/,
  );
}

export function folders(page: Page): Locator {
  return page.getByRole("complementary", { name: "Folders" });
}

const FOLDER_LINKS: Record<string, string> = {
  inbox: "Inbox",
  sent: "Sent",
  drafts: "Drafts",
  starred: "Starred",
  trash: "Trash",
  "read-later": "Read later",
  snoozed: "Snoozed",
  scheduled: "Scheduled",
  subscriptions: "Subscriptions",
  archive: "Archive",
  spam: "Spam",
};

export async function goToFolder(page: Page, account: Account, folder = "inbox"): Promise<void> {
  const target = mailPath(account, folder);
  const link = FOLDER_LINKS[folder];
  if (!link || !new URL(page.url(), "http://x").pathname.includes(`/m/${account.mailboxSlug}/`)) {
    await page.goto(target);
    return;
  }
  await folders(page)
    .getByRole("link", { name: new RegExp(`^${link}( \\d+)?$`) })
    .click();
  await expect(page).toHaveURL((url) => url.pathname === target);
}

export function messageToolbar(page: Page): Locator {
  return page.locator('div:has(> button[title="Previous message"])');
}

export function messageHeading(page: Page): Locator {
  return page.getByRole("main").getByRole("heading", { level: 2 });
}

export function bulkToolbar(page: Page): Locator {
  return page.getByRole("main").locator('div:has(> button[title="Clear selection"])');
}

export async function openMail(page: Page, subject: string): Promise<void> {
  await mailRow(page, subject).click();
  await expect(messageHeading(page)).toHaveText(subject);
  await expect(messageToolbar(page)).toBeVisible();
}

export async function searchAndOpen(page: Page, query: string, subject = query): Promise<void> {
  const search = page.getByRole("textbox", { name: "Search emails" });
  await search.fill(query);
  await search.press("Enter");
  const row = mailRow(page, subject).first();
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.click();
  await expect(messageHeading(page)).toHaveText(subject, { timeout: 60_000 });
  await expect(messageToolbar(page)).toBeVisible();
}

export async function showTab(page: Page, tab: string): Promise<void> {
  await page.getByRole("tab", { name: tab, exact: true }).click();
}

export function composer(page: Page): Locator {
  return page.locator('[aria-modal="true"]').filter({
    has: page.getByRole("button", { name: "Close compose" }),
  });
}

export function composerBody(page: Page): Locator {
  return composer(page).locator('[contenteditable="true"]');
}

export function confirmDialog(page: Page, title: string | RegExp): Locator {
  return page.getByRole("alertdialog", { name: title });
}

export function scheduledRow(page: Page, subject: string): Locator {
  return page
    .getByRole("main")
    .locator("div:has(> button)")
    .filter({ has: page.getByText(subject, { exact: true }) });
}

export function snoozedRow(page: Page, subject: string): Locator {
  return page
    .getByRole("main")
    .locator("div:has(> div > button)")
    .filter({ has: page.getByText(subject, { exact: true }) });
}

export function mailAgent(page: Page): Locator {
  return page.getByRole("group").filter({
    has: page.getByRole("textbox", { name: "Ask about your emails…" }),
  });
}

export async function snoozeArmed(rpc: Rpc, account: Account, subject: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const { emails } = await rpc<{
          emails: { subject: string; status: string }[];
        }>("mail.messages.listSnoozed", {
          workspaceSlug: account.workspaceSlug,
          mailboxSlug: account.mailboxSlug,
        });
        return emails.find((e) => e.subject === subject)?.status;
      },
      { intervals: [1_000] },
    )
    .toBe("pending");
}

export async function pickDrive(
  dialog: Locator,
  rpc: Rpc,
  account: Account,
  driveSlug: string,
): Promise<void> {
  const { drives } = await rpc<{
    drives: { slug: string; server: string | null; email: string }[];
  }>("workspaceDrives.list", { workspaceSlug: account.workspaceSlug });
  const drive = drives.find((d) => d.slug === driveSlug);
  expect(drive?.server, `drive ${driveSlug} has a server name`).toBeTruthy();
  await dialog
    .getByRole("button", {
      name: `${drive?.server} · ${drive?.email}`,
      exact: true,
    })
    .click();
}
