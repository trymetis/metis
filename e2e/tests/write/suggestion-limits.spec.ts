import type { Page } from "@playwright/test";

import { RpcError } from "../../clients/rpc";
import { expect, test } from "../fixtures";
import { workspacePath } from "../harness";
import { searchDialog, typeQuery, openSearch } from "../search";

const SEARCH_SUGGEST_PER_MINUTE = 240;
const REFERENCE_SUGGEST_PER_MINUTE = 240;
const LIMIT_WINDOW_MS = 70_000;

async function exhaust(call: () => Promise<unknown>, perMinute: number): Promise<void> {
  for (let i = 0; i <= 2 * perMinute; i++) {
    try {
      await call();
    } catch (err) {
      if (err instanceof RpcError && err.status === 429) return;
      throw err;
    }
  }
  throw new Error(`no 429 after ${2 * perMinute + 1} calls`);
}

async function waitForReset(call: () => Promise<unknown>): Promise<void> {
  await expect
    .poll(
      async () => {
        try {
          await call();
          return true;
        } catch (err) {
          if (err instanceof RpcError && err.status === 429) return false;
          throw err;
        }
      },
      { timeout: LIMIT_WINDOW_MS, intervals: [5_000] },
    )
    .toBe(true);
}

function assistantComposer(page: Page) {
  return page
    .getByRole("group")
    .filter({ hasText: "Sensitive actions ask for approval" })
    .getByRole("textbox");
}

export default function suggestionLimitSpecs() {
  test("search suggestions past their limit say how long to wait", async ({
    page,
    rpc,
    account,
  }) => {
    const suggest = () =>
      rpc("search.suggest", { workspaceSlug: account.workspaceSlug, key: "mailbox", prefix: "" });
    await exhaust(suggest, SEARCH_SUGGEST_PER_MINUTE);
    try {
      await page.goto(workspacePath(account, "/assistant"));
      await openSearch(page);
      await typeQuery(page, "mailbox:");
      await expect(searchDialog(page).getByRole("status")).toHaveText(
        /^Too many suggestions\. Try again in /,
      );

      await searchDialog(page).getByRole("button", { name: "In a resource" }).click();
      await expect(page.getByRole("menu").getByRole("status")).toHaveText(
        /^Too many suggestions\. Try again in /,
      );
    } finally {
      await waitForReset(suggest);
    }
  });

  test("past its limit the @ picker stays closed, so @ is plain text", async ({
    page,
    rpc,
    account,
  }) => {
    const suggest = () =>
      rpc("agentReferences.suggest", { workspaceSlug: account.workspaceSlug, query: "brief" });
    await exhaust(suggest, REFERENCE_SUGGEST_PER_MINUTE);
    try {
      await page.goto(workspacePath(account, "/assistant"));
      await assistantComposer(page).click();
      const refused = page.waitForResponse(
        (res) => new URL(res.url()).pathname === "/rpc/agentReferences/suggest",
      );
      await page.keyboard.type("@brief");
      expect((await refused).status()).toBe(429);
      await expect(page.getByRole("listbox", { name: "Insert a reference" })).toHaveCount(0);
      await expect(assistantComposer(page)).toHaveText("@brief");

      const asked: string[] = [];
      page.on("request", (req) => {
        if (new URL(req.url()).pathname === "/rpc/agentReferences/suggest") asked.push(req.url());
      });
      await page.keyboard.type(" @draft");
      await expect(assistantComposer(page)).toHaveText("@brief @draft");
      await expect(page.getByRole("listbox", { name: "Insert a reference" })).toHaveCount(0);
      expect(asked).toEqual([]);
    } finally {
      await waitForReset(suggest);
    }
  });
}
