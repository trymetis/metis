import { readdirSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { type Browser, chromium, type Page } from "@playwright/test";
import { z } from "zod";

const APP = process.env.DOCS_APP_URL ?? "http://localhost:3000";
const HARNESS = process.env.DOCS_HARNESS_URL ?? "http://localhost:8099";
const CLOCK = new Date(process.env.DOCS_CLOCK ?? "2026-10-08T12:00:00Z");
const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "public", "images");
const PAD = 24;
const THEMES = [
  { theme: "light", suffix: "" },
  { theme: "dark", suffix: "-dark" },
] as const;

const stepSchema = z.union([
  z.object({ goto: z.string() }),
  z.object({ click: z.string(), nth: z.number().optional() }),
  z.object({ dblclick: z.string() }),
  z.object({ rightClick: z.string() }),
  z.object({ hover: z.string() }),
  z.object({ fill: z.string(), value: z.string() }),
  z.object({ type: z.string(), text: z.string() }),
  z.object({ press: z.string() }),
  z.object({ drag: z.string(), to: z.string() }),
  z.object({ waitFor: z.string() }),
  z.object({ waitForHidden: z.string() }),
  z.object({ wait: z.number() }),
  z.object({ scroll: z.string() }),
  z.object({ clearReadLater: z.literal(true) }),
]);
type Step = z.infer<typeof stepSchema>;

const readLaterSchema = z.object({ json: z.object({ messageIds: z.array(z.string()) }) });

const boxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
type Box = z.infer<typeof boxSchema>;

const shotsSchema = z.array(
  z.object({
    name: z.string(),
    path: z.string(),
    signedOut: z.boolean().optional(),
    seededWeek: z.boolean().optional(),
    steps: z.array(stepSchema).optional(),
    element: z.union([z.string(), z.array(z.string())]).optional(),
    pad: z.number().optional(),
    clip: boxSchema.optional(),
    fullPage: z.boolean().optional(),
    viewport: z.object({ width: z.number(), height: z.number() }).optional(),
  }),
);
type Shot = z.infer<typeof shotsSchema>[number];

const accountSchema = z.object({
  email: z.string(),
  password: z.string(),
  workspaceSlug: z.string(),
  mailboxSlug: z.string(),
  calendarSlug: z.string(),
  driveSlugs: z.record(z.string(), z.string()),
});
type Account = z.infer<typeof accountSchema>;

async function harness(path: string): Promise<Response> {
  const res = await fetch(`${HARNESS}${path}`);
  if (!res.ok) throw new Error(`harness ${path}: HTTP ${res.status}`);
  return res;
}

function resolve(path: string, a: Account): string {
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

async function signIn(browser: Browser, a: Account) {
  const context = await browser.newContext(contextOptions());
  const page = await context.newPage();
  await page.goto(`${APP}/`);
  const content = page.getByRole("main");
  await content.getByRole("textbox", { name: "Email address" }).fill(a.email);
  await content.getByRole("textbox", { name: "Password" }).fill(a.password);
  await content.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/2fa\/verify/);
  const input = page.locator('input[autocomplete="one-time-code"]');
  await input.click();
  await page.keyboard.type((await (await harness("/totp?fresh=1")).text()).trim());
  await content.getByRole("button", { name: "Verify", exact: true }).click();
  await page.waitForURL(/\/w\//);
  const state = await context.storageState();
  await context.close();
  return state;
}

function contextOptions() {
  return {
    baseURL: APP,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "light" as const,
    timezoneId: "UTC",
    locale: "en-US",
  };
}

async function rpc(page: Page, procedure: string, input: unknown): Promise<unknown> {
  const res = await page.request.post(`${APP}/rpc/${procedure}`, {
    headers: { origin: APP },
    data: { json: input },
  });
  if (!res.ok()) throw new Error(`rpc ${procedure}: HTTP ${res.status()}`);
  return res.json();
}

async function clearReadLater(page: Page, a: Account) {
  const scope = { workspaceSlug: a.workspaceSlug, mailboxSlug: a.mailboxSlug };
  const { json } = readLaterSchema.parse(await rpc(page, "mail/readLater/list", scope));
  await Promise.all(
    json.messageIds.map((messageId) => rpc(page, "mail/readLater/remove", { ...scope, messageId })),
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

async function run(page: Page, step: Step, a: Account) {
  if ("clearReadLater" in step) await clearReadLater(page, a);
  else if ("goto" in step) await page.goto(resolve(step.goto, a));
  else if ("click" in step)
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
  } else if ("press" in step) await page.keyboard.press(step.press);
  else if ("drag" in step) await drag(page, step.drag, step.to);
  else if ("waitFor" in step)
    await page.locator(step.waitFor).first().waitFor({ state: "visible" });
  else if ("waitForHidden" in step)
    await page.locator(step.waitForHidden).first().waitFor({ state: "hidden" });
  else if ("wait" in step) await page.waitForTimeout(step.wait);
  else if ("scroll" in step) await page.locator(step.scroll).first().scrollIntoViewIfNeeded();
}

function contentBox(el: Element): Box {
  const rect = el.getBoundingClientRect();
  const solid = new Set(["svg", "img", "canvas", "button", "input", "textarea", "select"]);
  let bottom = rect.top;
  for (const child of el.querySelectorAll("*")) {
    if (child.children.length > 0 && !solid.has(child.localName)) continue;
    const r = child.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (getComputedStyle(child).visibility === "hidden") continue;
    bottom = Math.max(bottom, Math.min(r.bottom, rect.bottom));
  }
  const end = rect.bottom - bottom > 120 ? bottom + 16 : rect.bottom;
  return {
    x: rect.left + window.scrollX,
    y: rect.top + window.scrollY,
    width: rect.width,
    height: end - rect.top,
  };
}

async function region(page: Page, element: string | string[], pad = PAD): Promise<Box> {
  const boxes: Box[] = [];
  for (const selector of Array.isArray(element) ? element : [element])
    boxes.push(await page.locator(selector).first().evaluate(contentBox));
  const doc = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const right = Math.min(doc.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
  const bottom = Math.min(doc.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
  return { x, y, width: right - x, height: bottom - y };
}

async function unscroll(page: Page) {
  await page.evaluate(() => {
    for (const el of document.body.querySelectorAll("*")) {
      if (el.scrollTop === 0 && el.scrollLeft === 0) continue;
      const style = getComputedStyle(el);
      if (style.overflowY === "hidden") el.scrollTop = 0;
      if (style.overflowX === "hidden") el.scrollLeft = 0;
    }
  });
}

async function capture(page: Page, shot: Shot, path: string) {
  await unscroll(page);
  if (shot.clip) await page.screenshot({ path, clip: shot.clip });
  else if (shot.element)
    await page.screenshot({
      path,
      fullPage: true,
      clip: await region(page, shot.element, shot.pad),
    });
  else await page.screenshot({ path, fullPage: shot.fullPage });
}

async function switchTheme(page: Page, theme: string) {
  await page.evaluate((value) => {
    localStorage.setItem("theme", value);
    window.dispatchEvent(new StorageEvent("storage", { key: "theme", newValue: value }));
  }, theme);
  await page.waitForTimeout(800);
}

async function main() {
  const only = process.argv.slice(2);
  const dir = join(ROOT, "screenshots");
  const shots = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => shotsSchema.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))))
    .filter((s) => only.length === 0 || only.some((o) => s.name.startsWith(o)));
  const account = accountSchema.parse(await (await harness("/account")).json());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const state = await signIn(browser, account);
  const failed: string[] = [];

  for (const shot of shots) {
    const context = await browser.newContext({
      ...contextOptions(),
      ...(shot.viewport ? { viewport: shot.viewport } : {}),
      storageState: shot.signedOut ? undefined : state,
    });
    await context.addInitScript(() => localStorage.setItem("theme", "light"));
    const page = await context.newPage();
    if (shot.seededWeek) await page.clock.setFixedTime(CLOCK);
    try {
      await page.goto(resolve(shot.path, account));
      await page.waitForLoadState("networkidle").catch(() => {});
      for (const step of shot.steps ?? []) await run(page, step, account);
      await page.waitForTimeout(400);
      for (const { theme, suffix } of THEMES) {
        if (theme !== "light") await switchTheme(page, theme);
        const file = join(OUT, `${shot.name}${suffix}.png`);
        await mkdir(dirname(file), { recursive: true });
        await capture(page, shot, file);
      }
      console.log(`[docs-shots] ok ${shot.name}`);
    } catch (error) {
      failed.push(shot.name);
      console.error(`[docs-shots] failed ${shot.name}: ${String(error)}`);
    } finally {
      await context.close();
    }
  }

  await browser.close();
  if (failed.length > 0) {
    console.error(`[docs-shots] ${failed.length} failed: ${failed.join(", ")}`);
    process.exit(1);
  }
}

await main();
