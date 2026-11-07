import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { expect, type Locator, type Page, type Response } from "@playwright/test";
import { z } from "zod";

export type ChatEndpoint =
  | "chat"
  | "calendar-chat"
  | "drive-chat"
  | "contacts-chat"
  | "workspace-chat";

const CHAT_LIMIT = 15;
const CHAT_WINDOW_MS = 60_000;
const CHAT_MARGIN_MS = 1_000;
const RATE_SCOPE: Record<ChatEndpoint, string> = {
  chat: "ai-chat",
  "calendar-chat": "ai-chat",
  "drive-chat": "ai-chat",
  "contacts-chat": "ai-chat",
  "workspace-chat": "ai-workspace-chat",
};
const PACING = new URL("../test-results/.chat-pacing.json", import.meta.url);

function readPacing(): Record<string, number[]> {
  if (!existsSync(PACING)) return {};
  return z.record(z.string(), z.array(z.number())).parse(JSON.parse(readFileSync(PACING, "utf8")));
}

export async function paceChat(endpoint: ChatEndpoint): Promise<void> {
  const scope = RATE_SCOPE[endpoint];
  const recent = (readPacing()[scope] ?? []).filter((at) => Date.now() - at < CHAT_WINDOW_MS);
  const oldest = recent[0];
  if (recent.length >= CHAT_LIMIT && oldest !== undefined) {
    const wait = oldest + CHAT_WINDOW_MS + CHAT_MARGIN_MS - Date.now();
    await new Promise((resolve) => setTimeout(resolve, wait));
    recent.shift();
  }
  recent.push(Date.now());
  mkdirSync(new URL(".", PACING), { recursive: true });
  writeFileSync(PACING, JSON.stringify({ ...readPacing(), [scope]: recent }));
}

export function conversation(page: Page): Locator {
  return page.getByRole("log");
}

export function problem(page: Page): Locator {
  return conversation(page)
    .locator("div:has(> button)")
    .filter({ has: page.getByText(/^.+ hit a problem$/) });
}

export function chatResponse(page: Page, endpoint: ChatEndpoint): Promise<Response> {
  return page.waitForResponse(
    (res) =>
      res.request().method() === "POST" && new URL(res.url()).pathname === `/api/ai/${endpoint}`,
    { timeout: 120_000 },
  );
}

export async function settle(page: Page, res: Response): Promise<void> {
  await Promise.race([
    res.finished(),
    problem(page).getByRole("button", { name: "Retry" }).waitFor({ timeout: 120_000 }),
  ]);
}

export async function failure(page: Page): Promise<string | null> {
  if ((await problem(page).count()) === 0) return null;
  return (await problem(page).innerText()).replace(/\s+/g, " ").trim();
}

export async function ask(
  page: Page,
  input: Locator,
  endpoint: ChatEndpoint,
  text: string,
): Promise<void> {
  await paceChat(endpoint);
  const response = chatResponse(page, endpoint);
  await input.click();
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
  const res = await response;
  expect(res.status(), text).toBe(200);
  await settle(page, res);
}

export async function converse(
  page: Page,
  input: Locator,
  endpoint: ChatEndpoint,
  turns: readonly string[],
): Promise<void> {
  for (const turn of turns) {
    await ask(page, input, endpoint, turn);
    await expect(conversation(page).getByText(turn, { exact: true })).toBeVisible();
    const reported = await failure(page);
    if (reported) throw new Error(`turn "${turn}": ${reported}`);
  }
}
