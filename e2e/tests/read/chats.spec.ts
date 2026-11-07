import {
  CALENDAR_CHAT,
  CONTACTS_CHAT,
  DRIVE_CHAT,
  MAIL_CHAT,
  REFERENCE_CHAT,
  WORKSPACE_CHATS,
} from "@metis/e2e/lib/llm-scenarios";
import type { Page } from "@playwright/test";

import { calendarAgent, chooseView } from "../calendar";
import { chatResponse, conversation, converse, failure, paceChat, settle } from "../chat";
import { expect, type Rpc, test } from "../fixtures";
import { type Account, calendarPath, drivePath, mailPath, workspacePath } from "../harness";
import { mailAgent } from "../mail";

test.describe.configure({ mode: "default", timeout: 10 * 60_000 });

function composer(page: Page) {
  return page
    .getByRole("group")
    .filter({ hasText: "Sensitive actions ask for approval" })
    .getByRole("textbox");
}

async function deleteOpenThread(page: Page, rpc: Rpc, account: Account) {
  const match = new URL(page.url()).pathname.match(/\/assistant\/([^/]+)$/);
  if (!match?.[1]) return;
  await rpc("assistant.deleteThread", {
    workspaceSlug: account.workspaceSlug,
    threadId: match[1],
  });
}

test("the mail chat replays its scripted turns", async ({ page, account }) => {
  await page.goto(mailPath(account, MAIL_CHAT.folder));
  await page.getByRole("main").getByRole("button", { name: "Toggle AI agent" }).click();
  const agent = mailAgent(page);
  await agent.getByRole("button", { name: "Attach an email" }).click();
  await page
    .getByRole("listbox", { name: "Suggestions" })
    .getByRole("option")
    .filter({ has: page.getByText(MAIL_CHAT.attachedSubject, { exact: true }) })
    .click();
  await converse(
    page,
    agent.getByRole("textbox", { name: "Ask about your emails…" }),
    "chat",
    MAIL_CHAT.turns,
  );
});

test("the calendar chat replays its scripted turns", async ({ page, account }) => {
  await page.clock.setFixedTime(new Date(CALENDAR_CHAT.date));
  await page.goto(calendarPath(account));
  await chooseView(page, "Week");
  await page.getByRole("banner").getByRole("button", { name: "Calendar AI" }).click();
  await converse(
    page,
    calendarAgent(page).getByRole("textbox", {
      name: "Ask about your calendar…",
    }),
    "calendar-chat",
    CALENDAR_CHAT.turns,
  );
});

test("the drive chats replay their scripted turns", async ({ page, account }) => {
  for (const kind of Object.keys(account.driveSlugs)) {
    await test.step(kind, async () => {
      await page.goto(drivePath(account, kind));
      await expect(
        page.getByRole("navigation", { name: "breadcrumb" }).locator('[aria-current="page"]'),
      ).not.toHaveText("Drive");
      await page.getByRole("button", { name: "Drive AI", exact: true }).click();
      await converse(
        page,
        page.getByRole("group").getByRole("textbox", { name: "Ask about these files…" }),
        "drive-chat",
        kind === DRIVE_CHAT.conversationDrive ? DRIVE_CHAT.turns : DRIVE_CHAT.turns.slice(0, 1),
      );
    });
  }
});

test("the contacts chat replays its scripted turns", async ({ page, account }) => {
  await page.goto(workspacePath(account, "/p/all/all"));
  await page.getByRole("banner").getByRole("button", { name: "Contacts AI" }).click();
  await converse(
    page,
    page.getByRole("textbox", { name: "Ask about your contacts…" }),
    "contacts-chat",
    CONTACTS_CHAT.turns,
  );
});

test("contact, member and address-book chips are sent, and open what they name", async ({
  page,
  rpc,
  account,
}) => {
  await page.goto(workspacePath(account, "/assistant"));
  const input = composer(page);
  await input.click();
  const picker = page.getByRole("listbox", { name: "Insert a reference" });
  for (const pick of REFERENCE_CHAT.picks) {
    await page.keyboard.type(`@${pick.query}`);
    await picker.getByRole("option", { name: new RegExp(`^${pick.label}`) }).click();
    await expect(picker).toBeHidden();
  }
  await expect(input).toContainText("Raj Mehta");
  await paceChat("workspace-chat");
  const response = chatResponse(page, "workspace-chat");
  await page.keyboard.type(REFERENCE_CHAT.question);
  await page.keyboard.press("Enter");
  const res = await response;
  try {
    expect(res.status()).toBe(200);
    await settle(page, res);
    expect(await failure(page)).toBeNull();
    const log = conversation(page);

    await log.getByRole("button", { name: "Show Ana Silva", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "Preview of Ana Silva" });
    await expect(panel.getByText(account.email, { exact: true }).first()).toBeVisible();
    await expect(panel.getByText("Recent mail with them")).toBeVisible();
    await panel.getByRole("button", { name: "Close preview" }).click();
    await expect(panel).toBeHidden();

    const bookChip = log.locator('[data-reference-chip="addressbook"]');
    await expect(bookChip).toHaveText("Studio contacts");
    await expect(log.getByRole("button").filter({ has: bookChip })).toHaveCount(0);

    await log.getByRole("button", { name: "Open contact Raj Mehta", exact: true }).click();
    await expect(page).toHaveURL(/\/p\/all\/all\/[^/]+$/);
    await expect(page.getByRole("article", { name: "Raj Mehta" })).toBeVisible();
  } finally {
    await page.goBack();
    await deleteOpenThread(page, rpc, account);
  }
});

test("the workspace chat replays its scripted turns", async ({ page, rpc, account }) => {
  await page.goto(workspacePath(account, "/assistant"));
  try {
    await converse(page, composer(page), "workspace-chat", WORKSPACE_CHATS.live);
  } finally {
    await deleteOpenThread(page, rpc, account);
  }
});

test("the suggestion chips replay", async ({ page, rpc, account }) => {
  for (const [chip] of WORKSPACE_CHATS.liveChips) {
    await test.step(chip, async () => {
      await page.goto(workspacePath(account, "/assistant"));
      await paceChat("workspace-chat");
      const response = chatResponse(page, "workspace-chat");
      await conversation(page).getByRole("button", { name: chip, exact: true }).click();
      const res = await response;
      expect(res.status()).toBe(200);
      try {
        await settle(page, res);
        await expect(page).toHaveURL(new RegExp(`${workspacePath(account, "/assistant")}/.+`));
        await expect(conversation(page).getByText(chip, { exact: true })).toBeVisible();
        expect(await failure(page)).toBeNull();
      } finally {
        await deleteOpenThread(page, rpc, account);
      }
    });
  }
});

test("the @ picker inserts a chip that resolves", async ({ page, rpc, account }) => {
  const { drives } = await rpc<{
    drives: { slug: string; server: string | null }[];
  }>("workspaceDrives.list", { workspaceSlug: account.workspaceSlug });
  const webdav = drives.find((d) => d.slug === account.driveSlugs.webdav);
  expect(webdav?.server).toBeTruthy();
  await page.goto(workspacePath(account, "/assistant"));
  await composer(page).click();
  await page.keyboard.type("@brief");
  const picker = page.getByRole("listbox", { name: "Insert a reference" });
  const option = picker.getByRole("option", {
    name: `brief.md ${webdav?.server}`,
    exact: true,
  });
  await option.click();
  await expect(picker).toBeHidden();
  await expect(composer(page)).toHaveText("brief.md");
});

async function storedThreadTitle(rpc: Rpc, account: Account): Promise<string> {
  const scope = { workspaceSlug: account.workspaceSlug };
  const { threads } = await rpc<{ threads: { id: string; title: string }[] }>(
    "assistant.listThreads",
    scope,
  );
  for (const thread of threads) {
    const { messages } = await rpc<{
      messages: { role: string; parts: { type: string; text?: string }[] }[];
    }>("assistant.threadMessages", { ...scope, threadId: thread.id });
    const first = messages.find((m) => m.role === "user");
    if (first?.parts.some((p) => p.text === WORKSPACE_CHATS.stored[0])) return thread.title;
  }
  throw new Error("the stored assistant thread is not seeded");
}

test("the stored assistant thread opens without a model call", async ({ page, rpc, account }) => {
  const title = await storedThreadTitle(rpc, account);
  const chatRequests: string[] = [];
  page.on("request", (req) => {
    if (new URL(req.url()).pathname.startsWith("/api/ai/")) chatRequests.push(req.url());
  });
  await page.goto(workspacePath(account, "/assistant"));
  await page
    .getByRole("complementary")
    .getByRole("link")
    .filter({ has: page.getByText(title, { exact: true }) })
    .click();
  const log = conversation(page);
  await expect(log.getByText(WORKSPACE_CHATS.stored[0] ?? "", { exact: true })).toBeVisible();
  await expect(log.getByText(WORKSPACE_CHATS.stored.at(-1) ?? "", { exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(chatRequests).toEqual([]);
});
