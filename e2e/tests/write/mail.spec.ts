import { PEOPLE } from "@metis/e2e/lib/cast";
import { env } from "@metis/e2e/lib/env";
import type { Page } from "@playwright/test";

import { expect, type Rpc, RpcError, test, uniqueName } from "../fixtures";
import { type Account, mailPath } from "../harness";
import {
  anyRowLabel,
  BUILT_IN_LABELS,
  bulkToolbar,
  composer,
  composerBody,
  confirmDialog,
  folders,
  goToFolder,
  mailRow,
  messageToolbar,
  openMail,
  pickDrive,
  scheduledRow,
  searchAndOpen,
  setMailboxAi,
  showTab,
  snoozeArmed,
  snoozedRow,
} from "../mail";

const RENDERED: [query: string, row: string][] = [
  ["html-hostile", "html-hostile"],
  ["html-no-visible-text", "html-no-visible-text"],
  ["max-html-nesting-10k", "max-html-nesting-10k"],
  ["html-css-20mb", "html-css-20mb"],
  ["max-body-plain-20mb", "max-body-plain-20mb"],
  ["mime-nested-100", "mime-nested-100"],
  ["Long thread", "Re: Long thread"],
];

const TARGET = "INR 1,250.00 debited from a/c **4821";
const OUTSIDE = "outside@discard.demo.trymetis.email";

interface ListedEmail {
  id: string;
  threadId?: string;
  subject: string;
  isRead: boolean;
  isStarred: boolean;
  folder: string;
}

function scope(account: Account) {
  return {
    workspaceSlug: account.workspaceSlug,
    mailboxSlug: account.mailboxSlug,
  };
}

function toasts(page: Page) {
  return page.getByRole("region", { name: /^Notifications/ });
}

async function findIn(
  rpc: Rpc,
  account: Account,
  folder: string,
  subject: string,
): Promise<ListedEmail | undefined> {
  const { emails } = await rpc<{ emails: ListedEmail[] }>("mail.messages.list", {
    ...scope(account),
    folder,
    limit: 100,
  });
  return emails.find((e) => e.subject === subject);
}

async function openTarget(page: Page, account: Account, folder = "inbox", subject = TARGET) {
  await goToFolder(page, account, folder);
  if (folder === "inbox") {
    await showTab(page, "All");
    await expect(anyRowLabel(mailRow(page, subject))).toBeVisible();
  }
  await openMail(page, subject);
}

async function compose(page: Page, subject: string) {
  await folders(page).getByRole("button", { name: "Compose", exact: true }).click();
  const box = composer(page);
  await addRecipient(page);
  await box.getByRole("textbox", { name: "Subject line…" }).fill(subject);
  await composerBody(page).click();
  await page.keyboard.type("Sent by the e2e suite.");
}

const SLOW_POLL = { intervals: [1_000] };

async function unstrand(rpc: Rpc, account: Account) {
  await expect
    .poll(async () => {
      const { emails } = await rpc<{
        emails: { id: string; status: string }[];
      }>("mail.messages.listSnoozed", scope(account));
      for (const snoozed of emails) {
        await rpc("mail.messages.cancelSnooze", {
          ...scope(account),
          id: snoozed.id,
        }).catch((err: unknown) => {
          if (!(err instanceof RpcError && err.code === "CONFLICT")) throw err;
        });
      }
      return emails.length;
    }, SLOW_POLL)
    .toBe(0);
  if (await findIn(rpc, account, "inbox", TARGET)) return;
  const archived = await findIn(rpc, account, "archive", TARGET);
  if (archived) await rpc("mail.messages.restore", { ...scope(account), id: archived.id });
  await expect.poll(async () => findIn(rpc, account, "inbox", TARGET), SLOW_POLL).toBeDefined();
}

async function addRecipient(page: Page) {
  const box = composer(page);
  await box.getByRole("combobox", { name: "To recipients" }).fill(OUTSIDE);
  await page.keyboard.press("Enter");
  await expect(box.getByRole("toolbar").getByText(OUTSIDE, { exact: true })).toBeVisible();
}

async function closeComposer(page: Page) {
  const box = composer(page);
  if ((await box.count()) > 0) await box.getByRole("button", { name: "Close compose" }).click();
  await expect(box).toHaveCount(0);
}

async function discardDrafts(rpc: Rpc, account: Account, subject: string) {
  let absent = 0;
  await expect
    .poll(
      async () => {
        const draft = await findIn(rpc, account, "drafts", subject);
        if (draft) {
          absent = 0;
          await rpc("mail.drafts.delete", {
            ...scope(account),
            draftId: draft.id,
          });
          return false;
        }
        absent += 1;
        return absent >= 2;
      },
      { intervals: [2_000] },
    )
    .toBe(true);
}

function recordSends(page: Page): string[] {
  const sends: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/rpc/mail/messages/send")) {
      sends.push(request.url());
    }
  });
  return sends;
}

async function undoSend(page: Page) {
  const hold = toasts(page).getByText(/^Sending in \d+s…$/);
  await expect(hold).toBeVisible();
  await toasts(page).getByRole("button", { name: "Undo", exact: true }).click();
  await expect(hold).toBeHidden();
}

export default function mailSpecs() {
  test("star and unstar", async ({ page, rpc, account }) => {
    await openTarget(page, account);
    const toolbar = messageToolbar(page);
    await toolbar.getByRole("button", { name: "Star", exact: true }).click();
    await expect(toolbar.getByRole("button", { name: "Starred", exact: true })).toBeVisible();
    await expect
      .poll(async () => (await findIn(rpc, account, "inbox", TARGET))?.isStarred)
      .toBe(true);
    await toolbar.getByRole("button", { name: "Starred", exact: true }).click();
    await expect(toolbar.getByRole("button", { name: "Star", exact: true })).toBeVisible();
    await expect
      .poll(async () => (await findIn(rpc, account, "inbox", TARGET))?.isStarred)
      .toBe(false);
  });

  test("mark unread and read", async ({ page, rpc, account }) => {
    await openTarget(page, account);
    await page.getByRole("heading", { level: 2, name: TARGET }).click();
    await page.keyboard.press("m");
    await page.keyboard.press("u");
    await expect
      .poll(async () => (await findIn(rpc, account, "inbox", TARGET))?.isRead)
      .toBe(false);
    await page.keyboard.press("m");
    await page.keyboard.press("u");
    await expect.poll(async () => (await findIn(rpc, account, "inbox", TARGET))?.isRead).toBe(true);
  });

  test("archive and restore", async ({ page, rpc, account }) => {
    await openTarget(page, account);
    await messageToolbar(page).getByRole("button", { name: "Archive", exact: true }).click();
    await expect(mailRow(page, TARGET)).toHaveCount(0);
    await expect.poll(async () => findIn(rpc, account, "archive", TARGET)).toBeDefined();
    await openTarget(page, account, "archive");
    await expect(
      messageToolbar(page).getByRole("button", {
        name: "Archive",
        exact: true,
      }),
    ).toBeVisible();
    const archived = await findIn(rpc, account, "archive", TARGET);
    await rpc("mail.messages.restore", { ...scope(account), id: archived?.id });
    await expect.poll(async () => findIn(rpc, account, "inbox", TARGET)).toBeDefined();
  });

  test("delete and restore from Trash", async ({ page, rpc, account }) => {
    await openTarget(page, account);
    await messageToolbar(page).getByRole("button", { name: "Delete", exact: true }).click();
    await confirmDialog(page, "Delete this email?")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(mailRow(page, TARGET)).toHaveCount(0);
    await expect.poll(async () => findIn(rpc, account, "trash", TARGET)).toBeDefined();
    await openTarget(page, account, "trash");
    await messageToolbar(page).getByRole("button", { name: "Restore", exact: true }).click();
    await expect.poll(async () => findIn(rpc, account, "inbox", TARGET)).toBeDefined();
    await expect.poll(async () => findIn(rpc, account, "trash", TARGET)).toBeUndefined();
  });

  test("mute hides the thread from the inbox, and unmute brings it back", async ({
    page,
    rpc,
    account,
  }) => {
    const target = await findIn(rpc, account, "inbox", TARGET);
    expect(target?.threadId).toBeTruthy();
    await openTarget(page, account);
    const toolbar = messageToolbar(page);
    const toggle = async (from: "Mute" | "Unmute") => {
      const saved = page.waitForResponse(`**/rpc/mail/mute/${from === "Mute" ? "add" : "remove"}`);
      await toolbar.getByRole("button", { name: from, exact: true }).click();
      expect((await saved).ok()).toBe(true);
      await expect(
        toolbar.getByRole("button", {
          name: from === "Mute" ? "Unmute" : "Mute",
          exact: true,
        }),
      ).toBeVisible();
    };
    try {
      await toggle("Mute");
      await expect(mailRow(page, TARGET)).toHaveCount(0);
      await toggle("Unmute");
      await expect(mailRow(page, TARGET)).toBeVisible();

      await toggle("Mute");
      await page.reload();
      await showTab(page, "All");
      await expect(mailRow(page, "Rebrand kickoff")).toBeVisible();
      await expect(mailRow(page, TARGET)).toHaveCount(0);
    } finally {
      await rpc("mail.mute.remove", {
        ...scope(account),
        threadIds: [target?.threadId],
      });
    }
    await page.reload();
    await showTab(page, "All");
    await expect(mailRow(page, TARGET)).toBeVisible();
  });

  test("read later and remove", async ({ page, account }) => {
    await openTarget(page, account);
    const toolbar = messageToolbar(page);
    const added = page.waitForResponse("**/rpc/mail/readLater/add");
    await toolbar.getByRole("button", { name: "Read later", exact: true }).click();
    await expect(toolbar.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
    expect((await added).ok()).toBe(true);
    await goToFolder(page, account, "read-later");
    await expect(page.getByRole("heading", { level: 1, name: "Read later" })).toBeVisible();
    await expect(mailRow(page, TARGET)).toBeVisible();
    await openMail(page, TARGET);
    await page.waitForLoadState("networkidle");
    const removed = page.waitForResponse("**/rpc/mail/readLater/remove");
    await toolbar.getByRole("button", { name: "Saved", exact: true }).click();
    expect((await removed).ok()).toBe(true);
    await expect(mailRow(page, TARGET)).toHaveCount(0);
    const listed = page.waitForResponse("**/rpc/mail/readLater/list");
    await page.reload();
    expect((await listed).ok()).toBe(true);
    await expect(page.getByRole("heading", { level: 1, name: "Read later" })).toBeVisible();
    await expect(mailRow(page, TARGET)).toHaveCount(0);
  });

  test("a user label replaces the AI label, and clearing it brings the AI label back", async ({
    page,
    rpc,
    account,
  }) => {
    await openTarget(page, account);
    const labelButton = messageToolbar(page).getByRole("button", {
      name: "Change label",
    });
    await expect(labelButton).toHaveText(new RegExp(`^(${BUILT_IN_LABELS.join("|")})$`));
    const aiLabel = (await labelButton.innerText()).trim();
    const userLabel = aiLabel === "Personal" ? "Social" : "Personal";
    const target = await findIn(rpc, account, "inbox", TARGET);
    const clear = () =>
      rpc("mail.labels.clearOnMessage", {
        ...scope(account),
        id: target?.id,
      });
    const saved = page.waitForResponse("**/rpc/mail/labels/setOnMessage");
    await labelButton.click();
    await page
      .getByRole("menu", { name: "Change label" })
      .getByRole("menuitem", { name: userLabel, exact: true })
      .click();
    try {
      await expect(labelButton).toHaveText(userLabel);
      expect((await saved).ok()).toBe(true);

      await clear();
      await page.reload();
      await showTab(page, "All");
      await openMail(page, TARGET);
      await expect(labelButton).toHaveText(aiLabel);
    } finally {
      await clear();
    }
  });

  test("compose and send to an outside address, then undo within the 5 s hold", async ({
    page,
    rpc,
    account,
  }, testInfo) => {
    const subject = uniqueName(testInfo);
    await goToFolder(page, account);
    await compose(page, subject);
    const sends = recordSends(page);
    await composer(page).getByRole("button", { name: "Send", exact: true }).click();
    await undoSend(page);
    await expect(composer(page).getByRole("textbox", { name: "Subject line…" })).toHaveValue(
      subject,
    );
    await page.waitForTimeout(6_000);
    expect(sends).toEqual([]);
    await closeComposer(page);
    await discardDrafts(rpc, account, subject);
  });

  test("Enter adds a typed contact's full address as a chip", async ({
    page,
    rpc,
    account,
  }, testInfo) => {
    const subject = uniqueName(testInfo);
    const address = PEOPLE.kenji.email;
    await goToFolder(page, account);
    await folders(page).getByRole("button", { name: "Compose", exact: true }).click();
    const box = composer(page);
    await box.getByRole("textbox", { name: "Subject line…" }).fill(subject);
    await box.getByRole("combobox", { name: "To recipients" }).fill(address);
    await page.keyboard.press("Enter");
    await expect(box.getByRole("toolbar").getByText(address, { exact: true })).toBeVisible();
    await expect(box.getByRole("combobox", { name: "To recipients" })).toHaveValue("");
    await closeComposer(page);
    await discardDrafts(rpc, account, subject);
  });

  test("send later, then cancel the scheduled send", async ({ page, rpc, account }, testInfo) => {
    const subject = uniqueName(testInfo);
    await goToFolder(page, account);
    await compose(page, subject);
    const box = composer(page);
    await box.getByRole("button", { name: "Schedule send" }).click();
    await page
      .getByRole("menu", { name: "Schedule send" })
      .getByRole("menuitem", { name: "In 1 hour", exact: true })
      .click();
    await box.getByRole("button", { name: /^Send .+/ }).click();
    await expect(box).toHaveCount(0);

    await goToFolder(page, account, "scheduled");
    const pending = scheduledRow(page, subject);
    await expect(pending).toContainText(`To: ${OUTSIDE}`);
    await pending.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(pending).toHaveCount(0);
    await discardDrafts(rpc, account, subject);
  });

  test("snooze with a short wake and see the message return", async ({ page, rpc, account }) => {
    const target = await findIn(rpc, account, "inbox", TARGET);
    await rpc("mail.messages.snooze", {
      ...scope(account),
      id: target?.id,
      wakeAt: new Date(Date.now() + 15_000).toISOString(),
    });
    try {
      await expect
        .poll(async () => findIn(rpc, account, "inbox", TARGET), {
          timeout: 10_000,
        })
        .toBeUndefined();
      await goToFolder(page, account, "snoozed");
      await expect(page.getByRole("main").getByText(TARGET, { exact: true })).toBeVisible();
      await expect
        .poll(async () => findIn(rpc, account, "inbox", TARGET), {
          timeout: 90_000,
          intervals: [2_000],
        })
        .toBeDefined();
    } finally {
      await unstrand(rpc, account);
    }
  });

  test("snooze from the toolbar, then wake it from Snoozed", async ({ page, rpc, account }) => {
    await openTarget(page, account);
    try {
      await messageToolbar(page).getByRole("button", { name: "Snooze" }).click();
      const snoozed = page.waitForResponse("**/rpc/mail/messages/snooze");
      await page
        .getByRole("menu", { name: "Snooze" })
        .getByRole("menuitem", { name: "Tomorrow 9 AM", exact: true })
        .click();
      await expect(mailRow(page, TARGET)).toHaveCount(0);
      expect((await snoozed).ok()).toBe(true);
      await snoozeArmed(rpc, account, TARGET);
      await goToFolder(page, account, "snoozed");
      const row = snoozedRow(page, TARGET);
      await expect(row).toContainText("Returns");
      await row.getByRole("button", { name: "Wake now", exact: true }).click();
      await expect(row).toHaveCount(0);
      await expect.poll(async () => findIn(rpc, account, "inbox", TARGET), SLOW_POLL).toBeDefined();
    } finally {
      await unstrand(rpc, account);
    }
  });

  test("snooze to a picked date and time, then wake it from Snoozed", async ({
    page,
    rpc,
    account,
  }) => {
    const wake = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const value = `${wake.toISOString().slice(0, 10)}T10:00`;
    await openTarget(page, account);
    try {
      await messageToolbar(page).getByRole("button", { name: "Snooze" }).click();
      await page
        .getByRole("menu", { name: "Snooze" })
        .getByRole("menuitem", { name: "Pick date & time…", exact: true })
        .click();
      await page.getByLabel("When it comes back").fill(value);
      const snoozed = page.waitForResponse("**/rpc/mail/messages/snooze");
      await page.getByRole("button", { name: "Confirm snooze", exact: true }).click();
      await expect(mailRow(page, TARGET)).toHaveCount(0);
      expect((await snoozed).ok()).toBe(true);
      await snoozeArmed(rpc, account, TARGET);
      await goToFolder(page, account, "snoozed");
      const row = snoozedRow(page, TARGET);
      await expect(row).toContainText("Returns");
      await row.getByRole("button", { name: "Wake now", exact: true }).click();
      await expect(row).toHaveCount(0);
      await expect.poll(async () => findIn(rpc, account, "inbox", TARGET), SLOW_POLL).toBeDefined();
    } finally {
      await unstrand(rpc, account);
    }
  });

  test("save an attachment to a drive, then delete the file", async ({ page, rpc, account }) => {
    const invite = "Invitation: Rebrand review @ Thu Oct 8, 2026 15:00 UTC";
    const drive = {
      workspaceSlug: account.workspaceSlug,
      driveSlug: account.driveSlugs.webdav,
    };
    const savedFiles = async () =>
      (
        await rpc<{ entries: { id: string; name: string }[] }>("drive.search", {
          ...drive,
          query: "invite.ics",
        })
      ).entries.filter((e) => e.name === "invite.ics");
    await openTarget(page, account, "inbox", invite);
    try {
      await page
        .getByRole("main")
        .getByRole("button", {
          name: "Save invite.ics to a drive",
          exact: true,
        })
        .click();
      const picker = page.getByRole("dialog", { name: "Save to Drive" });
      await pickDrive(picker, rpc, account, account.driveSlugs.webdav ?? "");
      await picker.getByRole("button", { name: "Team", exact: true }).click();
      await picker.getByRole("button", { name: "Save here", exact: true }).click();
      await expect(
        toasts(page).getByText("Saved invite.ics to Team", { exact: true }),
      ).toBeVisible();
      expect(await savedFiles()).toHaveLength(1);
    } finally {
      for (const file of await savedFiles()) {
        await rpc("drive.delete", { ...drive, fileId: file.id });
      }
    }
  });

  test("Link a file from Drive is not offered when no drive has shareable links", async ({
    page,
    rpc,
    account,
  }, testInfo) => {
    const subject = uniqueName(testInfo);
    await goToFolder(page, account);
    await compose(page, subject);
    try {
      await expect(composer(page).getByRole("button", { name: "Attach files" })).toBeVisible();
      await expect(
        composer(page).getByRole("button", { name: "Link a file from Drive" }),
      ).toHaveCount(0);
    } finally {
      await page.keyboard.press("Escape");
      await closeComposer(page);
      await discardDrafts(rpc, account, subject);
    }
    expect(await findIn(rpc, account, "sent", subject)).toBeUndefined();
  });

  test("create and delete a custom label in the sidebar", async ({ page, account }, testInfo) => {
    const name = uniqueName(testInfo);
    await goToFolder(page, account);
    const sidebar = folders(page);
    await sidebar.getByRole("button", { name: "Add custom label" }).click();
    await sidebar.getByRole("textbox", { name: "Label name" }).fill(name);
    await sidebar.getByRole("button", { name: "Add label", exact: true }).click();
    const link = sidebar.getByRole("link", { name, exact: true });
    await expect(link).toBeVisible();
    await link.hover();
    await sidebar.getByRole("button", { name: `Delete label ${name}` }).click();
    await confirmDialog(page, "Delete this label?")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(link).toHaveCount(0);
    await page.reload();
    await expect(sidebar.getByRole("link", { name: "Clients", exact: true })).toBeVisible();
    await expect(link).toHaveCount(0);
  });

  test("forward to an outside address, then undo within the 5 s hold", async ({
    page,
    rpc,
    account,
  }) => {
    await openTarget(page, account);
    await messageToolbar(page).getByRole("button", { name: "Forward", exact: true }).click();
    const box = composer(page);
    await addRecipient(page);
    const subjectBox = box.getByRole("textbox", { name: "Subject line…" });
    await expect(subjectBox).toHaveValue(`Fwd: ${TARGET}`);
    const sends = recordSends(page);
    await box.getByRole("button", { name: "Send", exact: true }).click();
    await undoSend(page);
    await page.waitForTimeout(6_000);
    expect(sends).toEqual([]);
    await closeComposer(page);
    await discardDrafts(rpc, account, `Fwd: ${TARGET}`);
  });

  test("select two messages and mark them unread, then read, in bulk", async ({
    page,
    rpc,
    account,
  }) => {
    const subjects = [TARGET, "Your order A-42 has shipped"];
    await goToFolder(page, account);
    await showTab(page, "All");
    const select = async () => {
      for (const subject of subjects) {
        await mailRow(page, subject).getByRole("button", { name: "Select", exact: true }).click();
      }
      await expect(bulkToolbar(page)).toContainText("2 selected");
    };
    await select();
    await bulkToolbar(page).getByRole("button", { name: "Unread", exact: true }).click();
    for (const subject of subjects) {
      await expect
        .poll(async () => (await findIn(rpc, account, "inbox", subject))?.isRead)
        .toBe(false);
    }
    await expect(bulkToolbar(page)).toHaveCount(0);
    await select();
    await bulkToolbar(page).getByRole("button", { name: "Read", exact: true }).click();
    for (const subject of subjects) {
      await expect
        .poll(async () => (await findIn(rpc, account, "inbox", subject))?.isRead)
        .toBe(true);
    }
  });

  test.describe("malformed and oversized mail", () => {
    test.skip(!env.edge, "the edge-case seed is off");

    test("edge mail opens and renders without breaking the page", async ({
      page,
      rpc,
      account,
    }) => {
      test.setTimeout(15 * 60_000);
      const dialogs: string[] = [];
      page.on("dialog", (dialog) => {
        dialogs.push(dialog.message());
        void dialog.dismiss();
      });
      const outside: string[] = [];
      page.on("request", (req) => {
        if (new URL(req.url()).hostname.endsWith(".invalid")) outside.push(req.url());
      });

      await setMailboxAi(rpc, account, false);
      try {
        await page.goto(mailPath(account));
        await showTab(page, "All");
        const title = await page.title();
        for (const [query, subject] of RENDERED) {
          await test.step(subject, async () => {
            await searchAndOpen(page, query, subject);
            await page.waitForLoadState("networkidle");
            expect(await page.title(), subject).toBe(title);
            expect(page.url(), subject).toContain(mailPath(account));
          });
        }
        expect(dialogs).toEqual([]);
        expect(outside).toEqual([]);
      } finally {
        await setMailboxAi(rpc, account, true);
      }
    });

    test("hostile HTML renders in a frame without scripts, forms or navigation", async ({
      page,
      rpc,
      account,
    }) => {
      await setMailboxAi(rpc, account, false);
      try {
        await page.goto(mailPath(account));
        await showTab(page, "All");
        await searchAndOpen(page, "html-hostile");
        const frame = page.getByRole("main").locator("iframe");
        await expect(frame).toBeAttached();
        const sandbox = (await frame.getAttribute("sandbox")) ?? "";
        expect(sandbox).not.toContain("allow-scripts");
        expect(sandbox).not.toContain("allow-forms");
        expect(sandbox).not.toContain("allow-top-navigation");
        const body = frame.contentFrame().locator("body");
        await expect(body).toContainText("Click to confirm");
        await expect(body.locator("script")).toHaveCount(0);
        await expect(body.locator("form")).toHaveCount(0);
      } finally {
        await setMailboxAi(rpc, account, true);
      }
    });
  });
}
