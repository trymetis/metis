import type { Page } from "@playwright/test";

import { expect, type Rpc, test, uniqueName } from "../fixtures";
import { type Account, workspacePath } from "../harness";
import { composer, composerBody, folders, goToFolder, openMail, setMailboxAi } from "../mail";

const OUTSIDE = "signature@discard.demo.trymetis.email";

interface Signature {
  id: string;
  name: string;
  scope: "mailbox" | "personal";
}

function mailboxScope(account: Account) {
  return { workspaceSlug: account.workspaceSlug, mailboxSlug: account.mailboxSlug };
}

async function removeSignatures(rpc: Rpc, account: Account, name: string) {
  const listed = await rpc<{ mailbox: Signature[]; personal: Signature[] }>(
    "mail.signatures.list",
    mailboxScope(account),
  );
  for (const s of [...listed.mailbox, ...listed.personal].filter((x) => x.name === name)) {
    await rpc("mail.signatures.delete", { ...mailboxScope(account), scope: s.scope, id: s.id });
  }
}

async function discardDrafts(rpc: Rpc, account: Account, subject: string) {
  const { emails } = await rpc<{ emails: { id: string; subject: string }[] }>(
    "mail.messages.list",
    { ...mailboxScope(account), folder: "drafts", limit: 50 },
  );
  for (const draft of emails.filter((e) => e.subject === subject)) {
    await rpc("mail.drafts.delete", { ...mailboxScope(account), draftId: draft.id });
  }
}

function mineIn(page: Page, account: Account) {
  return page
    .getByRole("region", { name: `Signatures for ${account.email}` })
    .getByRole("region", { name: "Your signatures" });
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

export default function signatureSpecs() {
  test("a personal signature added in settings goes into a new message, the picker drops and restores it, and a reopened draft keeps one copy", async ({
    page,
    rpc,
    account,
  }, testInfo) => {
    const name = `${uniqueName(testInfo)} signature`;
    const subject = `${uniqueName(testInfo)} draft`;
    const signed = `Signed ${account.name}`;
    let aiOff = false;
    try {
      await page.goto(workspacePath(account, "/settings/signatures"));
      await expect(
        page.getByRole("main").getByRole("heading", { level: 1, name: "Signatures" }),
      ).toBeVisible();

      const mine = mineIn(page, account);
      await mine.getByRole("button", { name: "Add" }).click();
      const dialog = page.getByRole("dialog", { name: "New signature" });
      await dialog.getByRole("textbox", { name: "Signature name" }).fill(name);
      await dialog.getByRole("button", { name: "HTML", exact: true }).click();
      await dialog
        .getByRole("textbox", { name: "Signature HTML" })
        .fill('<p>Signed {{name}}</p><script>alert("x")</script>');
      await expect(dialog.getByText("Signed {{name}}", { exact: true })).toBeVisible();
      await dialog.getByRole("checkbox", { name: "Default for new messages" }).click();
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(dialog).toHaveCount(0);

      const card = mine.getByRole("listitem").filter({ hasText: name });
      await expect(card.getByText("New messages", { exact: true })).toBeVisible();
      await expect(card).not.toContainText("alert");

      await goToFolder(page, account, "inbox");
      await folders(page).getByRole("button", { name: "Compose", exact: true }).click();
      const box = composer(page);
      await expect(composerBody(page)).toContainText(signed);

      const picker = box.getByRole("button", { name: "Signature", exact: true });
      await picker.click();
      await page.getByRole("menuitem", { name: "No signature" }).click();
      await expect(composerBody(page)).not.toContainText(signed);
      await picker.click();
      await page.getByRole("menuitem", { name: new RegExp(`^${name}`) }).click();
      await expect(composerBody(page)).toContainText(signed);

      await composerBody(page).locator("p").first().click();
      await page.keyboard.type("Written above the signature.");
      await expect(composerBody(page)).toContainText("Written above the signature.");
      await expect(composerBody(page)).toContainText(signed);
      await box.getByRole("combobox", { name: "To recipients" }).fill(OUTSIDE);
      await page.keyboard.press("Enter");
      await box.getByRole("textbox", { name: "Subject line…" }).fill(subject);
      await expect(box.getByText("Draft saved")).toBeVisible({ timeout: 30_000 });
      await box.getByRole("button", { name: "Close compose" }).click();

      await setMailboxAi(rpc, account, false);
      aiOff = true;
      await goToFolder(page, account, "drafts");
      await openMail(page, subject);
      await page.getByRole("button", { name: "Edit draft" }).click();
      await expect(composerBody(page)).toContainText("Written above the signature.");
      const text = (await composerBody(page).textContent()) ?? "";
      expect(occurrences(text, signed)).toBe(1);
      await composer(page).getByRole("button", { name: "Close compose" }).click();
      await page.goto(workspacePath(account, "/settings/signatures"));
    } finally {
      await discardDrafts(rpc, account, subject);
      await removeSignatures(rpc, account, name);
      if (aiOff) await setMailboxAi(rpc, account, true);
    }
  });

  test("the owner writes and turns off the workspace footer, and both changes show in Activity", async ({
    page,
    rpc,
    account,
  }, testInfo) => {
    const ws = { workspaceSlug: account.workspaceSlug };
    const { footer: before } = await rpc<{ footer: { html: string; enabled: boolean } }>(
      "workspaceSignatures.list",
      ws,
    );
    const text = `Footer ${uniqueName(testInfo)}`;
    try {
      await rpc("workspaceSignatures.setFooter", { ...ws, html: "", enabled: false });
      await page.goto(workspacePath(account, "/settings/signatures"));
      const footer = page.getByRole("region", { name: "Footer" });
      const toggle = footer.getByRole("switch", { name: "Add the footer to outgoing mail" });
      await expect(toggle).toBeDisabled();

      await footer.getByRole("button", { name: "Edit" }).click();
      const dialog = page.getByRole("dialog", { name: "Mail footer" });
      await dialog.getByRole("button", { name: "HTML", exact: true }).click();
      await dialog.getByRole("textbox", { name: "Signature HTML" }).fill(`<p>${text}</p>`);
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(footer.getByText(text)).toBeVisible();
      await expect(toggle).toHaveAttribute("aria-checked", "true");

      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await expect(footer.getByText("Off: not added to outgoing mail.")).toBeVisible();

      await page.goto(workspacePath(account, "/settings/activity"));
      await page.getByRole("searchbox", { name: "Search events" }).fill("mail footer");
      await expect(page.getByText(/turned off the mail footer/).first()).toBeVisible();
      await expect(page.getByText(/changed the mail footer/).first()).toBeVisible();
    } finally {
      await rpc("workspaceSignatures.setFooter", { ...ws, ...before });
    }
  });
}
