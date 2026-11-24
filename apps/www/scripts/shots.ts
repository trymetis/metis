import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type Account,
  APP_URL,
  asUser,
  CLOCK,
  harnessAccount,
  rpc,
  selectTheme,
  signIn,
  type StorageState,
  totp,
} from "@metis/screenshots/app";
import { type Box, viewportRegion } from "@metis/screenshots/box";
import { contextOptions, launch, shoot, VIEWPORT } from "@metis/screenshots/browser";
import {
  CONSENT_SHOT,
  namePicker,
  type PageEntry,
  readLists,
  type TerminalEntry,
  type TerminalStep,
  type WwwShot,
} from "@metis/screenshots/entries";
import { resolve, runStep } from "@metis/screenshots/steps";
import {
  captureTerminal,
  settle,
  type TerminalHost,
  ttyd,
  typeLine,
  visibleText,
  waitForTtyd,
  waitUntil,
} from "@metis/screenshots/terminal";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { z } from "zod";

import { type Manifest, readManifest, writeManifest } from "./manifest.ts";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "public", "shots");
const ENV_FILE = join(ROOT, "..", "..", "e2e", ".env");
const PAD = 12;
const CONTAINER = "metis-claude-code";
const PORT = Number(process.env.MCP_SHOTS_PORT ?? 7681);
const CALLBACK_PORT = process.env.MCP_SHOTS_CALLBACK_PORT ?? "47123";
const MODEL = process.env.MCP_SHOTS_MODEL;
const SERVER = "metis-suite";
const CLIENT_LABEL = "Claude Code";
const HIDDEN_WORKSPACE = "Studio";
const SMOKE_COMMAND = "claude mcp list";

interface ClaudePlan {
  consent: boolean;
  prompts: TerminalEntry[];
  smoke: TerminalStep[];
  key: string | undefined;
}

function docker(args: string[], env?: NodeJS.ProcessEnv) {
  const res = spawnSync("docker", args, { encoding: "utf8", env });
  if (res.status !== 0) throw new Error(`docker ${args[0]}: ${res.stderr.trim() || res.status}`);
  return res.stdout;
}

function inContainer(command: string) {
  return docker(["exec", "-w", "/work", CONTAINER, "bash", "-lc", command]);
}

function requireContainer() {
  const res = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", CONTAINER], {
    encoding: "utf8",
  });
  if (res.status !== 0 || res.stdout.trim() !== "true")
    throw new Error(`${CONTAINER} is not running; start the stack with bun run up:ss in e2e/`);
}

function upstreamKey(): string {
  let text = "";
  try {
    text = readFileSync(ENV_FILE, "utf8");
  } catch {
    throw new Error(
      `the Claude Code shots read LLM_UPSTREAM_KEY from ${ENV_FILE}, which is missing`,
    );
  }
  for (const line of text.split("\n")) {
    const match = /^\s*(?:export\s+)?LLM_UPSTREAM_KEY\s*=\s*(.*)$/.exec(line);
    const value = (match?.[1] ?? "").trim().replace(/^(["'])(.*)\1$/, "$2");
    if (value) return value;
  }
  throw new Error(`LLM_UPSTREAM_KEY is not set in ${ENV_FILE}`);
}

function claudeHost(key: string | undefined): TerminalHost {
  return {
    port: PORT,
    start() {
      docker(["exec", CONTAINER, "sh", "-c", "pkill -x ttyd || true"]);
      docker(
        [
          "exec",
          "-d",
          "-w",
          "/work",
          ...(key ? ["-e", "LLM_UPSTREAM_KEY"] : []),
          ...(key && MODEL ? ["-e", `CLAUDE_MODEL=${MODEL}`] : []),
          CONTAINER,
          ...ttyd(PORT, ["bash", "-l"], ["-i", "lo"]),
        ],
        key ? { ...process.env, LLM_UPSTREAM_KEY: key } : undefined,
      );
    },
    shell: inContainer,
  };
}

function claudeAuthorized() {
  const res = spawnSync(
    "docker",
    ["exec", "-w", "/work", CONTAINER, "bash", "-lc", "claude mcp list"],
    { encoding: "utf8" },
  );
  return res.stdout
    .split("\n")
    .some((line) => line.startsWith(`${SERVER}:`) && line.includes("Connected"));
}

const mcpClientsSchema = z.array(z.object({ clientId: z.string(), label: z.string() }));

async function waitForText(page: Page, text: string, timeoutMs: number) {
  const want = text.toLowerCase();
  await waitUntil(
    page,
    (screen) => screen.toLowerCase().includes(want),
    `"${text}"`,
    timeoutMs,
    visibleText,
  );
}

async function authorizeUrl(page: Page) {
  const rows = (
    await page.$$eval(".xterm-rows > div", (els) => els.map((el) => el.textContent ?? ""))
  ).map((row) => row.replace(/ /g, " "));
  const first = rows.findIndex((row) => row.includes("oauth2/authorize"));
  const parts: string[] = [];
  for (let i = first; i >= 0 && i < rows.length; i++) {
    const row = rows[i]?.trim() ?? "";
    if (row === "") break;
    parts.push(row);
  }
  const url = /https?:\/\/\S+\/oauth2\/authorize\?\S+/.exec(parts.join(""));
  if (!url) throw new Error("Claude Code printed no authorization URL");
  return url[0];
}

async function authorize(browser: Browser, ctx: BrowserContext, consentFile: string | null) {
  const clients = mcpClientsSchema.parse(await rpc(ctx, "mcp/listClients"));
  for (const client of clients.filter((c) => c.label === CLIENT_LABEL))
    await rpc(ctx, "mcp/deleteClient", { clientId: client.clientId });

  const page = await ctx.newPage();
  try {
    await page.goto("/settings/mcp");
    await page.getByRole("button", { name: "Add client", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[inputmode="numeric"]').fill(CALLBACK_PORT);
    await dialog.getByRole("button", { name: "Add client", exact: true }).click();
    const setup = (await dialog.locator("pre").innerText()).replace(/\\\n\s*/g, " ").trim();
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    inContainer(`claude mcp remove ${SERVER} >/dev/null 2>&1; ${setup}`);

    claudeHost(undefined).start(undefined);
    await waitForTtyd(PORT, 50);
    const term = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
    try {
      await term.goto(`http://localhost:${PORT}/`);
      await term.locator(".xterm-rows").waitFor();
      await settle(term, 800, 15_000, visibleText);
      await typeLine(term, "claude");
      await waitForText(term, "run /mcp", 60_000);
      await typeLine(term, "/mcp");
      await waitForText(term, SERVER, 30_000);
      await term.waitForTimeout(500);
      await term.keyboard.press("Enter");
      await term.waitForTimeout(1000);
      await term.keyboard.press("Enter");
      await waitForText(term, "oauth2/authorize", 60_000);

      await page.goto(await authorizeUrl(term));
      const approve = page.getByRole("main").getByRole("button", { name: "Approve", exact: true });
      await approve.waitFor();
      if (consentFile) await shoot(page, consentFile);
      await page.locator('input[autocomplete="one-time-code"]').click();
      await page.keyboard.type(await totp());
      await approve.click();
      await page.waitForURL(new RegExp(`localhost:${CALLBACK_PORT}/callback`));
      await waitForText(term, "Authentication successful", 60_000);
    } finally {
      await term.close();
    }
  } finally {
    await page.close();
  }
}

async function hideWorkspace(ctx: BrowserContext) {
  const { workspaces } = z
    .object({
      workspaces: z.array(z.object({ id: z.string(), name: z.string() })),
    })
    .parse(await rpc(ctx, "workspaces/list"));
  const workspaceId =
    workspaces.find((w) => w.name === HIDDEN_WORKSPACE)?.id ??
    z
      .object({ workspaceId: z.string() })
      .parse(await rpc(ctx, "workspaces/create", { name: HIDDEN_WORKSPACE })).workspaceId;
  const client = mcpClientsSchema
    .parse(await rpc(ctx, "mcp/listClients"))
    .find((c) => c.label === CLIENT_LABEL);
  if (!client) throw new Error(`no "${CLIENT_LABEL}" MCP client`);
  await rpc(ctx, "mcp/setHiddenWorkspaces", {
    clientId: client.clientId,
    workspaceIds: [workspaceId],
  });
}

async function capturePage(
  browser: Browser,
  state: StorageState,
  account: Account,
  entry: PageEntry,
  shot: WwwShot,
): Promise<number[] | null> {
  const context = await browser.newContext({
    ...contextOptions(APP_URL),
    storageState: entry.signedOut ? undefined : state,
  });
  await context.addInitScript(() => localStorage.setItem("theme", "light"));
  const page = await context.newPage();
  if (entry.seededWeek) await page.clock.setFixedTime(CLOCK);
  try {
    await page.goto(resolve(entry.path, account));
    await page.waitForLoadState("networkidle").catch(() => {});
    for (const step of [...(entry.steps ?? []), ...(shot.steps ?? [])])
      await runStep(page, step, account);
    await page.waitForTimeout(500);
    const want = shot.focus === undefined ? (entry.element ?? entry.clip) : shot.focus;
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
      box = await viewportRegion(page, want, PAD);
      if (!box && entry.element && want !== entry.element)
        box = await viewportRegion(page, entry.element, PAD);
    }
    await shoot(page, join(OUT, `${shot.name}.webp`));
    return box ? [box.x, box.y, box.width, box.height].map(Math.round) : null;
  } finally {
    await context.close();
  }
}

async function captureClaude(
  browser: Browser,
  state: StorageState,
  plan: ClaudePlan,
  manifest: Manifest,
  failed: string[],
) {
  const ctx = await browser.newContext({ ...contextOptions(APP_URL), storageState: state });
  await ctx.addInitScript(() => localStorage.setItem("theme", "light"));
  try {
    if (plan.consent || !claudeAuthorized()) {
      const file = plan.consent ? join(OUT, `${CONSENT_SHOT}.webp`) : null;
      try {
        await authorize(browser, ctx, file);
      } catch (error) {
        failed.push(CONSENT_SHOT);
        console.error(`[www-shots] failed the Claude Code sign-in: ${String(error)}`);
        return;
      }
      if (file) {
        manifest[CONSENT_SHOT] = null;
        console.log(`[www-shots] ok ${CONSENT_SHOT}`);
      }
    }
    if (plan.prompts.length > 0) await hideWorkspace(ctx);
    const host = claudeHost(plan.key);
    for (const entry of plan.prompts) {
      try {
        await captureTerminal(browser, entry, host, { light: join(OUT, `${entry.name}.webp`) });
        manifest[entry.name] = null;
        console.log(`[www-shots] ok ${entry.name}`);
      } catch (error) {
        failed.push(entry.name);
        console.error(`[www-shots] failed ${entry.name}: ${String(error)}`);
      }
    }
    if (plan.smoke.length > 0) {
      const file = join(tmpdir(), "claude-code-smoke.webp");
      const entry: TerminalEntry = {
        name: "smoke",
        target: "www",
        terminal: "claude-code",
        cols: 120,
        rows: 34,
        steps: plan.smoke,
      };
      try {
        await captureTerminal(browser, entry, host, { light: file });
        console.log(`[www-shots] ok smoke ${file}`);
      } catch (error) {
        failed.push("smoke");
        console.error(`[www-shots] failed smoke: ${String(error)}`);
      }
    }
  } finally {
    await ctx.close();
  }
}

function smokeSteps(args: string[]): TerminalStep[] {
  return args.flatMap((a): TerminalStep[] => {
    if (a === "--smoke") return [{ type: SMOKE_COMMAND }];
    if (a.startsWith("--smoke=")) return [{ answer: a.slice(8) }];
    if (a.startsWith("--smoke-wait=")) return [{ waitFor: a.slice(13), ignoreCase: true }];
    if (a.startsWith("--smoke-press=")) return [{ press: a.slice(14) }];
    return [];
  });
}

async function main() {
  const args = process.argv.slice(2);
  const smoke = smokeSteps(args);
  const picked = namePicker(args.filter((a) => !a.startsWith("--")));
  const lists = readLists();
  const pageShots =
    smoke.length > 0
      ? []
      : lists.pages
          .flatMap((entry) =>
            entry.target === "docs" ? [] : entry.www.map((shot) => ({ entry, shot })),
          )
          .filter(({ shot }) => picked(shot.name));
  const claudeShots =
    smoke.length > 0 ? [] : lists.terminals.filter((e) => e.target === "www" && picked(e.name));
  if (claudeShots.length > 0 && !MODEL)
    console.log(
      `[www-shots] MCP_SHOTS_MODEL is not set, so ${claudeShots.map((e) => e.name).join(", ")} keep their current images`,
    );
  const smokeModel = smoke.length > 0 && args.includes("--model");
  if (smokeModel && !MODEL) throw new Error("--model needs MCP_SHOTS_MODEL");
  const prompts = MODEL ? claudeShots : [];
  const plan: ClaudePlan = {
    consent: smoke.length === 0 && picked(CONSENT_SHOT),
    prompts,
    smoke,
    key: prompts.length > 0 || smokeModel ? upstreamKey() : undefined,
  };
  const needsClaude = plan.consent || prompts.length > 0 || smoke.length > 0;
  if (needsClaude) requireContainer();

  const manifest = readManifest();
  const account = await harnessAccount();
  const browser = await launch(process.env.CDP_URL);
  const failed: string[] = [];
  try {
    const state = await signIn(browser, account);
    await asUser(browser, state, (page) => selectTheme(page, account.workspaceSlug, "Amber"));
    for (const { entry, shot } of pageShots) {
      try {
        manifest[shot.name] = await capturePage(browser, state, account, entry, shot);
        const box = manifest[shot.name];
        console.log(`[www-shots] ok ${shot.name} ${box ? JSON.stringify(box) : "(whole)"}`);
      } catch (error) {
        failed.push(shot.name);
        console.error(`[www-shots] failed ${shot.name}: ${String(error)}`);
      }
    }
    if (needsClaude) await captureClaude(browser, state, plan, manifest, failed);
  } finally {
    await browser.close();
  }

  if (smoke.length === 0) writeManifest(manifest);
  if (failed.length > 0) {
    console.error(`[www-shots] ${failed.length} failed: ${failed.join(", ")}`);
    process.exit(1);
  }
}

await main();
