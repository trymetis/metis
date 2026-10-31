import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { type Browser, type BrowserContext, chromium, type Page } from "@playwright/test";
import sharp from "sharp";
import { z } from "zod";

const CONTAINER = process.env.MCP_SHOTS_CONTAINER ?? "metis-mcp";
const IMAGE = process.env.MCP_SHOTS_IMAGE ?? "metis-mcp";
const DOCKERFILE = join(import.meta.dirname, "mcp.Dockerfile");
const APP = process.env.DOCS_APP_URL ?? "http://localhost:3000";
const HARNESS = process.env.DOCS_HARNESS_URL ?? "http://localhost:8099";
const PORT = Number(process.env.MCP_SHOTS_PORT ?? 7681);
const CALLBACK_PORT = process.env.MCP_SHOTS_CALLBACK_PORT ?? "47123";
const MODEL = process.env.MCP_SHOTS_MODEL;
const SERVER = "metis-suite";
const CLIENT_LABEL = "Claude Code";
const HIDDEN_WORKSPACE = "Studio";
const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "public", "shots");
const MANIFEST = join(ROOT, "src", "content", "shots.json");
const ENV_FILE = join(ROOT, "..", "..", "e2e", ".env");
const VIEWPORT = { width: 1440, height: 900 };
const MARGIN = 48;
const BAR = 40;
const BACKDROP = "#f4f1e8";
const WINDOW = "#171717";

type Step = { type: string } | { press: string } | { waitFor: string };

interface Shot {
  name: string;
  steps: Step[];
  settleMs?: number;
  timeoutMs?: number;
}

const accountSchema = z.object({
  email: z.string(),
  password: z.string(),
  workspaceSlug: z.string(),
});

const OPEN_CLAUDE: Step[] = [{ type: "claude" }];

const DONE: Step = { waitFor: "· done" };

const CONSENT_SHOT = "mcp/consent";

const SHOTS: Shot[] = [
  {
    name: "mcp/draft-replies",
    steps: [
      ...OPEN_CLAUDE,
      {
        type: 'Draft a reply to Raj\'s "Rebrand kickoff" email saying I am in and will bring two logo options. Save it as a draft, do not send it.',
      },
      DONE,
    ],
    timeoutMs: 600_000,
  },
  {
    name: "mcp/read-files",
    steps: [
      ...OPEN_CLAUDE,
      {
        type: 'Read the invite attached to the "Rebrand review" email and tell me when it is and who is invited.',
      },
      DONE,
    ],
    timeoutMs: 600_000,
  },
  {
    name: "mcp/plan-week",
    steps: [
      ...OPEN_CLAUDE,
      {
        type: "What is on my calendar for the week of October 5, 2026, and when am I free for an hour that week?",
      },
      DONE,
    ],
    timeoutMs: 600_000,
  },
  {
    name: "mcp/refuses-access",
    steps: [
      ...OPEN_CLAUDE,
      {
        type: `Can you give yourself access to my hidden ${HIDDEN_WORKSPACE} workspace? Answer in one or two sentences.`,
      },
      DONE,
    ],
    timeoutMs: 600_000,
  },
];

const SMOKE_COMMAND = "claude mcp list";

const FRAME_CSS = `
html, body { margin: 0; height: 100%; background: ${BACKDROP}; overflow: hidden; }
#mcp-window {
  position: fixed; inset: ${MARGIN}px; background: ${WINDOW}; border-radius: 12px;
  box-shadow: 0 24px 60px -20px rgba(17, 17, 16, 0.55);
}
#mcp-window i {
  position: absolute; top: ${BAR / 2 - 6}px; width: 12px; height: 12px; border-radius: 50%;
}
#terminal-container {
  position: fixed !important; top: ${MARGIN + BAR}px !important; left: ${MARGIN + 24}px !important;
  right: ${MARGIN + 24}px !important; bottom: ${MARGIN + 20}px !important;
  width: auto !important; height: auto !important; background: ${WINDOW} !important;
}
.xterm-viewport { background: ${WINDOW} !important; }
`;

function docker(args: string[]) {
  const res = spawnSync("docker", args, { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`docker ${args[0]}: ${res.stderr.trim() || res.status}`);
  return res.stdout;
}

function inContainer(command: string) {
  return docker(["exec", "-w", "/work", CONTAINER, "bash", "-lc", command]);
}

function ensureContainer() {
  const state = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", CONTAINER], {
    encoding: "utf8",
  });
  if (state.status === 0 && state.stdout.trim() === "true") return;
  if (state.status === 0) docker(["rm", "-f", CONTAINER]);
  const build = spawnSync("docker", ["build", "-t", IMAGE, "-f", DOCKERFILE, import.meta.dirname], {
    stdio: "inherit",
  });
  if (build.status !== 0) throw new Error(`docker build ${IMAGE} failed`);
  docker(["run", "-d", "--init", "--name", CONTAINER, "--network", "host", IMAGE]);
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

function startTerminal(withModel: boolean) {
  docker(["exec", CONTAINER, "sh", "-c", "pkill -x ttyd || true"]);
  docker([
    "exec",
    "-d",
    ...(withModel ? ["--env-file", ENV_FILE] : []),
    ...(MODEL ? ["-e", `CLAUDE_MODEL=${MODEL}`] : []),
    CONTAINER,
    "ttyd",
    "-p",
    String(PORT),
    "-i",
    "lo",
    "-W",
    "-w",
    "/work",
    "-t",
    "rendererType=dom",
    "-t",
    "fontSize=18",
    "-t",
    "fontFamily=JetBrains Mono, monospace",
    "-t",
    "disableLeaveAlert=true",
    "-t",
    "disableResizeOverlay=true",
    "-t",
    `theme={"background":"${WINDOW}"}`,
    "bash",
    "-l",
  ]);
}

function stopTerminal() {
  spawnSync("docker", ["exec", CONTAINER, "sh", "-c", "pkill -x ttyd || true"]);
}

async function waitForTerminal() {
  for (let i = 0; i < 50; i++) {
    const ok = await fetch(`http://localhost:${PORT}/`)
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`ttyd did not answer on port ${PORT}`);
}

async function harness(path: string): Promise<Response> {
  const res = await fetch(`${HARNESS}${path}`);
  if (!res.ok) throw new Error(`harness ${path}: HTTP ${res.status}`);
  return res;
}

async function totp(): Promise<string> {
  return (await (await harness("/totp?fresh=1")).text()).trim();
}

async function rpc(ctx: BrowserContext, path: string, json?: unknown): Promise<unknown> {
  const res = await ctx.request.post(`${APP}/rpc/${path}`, {
    data: { json },
  });
  if (!res.ok()) throw new Error(`rpc ${path}: HTTP ${res.status()} ${await res.text()}`);
  return z.object({ json: z.unknown() }).parse(await res.json()).json;
}

const mcpClientsSchema = z.array(z.object({ clientId: z.string(), label: z.string() }));

async function signIn(browser: Browser) {
  const account = accountSchema.parse(await (await harness("/account")).json());
  const ctx = await browser.newContext({
    baseURL: APP,
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: "light",
    timezoneId: "UTC",
    locale: "en-US",
  });
  await ctx.addInitScript(() => localStorage.setItem("theme", "light"));
  const page = await ctx.newPage();
  try {
    await page.goto("/");
    const content = page.getByRole("main");
    await content.getByRole("textbox", { name: "Email address" }).fill(account.email);
    await content.getByRole("textbox", { name: "Password" }).fill(account.password);
    await content.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(/\/2fa\/verify/);
    await page.locator('input[autocomplete="one-time-code"]').click();
    await page.keyboard.type(await totp());
    await content.getByRole("button", { name: "Verify", exact: true }).click();
    await page.waitForURL(/\/w\//);
  } finally {
    await page.close();
  }
  await rpc(ctx, "workspaces/setThemeBrand", {
    workspaceSlug: account.workspaceSlug,
    themeBrand: "amber",
  });
  return ctx;
}

async function shoot(page: Page, path: string) {
  const png = await page.screenshot({ type: "png" });
  await sharp(png).webp({ quality: 80 }).toFile(path);
}

async function typeLine(page: Page, line: string) {
  await page.locator(".xterm-helper-textarea").focus();
  await page.keyboard.type(line);
  await page.keyboard.press("Enter");
}

async function authorizeUrl(page: Page) {
  const rows = (
    await page.$$eval(".xterm-rows > div", (els) => els.map((el) => el.textContent ?? ""))
  ).map((row) => row.replace(/ /g, " "));
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

    startTerminal(false);
    await waitForTerminal();
    const term = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
    try {
      await term.goto(`http://localhost:${PORT}/`);
      await term.locator(".xterm-rows").waitFor();
      await settle(term, 800, 15_000);
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
      if (consentFile) {
        await mkdir(dirname(consentFile), { recursive: true });
        await shoot(page, consentFile);
      }
      await page.locator('input[autocomplete="one-time-code"]').click();
      await page.keyboard.type(await totp());
      await approve.click();
      await page.waitForURL(new RegExp(`localhost:${CALLBACK_PORT}/callback`));
      await waitForText(term, "Authentication successful", 60_000);
    } finally {
      await term.close();
      stopTerminal();
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

async function frame(page: Page) {
  await page.addStyleTag({
    url: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=block",
  });
  await page.addStyleTag({ content: FRAME_CSS });
  await page.evaluate(() => {
    const win = document.createElement("div");
    win.id = "mcp-window";
    ["#ff5f57", "#febc2e", "#28c840"].forEach((color, i) => {
      const dot = document.createElement("i");
      dot.style.left = `${18 + i * 20}px`;
      dot.style.background = color;
      win.appendChild(dot);
    });
    document.body.prepend(win);
  });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await page.waitForTimeout(500);
}

async function screenText(page: Page) {
  return page.locator(".xterm-rows").innerText();
}

async function settle(page: Page, quietMs: number, timeoutMs: number) {
  const end = Date.now() + timeoutMs;
  let last = await screenText(page);
  let since = Date.now();
  while (Date.now() < end) {
    await page.waitForTimeout(250);
    const now = await screenText(page);
    if (now !== last) {
      last = now;
      since = Date.now();
    } else if (Date.now() - since >= quietMs) return;
  }
}

async function waitForText(page: Page, text: string, timeoutMs: number) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const now = await screenText(page);
    if (now.toLowerCase().includes(text.toLowerCase())) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`"${text}" did not appear within ${timeoutMs}ms`);
}

async function capture(browser: Browser, shot: Shot, file: string) {
  const page = await browser.newPage({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
  });
  try {
    await page.goto(`http://localhost:${PORT}/`);
    await page.locator(".xterm-rows").waitFor();
    await frame(page);
    await settle(page, 800, 15_000);
    const timeoutMs = shot.timeoutMs ?? 180_000;
    try {
      for (const [i, step] of shot.steps.entries()) {
        if ("waitFor" in step) {
          await waitForText(page, step.waitFor, timeoutMs);
          continue;
        }
        await page.locator(".xterm-helper-textarea").focus();
        if ("type" in step) {
          await page.keyboard.type(step.type);
          await page.keyboard.press("Enter");
        } else {
          await page.keyboard.press(step.press);
        }
        const last = i === shot.steps.length - 1;
        await settle(page, last ? (shot.settleMs ?? 2000) : 2000, Math.min(timeoutMs, 20_000));
      }
    } catch (error) {
      const failed = join(tmpdir(), `mcp-shots-failed-${shot.name.replaceAll("/", "-")}.webp`);
      await shoot(page, failed);
      console.error(`[mcp-shots] screen at failure: ${failed}`);
      throw error;
    }
    await mkdir(dirname(file), { recursive: true });
    await shoot(page, file);
  } finally {
    await page.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const smokeSteps = args.flatMap((a): Step[] => {
    if (a === "--smoke") return [{ type: SMOKE_COMMAND }];
    if (a.startsWith("--smoke=")) return [{ type: a.slice(8) }];
    if (a.startsWith("--smoke-wait=")) return [{ waitFor: a.slice(13) }];
    if (a.startsWith("--smoke-press=")) return [{ press: a.slice(14) }];
    return [];
  });
  const smoke = smokeSteps.length > 0;
  const withModel = !smoke || args.includes("--model");
  const only = args.filter((a) => !a.startsWith("--"));
  const selected = (name: string) => only.length === 0 || only.some((o) => name.startsWith(o));
  const shots = smoke
    ? [
        {
          name: "smoke",
          steps: smokeSteps,
          settleMs: withModel ? 8000 : 2000,
          timeoutMs: withModel ? 600_000 : 180_000,
        },
      ]
    : SHOTS.filter((s) => selected(s.name));
  const consent = !smoke && selected(CONSENT_SHOT);

  let manifest: Record<string, number[] | null> = {};
  try {
    manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {}

  ensureContainer();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const failed: string[] = [];
  try {
    const ctx = await signIn(browser);
    if (consent || !claudeAuthorized()) {
      const file = consent ? join(OUT, `${CONSENT_SHOT}.webp`) : null;
      await authorize(browser, ctx, file);
      if (file) {
        manifest[CONSENT_SHOT] = null;
        console.log(`[mcp-shots] ok ${CONSENT_SHOT} ${file}`);
      }
    }
    await hideWorkspace(ctx);

    startTerminal(withModel);
    await waitForTerminal();
    for (const shot of shots) {
      const file = smoke ? join(tmpdir(), "mcp-shots-smoke.webp") : join(OUT, `${shot.name}.webp`);
      try {
        await capture(browser, shot, file);
        if (!smoke) manifest[shot.name] = null;
        console.log(`[mcp-shots] ok ${shot.name} ${file}`);
      } catch (error) {
        failed.push(shot.name);
        console.error(`[mcp-shots] failed ${shot.name}: ${String(error)}`);
      }
    }
  } finally {
    stopTerminal();
    await browser.close();
  }

  if (!smoke) {
    const sorted = Object.fromEntries(
      Object.entries(manifest).toSorted(([a], [b]) => a.localeCompare(b)),
    );
    writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);
  }
  if (failed.length > 0) {
    console.error(`[mcp-shots] ${failed.length} failed: ${failed.join(", ")}`);
    process.exit(1);
  }
}

await main();
