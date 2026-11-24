import type { Page } from "@playwright/test";
import { z } from "zod";

import { type Account, rpc, totp } from "./app.ts";

export const stepSchema = z.union([
  z.strictObject({ goto: z.string() }),
  z.strictObject({ follow: z.string(), query: z.string().optional() }),
  z.strictObject({ click: z.string(), nth: z.number().optional() }),
  z.strictObject({ dblclick: z.string() }),
  z.strictObject({ rightClick: z.string() }),
  z.strictObject({ hover: z.string() }),
  z.strictObject({ fill: z.string(), value: z.string() }),
  z.strictObject({ type: z.string(), text: z.string() }),
  z.strictObject({ totp: z.string() }),
  z.strictObject({ press: z.string() }),
  z.strictObject({ drag: z.string(), to: z.string() }),
  z.strictObject({ waitFor: z.string() }),
  z.strictObject({ waitForHidden: z.string() }),
  z.strictObject({ wait: z.number() }),
  z.strictObject({ scroll: z.string() }),
  z.strictObject({ clearReadLater: z.literal(true) }),
]);
export type Step = z.infer<typeof stepSchema>;

function seeded(a: Account | undefined): Account {
  if (!a) throw new Error("this entry needs the web stack's account");
  return a;
}

export function resolve(path: string, account: Account | undefined): string {
  if (!path.includes("{")) return path;
  const a = seeded(account);
  return path
    .replaceAll("{workspace}", `/w/${a.workspaceSlug}`)
    .replaceAll("{mailbox}", a.mailboxSlug)
    .replaceAll("{calendar}", a.calendarSlug)
    .replace(/\{drive:([A-Za-z0-9-]+)\}/g, (_, kind: string) => {
      const slug = kind === "all" ? "all" : a.driveSlugs[kind];
      if (!slug) throw new Error(`no seeded drive "${kind}"`);
      return slug;
    });
}

const readLaterSchema = z.object({ messageIds: z.array(z.string()) });

async function clearReadLater(page: Page, a: Account) {
  const scope = { workspaceSlug: a.workspaceSlug, mailboxSlug: a.mailboxSlug };
  const { messageIds } = readLaterSchema.parse(await rpc(page, "mail/readLater/list", scope));
  await Promise.all(
    messageIds.map((messageId) => rpc(page, "mail/readLater/remove", { ...scope, messageId })),
  );
}

async function centerOf(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`${selector} has no box`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function drag(page: Page, from: string, to: string) {
  const start = await centerOf(page, from);
  const end = await centerOf(page, to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
}

export async function runStep(page: Page, step: Step, a: Account | undefined) {
  if ("clearReadLater" in step) await clearReadLater(page, seeded(a));
  else if ("goto" in step) await page.goto(resolve(step.goto, a));
  else if ("follow" in step) {
    const href = await page.locator(step.follow).first().getAttribute("href");
    if (!href) throw new Error(`${step.follow} has no href`);
    const url = new URL(href, page.url());
    if (step.query) url.search = step.query;
    await page.goto(url.href);
  } else if ("click" in step)
    await page
      .locator(step.click)
      .nth(step.nth ?? 0)
      .click();
  else if ("dblclick" in step) await page.locator(step.dblclick).first().dblclick();
  else if ("rightClick" in step)
    await page.locator(step.rightClick).first().click({ button: "right" });
  else if ("hover" in step) await page.locator(step.hover).first().hover();
  else if ("fill" in step) await page.locator(step.fill).first().fill(step.value);
  else if ("type" in step) {
    await page.locator(step.type).first().click();
    await page.keyboard.type(step.text);
  } else if ("totp" in step) {
    await page.locator(step.totp).first().click();
    await page.keyboard.type(await totp());
  } else if ("press" in step) await page.keyboard.press(step.press);
  else if ("drag" in step) await drag(page, step.drag, step.to);
  else if ("waitFor" in step)
    await page.locator(step.waitFor).first().waitFor({ state: "visible" });
  else if ("waitForHidden" in step)
    await page.locator(step.waitForHidden).first().waitFor({ state: "hidden" });
  else if ("wait" in step) await page.waitForTimeout(step.wait);
  else if ("scroll" in step) await page.locator(step.scroll).first().scrollIntoViewIfNeeded();
}
