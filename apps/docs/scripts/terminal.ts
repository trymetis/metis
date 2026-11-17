import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { releases } from "@metis/e2e-cli/lib/releases";
import type { Browser, Page } from "@playwright/test";
import sharp from "sharp";
import { z } from "zod";

const SUITE = join(import.meta.dirname, "..", "..", "..", "e2e-cli");
const ORIGIN = "http://terminal.local";
const WIDTH = 1440;
const MARGIN = 48;
const BAR = 40;
const SIDE = 24;
const BOTTOM = 20;
const TTYD_PORT = 7681;
const TTYD_HOST_PORT = Number(process.env.DOCS_TTYD_PORT ?? 30054);
const LIVE_ROWS = 30;
const HOME = "/root";

function promptFor(label: string | undefined): string {
  const who = label ?? String.raw`\u@\h`;
  const sign = label ? "$" : String.raw`\$`;
  return String.raw`\[\e[1;32m\]${who}\[\e[0m\]:\[\e[1;34m\]\w\[\e[0m\]${sign} `;
}
const BACKDROP: Record<"light" | "dark", string> = { light: "#f4f1e8", dark: "#0f0f0f" };

const stepSchema = z.union([
  z.object({ type: z.string() }),
  z.object({ answer: z.string() }),
  z.object({ press: z.string() }),
  z.object({ waitFor: z.string(), timeout: z.number().optional() }),
  z.object({ waitForPrompt: z.literal(true), timeout: z.number().optional() }),
  z.object({ hidden: z.string() }),
  z.object({ wait: z.number() }),
]);
type Step = z.infer<typeof stepSchema>;

export const terminalShotsSchema = z.array(
  z.object({
    name: z.string(),
    terminal: z.literal("cli-host"),
    prompt: z
      .string()
      .regex(/^[\w.-]+@[\w.-]+$/)
      .optional(),
    rows: z.number().optional(),
    cols: z.number().optional(),
    steps: z.array(stepSchema),
  }),
);
export type TerminalShot = z.infer<typeof terminalShotsSchema>[number];

export function releaseValues(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(releases()).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : [],
    ),
  );
}

function substitute(text: string, values: Record<string, string>): string {
  return text.replaceAll(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
}

function compose(args: string[]) {
  const res = spawnSync("docker", ["compose", "--env-file", ".env.fixture", ...args], {
    cwd: SUITE,
    encoding: "utf8",
  });
  if (res.status !== 0) {
    throw new Error(
      `docker compose ${args.slice(0, 3).join(" ")}: ${res.stderr.trim() || res.status}`,
    );
  }
  return res.stdout;
}

export function hostShell(host: TerminalShot["terminal"], line: string): string {
  return compose(["exec", "-T", host, "bash", "-lc", line]);
}

function startTerminal(host: TerminalShot["terminal"], prompt: string | undefined) {
  compose([
    "exec",
    "-d",
    "-w",
    HOME,
    "-e",
    `PS1=${promptFor(prompt)}`,
    host,
    "ttyd",
    "--once",
    "-p",
    String(TTYD_PORT),
    "-W",
    "-t",
    "rendererType=dom",
    "-t",
    "fontSize=15",
    "-t",
    "disableLeaveAlert=true",
    "-t",
    "disableResizeOverlay=true",
    "bash",
    "--noprofile",
    "--norc",
  ]);
}

async function waitForTerminal(port: number) {
  for (let i = 0; i < 100; i++) {
    const ok = await fetch(`http://localhost:${port}/`)
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`ttyd did not answer on port ${port}`);
}

async function screenText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const buffer = window.term.buffer.active;
    const lines: string[] = [];
    for (let y = 0; y < buffer.length; y++)
      lines.push(buffer.getLine(y)?.translateToString(true) ?? "");
    return lines.join("\n");
  });
}

declare global {
  interface Window {
    term: { buffer: { active: XtermBuffer }; resize(cols: number, rows: number): void };
    replay: (...args: unknown[]) => Promise<void>;
    replayReady?: boolean;
  }
}

interface XtermCell {
  getChars(): string;
  getWidth(): number;
  isBold(): number;
  isItalic(): number;
  isDim(): number;
  isUnderline(): number;
  isInverse(): number;
  isFgDefault(): boolean;
  isFgPalette(): boolean;
  isFgRGB(): boolean;
  getFgColor(): number;
  isBgDefault(): boolean;
  isBgPalette(): boolean;
  isBgRGB(): boolean;
  getBgColor(): number;
}

interface XtermBuffer {
  length: number;
  viewportY: number;
  getLine(
    y: number,
  ):
    | { translateToString(trim: boolean): string; getCell(x: number): XtermCell | undefined }
    | undefined;
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

async function waitUntil(
  page: Page,
  test: (text: string) => boolean,
  what: string,
  timeoutMs: number,
) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (test(await screenText(page))) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`${what} did not appear within ${timeoutMs} ms`);
}

async function typeLine(page: Page, line: string) {
  await page.locator(".xterm-helper-textarea").focus();
  await page.keyboard.type(line, { delay: 5 });
  await page.keyboard.press("Enter");
}

function atPrompt(screen: string): boolean {
  return /[#$] ?$/.test(screen.trimEnd().split("\n").at(-1) ?? "");
}

async function typeCommand(page: Page, line: string) {
  await waitUntil(page, atPrompt, "the shell prompt", 600_000);
  await page.locator(".xterm-helper-textarea").focus();
  await page.keyboard.type(line, { delay: 5 });
  const typed = line.replaceAll(/\s+/g, "");
  await waitUntil(
    page,
    (screen) => screen.replaceAll(/\s+/g, "").endsWith(typed),
    "the typed command",
    15_000,
  );
  await page.keyboard.press("Enter");
}

async function run(page: Page, shot: TerminalShot, step: Step, values: Record<string, string>) {
  if ("hidden" in step) hostShell(shot.terminal, substitute(step.hidden, values));
  else if ("type" in step) await typeCommand(page, substitute(step.type, values));
  else if ("answer" in step) {
    await settle(page, 400, 10_000);
    await typeLine(page, substitute(step.answer, values));
  } else if ("press" in step) {
    await settle(page, 400, 10_000);
    await page.keyboard.press(step.press);
  } else if ("waitFor" in step) {
    const text = substitute(step.waitFor, values);
    await waitUntil(page, (screen) => screen.includes(text), `"${text}"`, step.timeout ?? 600_000);
  } else if ("waitForPrompt" in step) {
    await page.waitForTimeout(500);
    await waitUntil(page, atPrompt, "the shell prompt", step.timeout ?? 600_000);
  } else await page.waitForTimeout(step.wait);
}

async function serialize(page: Page): Promise<{ ansi: string; rows: number }> {
  return page.evaluate(() => {
    const buffer = window.term.buffer.active;
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs inside the page, so it cannot live at module scope
    const color = (cell: XtermCell, fg: boolean): string[] => {
      const def = fg ? cell.isFgDefault() : cell.isBgDefault();
      if (def) return [];
      const value = fg ? cell.getFgColor() : cell.getBgColor();
      const rgb = fg ? cell.isFgRGB() : cell.isBgRGB();
      if (rgb)
        return [
          fg ? "38" : "48",
          "2",
          String((value >> 16) & 255),
          String((value >> 8) & 255),
          String(value & 255),
        ];
      if (value < 8) return [String((fg ? 30 : 40) + value)];
      if (value < 16) return [String((fg ? 90 : 100) + value - 8)];
      return [fg ? "38" : "48", "5", String(value)];
    };
    const style = (cell: XtermCell): string =>
      [
        "0",
        cell.isBold() ? "1" : "",
        cell.isDim() ? "2" : "",
        cell.isItalic() ? "3" : "",
        cell.isUnderline() ? "4" : "",
        cell.isInverse() ? "7" : "",
        ...color(cell, true),
        ...color(cell, false),
      ]
        .filter(Boolean)
        .join(";");
    const blank = (y: number) => (buffer.getLine(y)?.translateToString(true) ?? "") === "";
    let last = buffer.length;
    while (last > 0 && blank(last - 1)) last--;
    let start = 0;
    while (start < last && blank(start)) start++;
    const out: string[] = [];
    for (let y = start; y < last; y++) {
      if (blank(y) && blank(y - 1)) continue;
      const line = buffer.getLine(y);
      if (!line) continue;
      let text = "";
      let current = "";
      const width = line.translateToString(false).length;
      for (let x = 0; x < width; x++) {
        const cell = line.getCell(x);
        if (!cell || cell.getWidth() === 0) continue;
        const sgr = style(cell);
        if (sgr !== current) {
          text += `\u001b[${sgr}m`;
          current = sgr;
        }
        text += cell.getChars() || " ";
      }
      out.push(`${text.replace(/ +$/, "")}\u001b[0m`);
    }
    return { ansi: `${out.join("\r\n")}\u001b[?25l`, rows: out.length };
  });
}

function packageDir(specifier: string): string {
  return dirname(fileURLToPath(import.meta.resolve(specifier)));
}

const REPLAY_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="/dom/terminal.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=block">
<script type="importmap">{"imports":{"@wterm/core":"/core/index.js"}}</script>
<style>
html, body { margin: 0; }
#shot { width: ${WIDTH}px; box-sizing: border-box; padding: ${MARGIN}px; }
#window { border-radius: 12px; overflow: hidden; box-shadow: 0 24px 60px -20px rgba(17, 17, 16, 0.55); }
#bar { display: flex; align-items: center; gap: 8px; height: ${BAR}px; padding: 0 18px; }
#bar i { width: 12px; height: 12px; border-radius: 50%; }
#terminal.wterm { box-sizing: border-box; padding: 0 ${SIDE}px ${BOTTOM}px; border-radius: 0; box-shadow: none; }
</style>
</head>
<body>
<div id="shot"><div id="window">
<div id="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div>
<div id="terminal"></div>
</div></div>
<script type="module">
import { WTerm } from "/dom/index.js";
window.replay = async (ansi, cols, rows, theme, fontSize, rowHeight, backdrop) => {
  const el = document.getElementById("terminal");
  if (theme === "light") el.classList.add("theme-light");
  el.style.setProperty("--term-font-family", "'JetBrains Mono', monospace");
  el.style.setProperty("--term-font-size", fontSize + "px");
  el.style.setProperty("--term-row-height", rowHeight + "px");
  const term = new WTerm(el, { cols, rows, autoResize: false });
  await term.init();
  term.write(ansi);
  await document.fonts.ready;
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  document.getElementById("shot").style.background = backdrop;
  document.getElementById("window").style.background = getComputedStyle(el).getPropertyValue("--term-bg").trim();
};
window.replayReady = true;
</script>
</body>
</html>`;

async function serveReplay(page: Page) {
  const dom = packageDir("@wterm/dom");
  const core = packageDir("@wterm/core");
  const css = fileURLToPath(import.meta.resolve("@wterm/dom/css"));
  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") return route.fulfill({ contentType: "text/html", body: REPLAY_HTML });
    if (path === "/dom/terminal.css") return route.fulfill({ contentType: "text/css", path: css });
    const [, root = "", rest = ""] = /^\/(dom|core)\/(.+)$/.exec(path) ?? [];
    if (!root || rest.includes("..")) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({
      contentType: "text/javascript",
      path: join(root === "dom" ? dom : core, rest),
    });
  });
}

export async function drawTerminal(
  browser: Browser,
  ansi: string,
  rows: number,
  cols: number,
  theme: "light" | "dark",
  file: string,
) {
  const fontSize = Math.floor((WIDTH - 2 * (MARGIN + SIDE)) / (cols * 0.6));
  const rowHeight = Math.round(fontSize * 1.25);
  const height = MARGIN * 2 + BAR + BOTTOM + rows * rowHeight;
  const page = await browser.newPage({ viewport: { width: WIDTH, height }, deviceScaleFactor: 2 });
  try {
    await serveReplay(page);
    await page.goto(`${ORIGIN}/`);
    await page.waitForFunction(() => "replayReady" in window);
    await page.evaluate(
      ([text, c, r, t, size, row, backdrop]) => window.replay(text, c, r, t, size, row, backdrop),
      [ansi, cols, rows, theme, fontSize, rowHeight, BACKDROP[theme]] as const,
    );
    await mkdir(dirname(file), { recursive: true });
    await sharp(await page.locator("#shot").screenshot({ type: "png" }))
      .webp({ quality: 80 })
      .toFile(file);
  } finally {
    await page.close();
  }
}

export async function captureTerminal(
  browser: Browser,
  shot: TerminalShot,
  out: string,
  values: Record<string, string>,
) {
  const port = TTYD_HOST_PORT;
  const cols = shot.cols ?? 100;
  startTerminal(shot.terminal, shot.prompt);
  await waitForTerminal(port);
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  let screen = { ansi: "", rows: 0 };
  try {
    await page.goto(`http://localhost:${port}/`);
    await page.locator(".xterm-rows").waitFor();
    await page.waitForFunction(() => "term" in window);
    await page.evaluate(([c, r]) => window.term.resize(c, r), [
      cols,
      shot.rows ?? LIVE_ROWS,
    ] as const);
    await settle(page, 800, 15_000);
    for (const step of shot.steps) await run(page, shot, step, values);
    await settle(page, 1500, 60_000);
    screen = await serialize(page);
  } finally {
    await page.close();
  }
  if (screen.rows === 0) throw new Error("the terminal showed nothing");
  await drawTerminal(
    browser,
    screen.ansi,
    screen.rows,
    cols,
    "light",
    join(out, `${shot.name}.webp`),
  );
  await drawTerminal(
    browser,
    screen.ansi,
    screen.rows,
    cols,
    "dark",
    join(out, `${shot.name}-dark.webp`),
  );
}
