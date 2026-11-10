import { readdirSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { sentInviteLink } from "@metis/e2e/lib/invites";
import {
  type Browser,
  type BrowserContext,
  chromium,
  type Page,
  type PageScreenshotOptions,
} from "@playwright/test";
import * as OTPAuth from "otpauth";
import sharp from "sharp";
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
  z.object({ follow: z.string() }),
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
    observer: z.boolean().optional(),
    invite: z
      .object({
        email: z.string(),
        workspace: z.boolean().optional(),
        role: z.enum(["admin", "observer"]).optional(),
      })
      .optional(),
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
  member: z.object({ email: z.string(), password: z.string(), totpURI: z.string() }),
});
type Account = z.infer<typeof accountSchema>;
type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

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

async function signIn(
  browser: Browser,
  who: { email: string; password: string },
  code: () => Promise<string>,
) {
  const context = await browser.newContext(contextOptions());
  const page = await context.newPage();
  await page.goto(`${APP}/`);
  const content = page.getByRole("main");
  await content.getByRole("textbox", { name: "Email address" }).fill(who.email);
  await content.getByRole("textbox", { name: "Password" }).fill(who.password);
  await content.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/2fa\/verify/);
  const input = page.locator('input[autocomplete="one-time-code"]');
  await input.click();
  await page.keyboard.type(await code());
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
    deviceScaleFactor: 2,
    colorScheme: "light" as const,
    timezoneId: "UTC",
    locale: "en-US",
    extraHTTPHeaders: { "X-Forwarded-For": "203.0.113.10" },
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

const invitesSchema = z.object({
  json: z.object({ invites: z.array(z.object({ id: z.string(), email: z.string() })) }),
});

type Invite = NonNullable<Shot["invite"]>;

async function totp(): Promise<string> {
  return (await (await harness("/totp?fresh=1")).text()).trim();
}

async function revokeInvites(page: Page, a: Account, email: string, invite: Invite) {
  if (invite.workspace) {
    const scope = { workspaceSlug: a.workspaceSlug };
    const { json } = invitesSchema.parse(await rpc(page, "workspaces/listInvites", scope));
    for (const pending of json.invites.filter((i) => i.email === email))
      await rpc(page, "workspaces/revokeInvite", { ...scope, inviteId: pending.id });
  } else {
    const { json } = invitesSchema.parse(await rpc(page, "dashboard/invites/list", {}));
    for (const pending of json.invites.filter((i) => i.email === email))
      await rpc(page, "dashboard/invites/revoke", { inviteId: pending.id });
  }
}

async function withInvite(
  browser: Browser,
  state: StorageState,
  a: Account,
  invite: Invite,
  onLink: (path: string) => Promise<void>,
) {
  const context = await browser.newContext({ ...contextOptions(), storageState: state });
  const page = await context.newPage();
  const email = invite.email.replaceAll("{member}", a.member.email);
  try {
    await revokeInvites(page, a, email, invite);
    const link = await sentInviteLink(HARNESS, email, async () =>
      invite.workspace
        ? rpc(page, "workspaces/createInvite", {
            workspaceSlug: a.workspaceSlug,
            email,
            role: "member",
          })
        : rpc(page, "dashboard/invites/create", {
            email,
            instanceRole: invite.role ?? null,
            ...(invite.role ? { code: await totp() } : {}),
          }),
    );
    const { pathname, search } = new URL(link);
    await onLink(`${pathname}${search}`);
  } finally {
    await revokeInvites(page, a, email, invite);
    await context.close();
  }
}

const usersSchema = z.object({
  json: z.object({ users: z.array(z.object({ id: z.string(), email: z.string() })) }),
});

function memberCode(a: Account): Promise<string> {
  const parsed = OTPAuth.URI.parse(a.member.totpURI);
  if (!(parsed instanceof OTPAuth.TOTP)) throw new Error("the member's totpURI is not a TOTP URI");
  return Promise.resolve(parsed.generate());
}

async function withObserver(
  browser: Browser,
  state: StorageState,
  a: Account,
  onState: (observer: StorageState) => Promise<void>,
) {
  const context = await browser.newContext({ ...contextOptions(), storageState: state });
  const page = await context.newPage();
  const { json } = usersSchema.parse(await rpc(page, "dashboard/users/list", {}));
  const member = json.users.find((u) => u.email === a.member.email);
  if (!member) throw new Error(`${a.member.email} is not listed on the Users page`);
  const setRole = async (role: "observer" | "user") =>
    rpc(page, "dashboard/users/setRole", { userId: member.id, role, code: await totp() });
  try {
    await setRole("observer");
    await onState(await signIn(browser, a.member, () => memberCode(a)));
  } finally {
    await setRole("user");
    await context.close();
  }
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
  else if ("follow" in step) {
    const href = await page.locator(step.follow).first().getAttribute("href");
    if (!href) throw new Error(`${step.follow} has no href`);
    await page.goto(new URL(href, page.url()).href);
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

async function shoot(page: Page, path: string, options: PageScreenshotOptions) {
  const png = await page.screenshot({ ...options, type: "png" });
  await sharp(png).webp({ quality: 80 }).toFile(path);
}

async function capture(page: Page, shot: Shot, path: string) {
  await unscroll(page);
  if (shot.clip) await shoot(page, path, { clip: shot.clip });
  else if (shot.element)
    await shoot(page, path, {
      fullPage: true,
      clip: await region(page, shot.element, shot.pad),
    });
  else await shoot(page, path, { fullPage: shot.fullPage });
}

async function switchTheme(page: Page, theme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: theme });
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
  const state: StorageState = await signIn(browser, account, totp);
  const failed: string[] = [];

  async function take(shot: Shot, path: string, as: StorageState = state) {
    const context = await browser.newContext({
      ...contextOptions(),
      ...(shot.viewport ? { viewport: shot.viewport } : {}),
      storageState: shot.signedOut ? undefined : as,
    });
    await context.addInitScript(() => {
      if (window === window.top) localStorage.setItem("theme", "light");
    });
    const page = await context.newPage();
    if (shot.seededWeek) await page.clock.setFixedTime(CLOCK);
    try {
      await page.goto(resolve(path, account));
      await page.waitForLoadState("networkidle").catch(() => {});
      for (const step of shot.steps ?? []) await run(page, step, account);
      await page.waitForTimeout(400);
      for (const { theme, suffix } of THEMES) {
        if (theme !== "light") await switchTheme(page, theme);
        const file = join(OUT, `${shot.name}${suffix}.webp`);
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

  for (const shot of shots) {
    const { invite } = shot;
    if (shot.observer) {
      try {
        await withObserver(browser, state, account, (observer) => take(shot, shot.path, observer));
      } catch (error) {
        failed.push(shot.name);
        console.error(`[docs-shots] failed ${shot.name}: ${String(error)}`);
      }
      continue;
    }
    if (!invite) {
      await take(shot, shot.path);
      continue;
    }
    try {
      await withInvite(browser, state, account, invite, (link) =>
        take(shot, shot.path.replaceAll("{invite}", link)),
      );
    } catch (error) {
      failed.push(shot.name);
      console.error(`[docs-shots] failed ${shot.name}: ${String(error)}`);
    }
  }

  await browser.close();
  if (failed.length > 0) {
    console.error(`[docs-shots] ${failed.length} failed: ${failed.join(", ")}`);
    process.exit(1);
  }
}

await main();
