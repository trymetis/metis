import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { type Browser, chromium, type Page } from "@playwright/test";
import { z } from "zod";

const APP = process.env.DOCS_APP_URL ?? "http://localhost:3000";
const HARNESS = process.env.DOCS_HARNESS_URL ?? "http://localhost:8099";
const CLOCK = new Date(process.env.DOCS_CLOCK ?? "2026-10-08T12:00:00Z");
const ROOT = join(import.meta.dirname, "..");
const DOCS = join(ROOT, "..", "docs", "screenshots");
const OUT = join(ROOT, "public", "shots");
const MANIFEST = join(ROOT, "src", "content", "shots.json");
const VIEWPORT = { width: 1440, height: 900 };
const PAD = 12;

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

const docsShotsSchema = z.array(
  z.object({
    name: z.string(),
    path: z.string(),
    signedOut: z.boolean().optional(),
    seededWeek: z.boolean().optional(),
    steps: z.array(stepSchema).optional(),
    element: z.union([z.string(), z.array(z.string())]).optional(),
    clip: boxSchema.optional(),
  }),
);
type DocsShot = z.infer<typeof docsShotsSchema>[number];

const shotsSchema = z.array(
  z.object({
    name: z.string(),
    from: z.string(),
    focus: z
      .union([z.string(), z.array(z.string()), boxSchema])
      .nullable()
      .optional(),
    steps: z.array(stepSchema).optional(),
  }),
);

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

function contextOptions() {
  return {
    baseURL: APP,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: "light" as const,
    timezoneId: "UTC",
    locale: "en-US",
  };
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
  const brand = await context.request.post(`${APP}/rpc/workspaces/setThemeBrand`, {
    data: { json: { workspaceSlug: a.workspaceSlug, themeBrand: "amber" } },
  });
  if (!brand.ok()) throw new Error(`setThemeBrand: HTTP ${brand.status()} ${await brand.text()}`);
  const state = await context.storageState();
  await context.close();
  return state;
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

function viewBox(el: Element): Box {
  const rect = el.getBoundingClientRect();
  const solid = new Set(["svg", "img", "canvas", "button", "input", "textarea"]);
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
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: end - rect.top,
  };
}

async function focusBox(page: Page, focus: string | string[]): Promise<Box | null> {
  const boxes: Box[] = [];
  for (const selector of Array.isArray(focus) ? focus : [focus]) {
    const loc = page.locator(selector).first();
    if (!(await loc.isVisible().catch(() => false))) return null;
    boxes.push(await loc.evaluate(viewBox));
  }
  const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - PAD);
  const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - PAD);
  const right = Math.min(VIEWPORT.width, Math.max(...boxes.map((b) => b.x + b.width)) + PAD);
  const bottom = Math.min(VIEWPORT.height, Math.max(...boxes.map((b) => b.y + b.height)) + PAD);
  if (right - x < 8 || bottom - y < 8) return null;
  return { x, y, width: right - x, height: bottom - y };
}

async function main() {
  const only = process.argv.slice(2);
  const docs = new Map<string, DocsShot>();
  for (const f of readdirSync(DOCS).filter((name) => name.endsWith(".json")))
    for (const s of docsShotsSchema.parse(JSON.parse(readFileSync(join(DOCS, f), "utf8"))))
      docs.set(s.name, s);
  const shots = shotsSchema
    .parse(JSON.parse(readFileSync(join(import.meta.dirname, "shots.json"), "utf8")))
    .filter((s) => only.length === 0 || only.some((o) => s.name.startsWith(o)));
  let manifest: Record<string, number[] | null> = {};
  try {
    manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {}

  const account = accountSchema.parse(await (await harness("/account")).json());
  const browser = process.env.CDP_URL
    ? await chromium.connectOverCDP(process.env.CDP_URL)
    : await chromium.launch({ channel: "chrome", headless: true });
  const state = await signIn(browser, account);
  const failed: string[] = [];

  for (const shot of shots) {
    const base = docs.get(shot.from);
    if (!base) {
      failed.push(shot.name);
      console.error(`[www-shots] no docs entry ${shot.from}`);
      continue;
    }
    const context = await browser.newContext({
      ...contextOptions(),
      storageState: base.signedOut ? undefined : state,
    });
    await context.addInitScript(() => localStorage.setItem("theme", "light"));
    const page = await context.newPage();
    if (base.seededWeek) await page.clock.setFixedTime(CLOCK);
    try {
      await page.goto(resolve(base.path, account));
      await page.waitForLoadState("networkidle").catch(() => {});
      for (const step of [...(base.steps ?? []), ...(shot.steps ?? [])])
        await run(page, step, account);
      await page.waitForTimeout(500);
      const want = shot.focus === undefined ? (base.element ?? base.clip) : shot.focus;
      let box: Box | null = null;
      if (want && typeof want === "object" && !Array.isArray(want)) box = want;
      else if (want) {
        const first = Array.isArray(want) ? want[0] : want;
        if (first)
          await page
            .locator(first)
            .first()
            .scrollIntoViewIfNeeded()
            .catch(() => {});
        box = await focusBox(page, want);
        if (!box && base.element && want !== base.element) box = await focusBox(page, base.element);
      }
      const file = join(OUT, `${shot.name}.jpg`);
      await mkdir(dirname(file), { recursive: true });
      await page.screenshot({ path: file, type: "jpeg", quality: 90 });
      manifest[shot.name] = box ? [box.x, box.y, box.width, box.height].map(Math.round) : null;
      console.log(
        `[www-shots] ok ${shot.name} ${box ? JSON.stringify(manifest[shot.name]) : "(whole)"}`,
      );
    } catch (error) {
      failed.push(shot.name);
      console.error(`[www-shots] failed ${shot.name}: ${String(error)}`);
    } finally {
      await context.close();
    }
  }

  await browser.close();
  const sorted = Object.fromEntries(
    Object.entries(manifest).toSorted(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);
  if (failed.length > 0) {
    console.error(`[www-shots] ${failed.length} failed: ${failed.join(", ")}`);
    process.exit(1);
  }
}

await main();
