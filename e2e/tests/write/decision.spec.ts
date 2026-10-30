import { APPROVAL_CHAT, GATED_SUBJECTS } from "@metis/e2e/lib/llm-scenarios";
import type { Page } from "@playwright/test";
import { z } from "zod";

import { ask, chatResponse, conversation, failure } from "../chat";
import { expect, test } from "../fixtures";
import { type Account, harness, mailPath, workspacePath } from "../harness";
import { mailList, mailRow, searchAndOpen, setMailboxAi, showTab } from "../mail";
import { labelMap, nodeOf, restoreLabels, runWorkflow, waitForRun } from "../workflow";

const TRIAGE = "Triage with the decision model";

async function hitsDuring(path: string, run: () => Promise<void>): Promise<number> {
  const before = (await harness.hits()).length;
  await run();
  return (await harness.hits()).slice(before).filter((h) => h.path === path).length;
}

async function retryFailedSteps(page: Page) {
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Retry failed steps", exact: true })
    .click();
  const confirm = page.getByRole("alertdialog", { name: "Retry this run?" });
  await confirm.getByRole("button", { name: "Retry failed steps", exact: true }).click();
  await expect(confirm).toBeHidden();
}

async function openTriage(page: Page, account: Account) {
  await page.goto(workspacePath(account, "/workflow"));
  await page.getByRole("complementary").getByRole("button", { name: TRIAGE, exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Workflow name" })).toHaveValue(TRIAGE);
}

export default function decisionSpecs() {
  test("Triage with the decision model: the Ask calls replay and each Branch routes by the recorded answers", async ({
    page,
    rpc,
    account,
  }) => {
    const before = await labelMap(rpc, account);
    try {
      const run = await runWorkflow(rpc, account, TRIAGE);
      expect(run.status).toBe("completed");
      const asked = nodeOf(run, "ask").items;
      expect(asked.length).toBeGreaterThan(0);
      for (const branch of ["act", "team", "urgency"]) {
        for (const item of nodeOf(run, branch).items) {
          expect(item.decision?.handle, `${branch} ${item.id}`).toBeTruthy();
        }
      }
      const todo = new Set(nodeOf(run, "todo").items.map((i) => i.itemKey));
      for (const item of nodeOf(run, "act").items) {
        expect(todo.has(item.itemKey), item.itemKey).toBe(item.decision?.handle === "yes");
      }
      await page.goto(workspacePath(account, `/workflow/history/${run.id}`));
      await expect(page.getByText("Path taken")).toBeVisible();
    } finally {
      await restoreLabels(rpc, account, before);
    }
  });

  test("Try on recent mail replays, and moving a threshold re-routes the preview without a new request", async ({
    page,
    account,
  }) => {
    await openTriage(page, account);
    const canvas = page.getByRole("application");
    const inspector = page.getByRole("region", { name: "Inspector" });
    await canvas.getByRole("group", { name: "Ask", exact: true }).click();
    await inspector.getByRole("button", { name: "Try on recent mail", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Try on recent mail" });
    await sheet.getByRole("button", { name: "Ask", exact: true }).click();
    const kickoff = sheet
      .locator("div:has(> span)")
      .filter({ has: page.getByText("Rebrand kickoff", { exact: true }) });
    await expect(kickoff.getByText("Q1:", { exact: true })).toBeVisible();
    await expect(sheet.getByText("That didn't go through. Try again.")).toHaveCount(0);

    const extra = await hitsDuring("/systemone", async () => {
      await canvas.getByRole("group", { name: "Branch", exact: true }).first().click();
      const yesThreshold = inspector
        .getByRole("group")
        .filter({ has: page.getByText(/^Yes when at least \d+%$/) })
        .filter({ hasNot: page.getByText(/^No when at most \d+%$/) });
      const label = yesThreshold.getByText(/^Yes when at least \d+%$/);
      const before = await label.innerText();
      await yesThreshold.getByRole("slider").focus();
      await page.keyboard.press("Home");
      await expect(label).not.toHaveText(before);
      await page.waitForLoadState("networkidle");
    });
    expect(extra).toBe(0);
  });

  test("a message the classifier was unsure about shows no label, and reloading sends no decision request for it", async ({
    page,
    account,
  }) => {
    await page.goto(mailPath(account));
    await showTab(page, "All");
    await expect(mailRow(page, "Rebrand kickoff")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const unlabeled = mailList(page).filter({
      hasNot: page.getByText(
        /^(Action Required|Work|Personal|Transactions|Updates|Newsletter|Promo|Social|Clients)$/,
      ),
    });
    await expect.poll(() => unlabeled.count()).toBeGreaterThan(0);

    const requests = await hitsDuring("/systemone", async () => {
      const labels = page.waitForResponse(/\/rpc\/mail\/labels\/getMap/);
      await page.reload();
      await labels;
      await showTab(page, "All");
      await page.waitForLoadState("networkidle");
    });
    expect(requests).toBe(0);
  });

  test("opening a thread the summary gate skipped shows no cards and sends no summarizer request", async ({
    page,
    account,
  }) => {
    await page.goto(mailPath(account));
    await showTab(page, "All");
    const skipped: string[] = [];
    for (const subject of GATED_SUBJECTS) {
      let smartReplies = 0;
      const countReplies = (res: import("@playwright/test").Response) => {
        if (res.url().includes("/rpc/ai/smartReplies") && res.ok()) smartReplies++;
      };
      page.on("response", countReplies);
      let spec: unknown;
      const completions = await hitsDuring("/chat/completions", async () => {
        const summary = page.waitForResponse(/\/rpc\/ai\/threadSummary/, {
          timeout: 60_000,
        });
        await searchAndOpen(page, subject);
        spec = z
          .object({ json: z.object({ spec: z.unknown() }) })
          .parse(await (await summary).json()).json.spec;
        await page.waitForLoadState("networkidle");
      });
      page.off("response", countReplies);
      if (spec === null) {
        skipped.push(subject);
        await expect(
          page.getByRole("main").getByText("No summary for this email", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(page.getByRole("main").getByText("TL;DR", { exact: true })).toHaveCount(0);
        expect(completions - smartReplies, `${subject}: summarizer calls`).toBe(0);
      }
    }
    expect(skipped).toEqual(GATED_SUBJECTS);
  });

  test("with AI off for the mailbox an Ask run is blocked, and retrying after turning AI on completes it", async ({
    page,
    rpc,
    account,
  }) => {
    const before = await labelMap(rpc, account);
    await setMailboxAi(rpc, account, false);
    let runId = "";
    try {
      const run = await runWorkflow(rpc, account, TRIAGE);
      runId = run.id;
      expect(["blocked", "failed", "partial"]).toContain(run.status);
      const blocked = nodeOf(run, "ask")
        .items.map((i) => i.error ?? "")
        .join(" ");
      expect(`${run.error ?? ""} ${blocked}`).toContain("AI is turned off for this mailbox");
    } finally {
      await setMailboxAi(rpc, account, true);
    }
    try {
      await page.goto(workspacePath(account, `/workflow/history/${runId}`));
      await retryFailedSteps(page);
      const done = await waitForRun(rpc, account, runId);
      expect(done.status).toBe("completed");
    } finally {
      await restoreLabels(rpc, account, before);
    }
  });

  test("an approval-gated write: the workspace agent creates a drive folder once approved", async ({
    page,
    rpc,
    account,
  }) => {
    const driveSlug = account.driveSlugs[APPROVAL_CHAT.drive] ?? "";
    const scope = { workspaceSlug: account.workspaceSlug, driveSlug };
    const approvalFolder = async () =>
      (
        await rpc<{ entries: { id: string; name: string }[] }>("drive.list", {
          ...scope,
          parentId: APPROVAL_CHAT.parentFolder,
        })
      ).entries.find((e) => e.name === APPROVAL_CHAT.folder);
    try {
      await page.goto(workspacePath(account, "/assistant"));
      const composer = page
        .getByRole("group")
        .filter({ hasText: "Sensitive actions ask for approval" })
        .getByRole("textbox");
      await ask(page, composer, "workspace-chat", APPROVAL_CHAT.turn);
      expect(await failure(page)).toBeNull();

      const continued = chatResponse(page, "workspace-chat");
      await conversation(page).getByRole("button", { name: "Approve", exact: true }).click();
      await (await continued).body();

      expect(await approvalFolder()).toBeDefined();
    } finally {
      const folder = await approvalFolder();
      if (folder) await rpc("drive.delete", { ...scope, fileId: folder.id });
    }
  });
}
