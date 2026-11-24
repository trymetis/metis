import { join } from "node:path";

import { sentInviteLink } from "@metis/e2e/lib/invites";
import {
  accountSchema,
  APP_URL,
  asUser,
  CLOCK,
  harness,
  HARNESS_URL,
  rpc,
  selectTheme,
  signIn,
  type StorageState,
  totp,
} from "@metis/screenshots/app";
import { pageRegion } from "@metis/screenshots/box";
import { contextOptions, launch, shoot } from "@metis/screenshots/browser";
import { capturedBy, namePicker, type PageEntry, readLists } from "@metis/screenshots/entries";
import { resolve, runStep } from "@metis/screenshots/steps";
import { captureTerminal } from "@metis/screenshots/terminal";
import type { Browser, Page, PageScreenshotOptions } from "@playwright/test";
import * as OTPAuth from "otpauth";
import { z } from "zod";

import { cliHost, hostShell, releaseValues } from "./terminal.ts";

const CLI_APP = process.env.DOCS_CLI_APP_URL ?? "http://localhost:30050";
const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "public", "images");
const PAD = 24;
const THEMES = [
  { theme: "light", suffix: "" },
  { theme: "dark", suffix: "-dark" },
] as const;

const docsAccountSchema = accountSchema.extend({
  member: z.object({ email: z.string(), password: z.string(), totpURI: z.string() }),
});
type DocsAccount = z.infer<typeof docsAccountSchema>;

const invitesSchema = z.object({
  invites: z.array(z.object({ id: z.string(), email: z.string() })),
});

type Invite = NonNullable<PageEntry["invite"]>;

async function revokeInvites(page: Page, a: DocsAccount, email: string, invite: Invite) {
  if (invite.workspace) {
    const scope = { workspaceSlug: a.workspaceSlug };
    const { invites } = invitesSchema.parse(await rpc(page, "workspaces/listInvites", scope));
    for (const pending of invites.filter((i) => i.email === email))
      await rpc(page, "workspaces/revokeInvite", { ...scope, inviteId: pending.id });
  } else {
    const { invites } = invitesSchema.parse(await rpc(page, "dashboard/invites/list", {}));
    for (const pending of invites.filter((i) => i.email === email))
      await rpc(page, "dashboard/invites/revoke", { inviteId: pending.id });
  }
}

async function withInvite(
  browser: Browser,
  state: StorageState,
  a: DocsAccount,
  invite: Invite,
  onLink: (path: string) => Promise<void>,
) {
  const email = invite.email.replaceAll("{member}", a.member.email);
  await asUser(browser, state, async (page) => {
    try {
      await revokeInvites(page, a, email, invite);
      const link = await sentInviteLink(HARNESS_URL, email, async () =>
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
    }
  });
}

const usersSchema = z.object({
  users: z.array(z.object({ id: z.string(), email: z.string() })),
});

function memberCode(a: DocsAccount): Promise<string> {
  const parsed = OTPAuth.URI.parse(a.member.totpURI);
  if (!(parsed instanceof OTPAuth.TOTP)) throw new Error("the member's totpURI is not a TOTP URI");
  return Promise.resolve(parsed.generate());
}

async function withObserver(
  browser: Browser,
  state: StorageState,
  a: DocsAccount,
  onState: (observer: StorageState) => Promise<void>,
) {
  await asUser(browser, state, async (page) => {
    const { users } = usersSchema.parse(await rpc(page, "dashboard/users/list", {}));
    const member = users.find((u) => u.email === a.member.email);
    if (!member) throw new Error(`${a.member.email} is not listed on the Users page`);
    const setRole = async (role: "observer" | "user") =>
      rpc(page, "dashboard/users/setRole", { userId: member.id, role, code: await totp() });
    try {
      await setRole("observer");
      await onState(await signIn(browser, a.member, () => memberCode(a)));
    } finally {
      await setRole("user");
    }
  });
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

async function capture(page: Page, shot: PageEntry, path: string) {
  await unscroll(page);
  let options: PageScreenshotOptions = { fullPage: shot.fullPage };
  if (shot.clip) options = { clip: shot.clip };
  else if (shot.element)
    options = { fullPage: true, clip: await pageRegion(page, shot.element, shot.pad ?? PAD) };
  await shoot(page, path, options);
}

async function switchTheme(page: Page, theme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: theme });
  await page.evaluate((value) => {
    localStorage.setItem("theme", value);
    window.dispatchEvent(new StorageEvent("storage", { key: "theme", newValue: value }));
  }, theme);
  await page.waitForTimeout(800);
}

async function inMaintenance(): Promise<boolean> {
  const res = await fetch(`${CLI_APP}/`, { headers: { accept: "application/json" } }).catch(
    () => null,
  );
  await res?.body?.cancel();
  return res?.status === 503 && res.headers.has("metis-maintenance");
}

async function waitFor(check: () => Promise<boolean>, what: string, timeoutMs = 180_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`${what} within ${timeoutMs} ms`);
}

function setMaintenance(on: boolean) {
  hostShell(
    on
      ? "metis config set METIS_MAINTENANCE=2026-11-11T10:00:00Z --yes"
      : "metis config unset METIS_MAINTENANCE --yes",
  );
}

async function main() {
  const picked = namePicker(process.argv.slice(2));
  const lists = readLists();
  const all = lists.pages.filter((s) => capturedBy(s.target, "docs") && picked(s.name));
  const shots = all.filter((s) => !s.maintenance);
  const frozen = all.filter((s) => s.maintenance);
  const terminals = lists.terminals.filter((s) => capturedBy(s.target, "docs") && picked(s.name));
  const account =
    shots.length > 0
      ? docsAccountSchema.parse(await (await harness("/account")).json())
      : undefined;
  const browser = await launch();
  const state = account ? await signIn(browser, account) : undefined;
  if (state && account)
    await asUser(browser, state, (page) => selectTheme(page, account.workspaceSlug, "Graphite"));
  const failed: string[] = [];

  async function take(
    shot: PageEntry,
    path: string,
    as: StorageState | undefined = state,
    baseURL = APP_URL,
  ) {
    const context = await browser.newContext({
      ...contextOptions(baseURL),
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
      for (const step of shot.steps ?? []) await runStep(page, step, account);
      await page.waitForTimeout(400);
      for (const { theme, suffix } of THEMES) {
        if (theme !== "light") await switchTheme(page, theme);
        await capture(page, shot, join(OUT, `${shot.name}${suffix}.webp`));
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
    if (!state || !account) break;
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

  if (terminals.length > 0) {
    const values = releaseValues();
    for (const shot of terminals) {
      try {
        await captureTerminal(
          browser,
          shot,
          cliHost,
          {
            light: join(OUT, `${shot.name}.webp`),
            dark: join(OUT, `${shot.name}-dark.webp`),
          },
          values,
        );
        console.log(`[docs-shots] ok ${shot.name}`);
      } catch (error) {
        failed.push(shot.name);
        console.error(`[docs-shots] failed ${shot.name}: ${String(error)}`);
      }
    }
  }

  if (frozen.length > 0) {
    try {
      if (!(await inMaintenance())) setMaintenance(true);
      await waitFor(inMaintenance, "the app did not go into maintenance");
      for (const shot of frozen) await take(shot, shot.path, undefined, CLI_APP);
    } catch (error) {
      failed.push(...frozen.map((shot) => shot.name));
      console.error(`[docs-shots] failed the maintenance shots: ${String(error)}`);
    }
  }
  if (await inMaintenance()) {
    setMaintenance(false);
    await waitFor(async () => !(await inMaintenance()), "the app stayed in maintenance");
  }

  await browser.close();
  if (failed.length > 0) {
    console.error(`[docs-shots] ${failed.length} failed: ${failed.join(", ")}`);
    process.exit(1);
  }
}

await main();
