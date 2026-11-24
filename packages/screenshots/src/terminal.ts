import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Browser, Page } from "@playwright/test";

import { writeWebp } from "./browser.ts";
import type { TerminalEntry, TerminalStep } from "./entries.ts";

const ORIGIN = "http://terminal.local";
const WIDTH = 1440;
const MARGIN = 48;
const BAR = 40;
const SIDE = 24;
const BOTTOM = 20;
const LIVE_ROWS = 30;
const LIVE_COLS = 100;
const BACKDROP: Record<Theme, string> = { light: "#f4f1e8", dark: "#0f0f0f" };

export type Theme = "light" | "dark";

export interface TerminalHost {
  port: number;
  start(prompt: string | undefined): void;
  shell(line: string): string;
}

export function ttyd(port: number, shell: string[], options: string[] = []): string[] {
  return [
    "ttyd",
    "--once",
    "-p",
    String(port),
    ...options,
    "-W",
    "-t",
    "rendererType=dom",
    "-t",
    "fontSize=15",
    "-t",
    "disableLeaveAlert=true",
    "-t",
    "disableResizeOverlay=true",
    ...shell,
  ];
}

export interface XtermCell {
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

declare global {
  interface Window {
    term: { buffer: { active: XtermBuffer }; resize(cols: number, rows: number): void };
    replay: (...args: unknown[]) => Promise<void>;
    replayReady?: boolean;
  }
}

export type ScreenReader = (page: Page) => Promise<string>;

export const bufferText: ScreenReader = (page) =>
  page.evaluate(() => {
    const buffer = window.term.buffer.active;
    const lines: string[] = [];
    for (let y = 0; y < buffer.length; y++)
      lines.push(buffer.getLine(y)?.translateToString(true) ?? "");
    return lines.join("\n");
  });

export const visibleText: ScreenReader = (page) => page.locator(".xterm-rows").innerText();

export async function settle(
  page: Page,
  quietMs: number,
  timeoutMs: number,
  read: ScreenReader = bufferText,
) {
  const end = Date.now() + timeoutMs;
  let last = await read(page);
  let since = Date.now();
  while (Date.now() < end) {
    await page.waitForTimeout(250);
    const now = await read(page);
    if (now !== last) {
      last = now;
      since = Date.now();
    } else if (Date.now() - since >= quietMs) return;
  }
}

export async function waitUntil(
  page: Page,
  test: (text: string) => boolean,
  what: string,
  timeoutMs: number,
  read: ScreenReader = bufferText,
) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (test(await read(page))) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`${what} did not appear within ${timeoutMs} ms`);
}

export async function typeLine(page: Page, line: string, delay = 0) {
  await page.locator(".xterm-helper-textarea").focus();
  await page.keyboard.type(line, { delay });
  await page.keyboard.press("Enter");
}

export async function waitForTtyd(port: number, tries = 100) {
  for (let i = 0; i < tries; i++) {
    const ok = await fetch(`http://localhost:${port}/`)
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`ttyd did not answer on port ${port}`);
}

function substitute(text: string, values: Record<string, string>): string {
  return text.replaceAll(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
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

async function run(
  page: Page,
  host: TerminalHost,
  step: TerminalStep,
  values: Record<string, string>,
) {
  if ("hidden" in step) host.shell(substitute(step.hidden, values));
  else if ("type" in step) await typeCommand(page, substitute(step.type, values));
  else if ("answer" in step) {
    await settle(page, 400, 10_000);
    await typeLine(page, substitute(step.answer, values), 5);
  } else if ("press" in step) {
    await settle(page, 400, 10_000);
    await page.keyboard.press(step.press);
  } else if ("waitFor" in step) {
    const text = substitute(step.waitFor, values);
    const want = step.ignoreCase ? text.toLowerCase() : text;
    await waitUntil(
      page,
      (screen) => (step.ignoreCase ? screen.toLowerCase() : screen).includes(want),
      `"${text}"`,
      step.timeout ?? 600_000,
    );
  } else if ("waitForPrompt" in step) {
    await page.waitForTimeout(500);
    await waitUntil(page, atPrompt, "the shell prompt", step.timeout ?? 600_000);
  } else if ("settle" in step) await settle(page, step.settle, 60_000);
  else await page.waitForTimeout(step.wait);
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

async function drawTerminal(
  browser: Browser,
  ansi: string,
  rows: number,
  cols: number,
  theme: Theme,
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
    await writeWebp(await page.locator("#shot").screenshot({ type: "png" }), file);
  } finally {
    await page.close();
  }
}

export async function captureTerminal(
  browser: Browser,
  entry: TerminalEntry,
  host: TerminalHost,
  files: Partial<Record<Theme, string>>,
  values: Record<string, string> = {},
) {
  const cols = entry.cols ?? LIVE_COLS;
  host.start(entry.terminal === "cli-host" ? entry.prompt : undefined);
  await waitForTtyd(host.port);
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  let screen = { ansi: "", rows: 0 };
  try {
    await page.goto(`http://localhost:${host.port}/`);
    await page.locator(".xterm-rows").waitFor();
    await page.waitForFunction(() => "term" in window);
    await page.evaluate(([c, r]) => window.term.resize(c, r), [
      cols,
      entry.rows ?? LIVE_ROWS,
    ] as const);
    await settle(page, 800, 15_000);
    try {
      for (const step of entry.steps) await run(page, host, step, values);
    } catch (error) {
      const failed = join(tmpdir(), `terminal-failed-${entry.name.replaceAll("/", "-")}.webp`);
      await writeWebp(await page.screenshot({ type: "png" }), failed);
      throw new Error(`${String(error)} (screen at failure: ${failed})`, { cause: error });
    }
    await settle(page, 1500, 60_000);
    screen = await serialize(page);
  } finally {
    await page.close();
  }
  if (screen.rows === 0) throw new Error("the terminal showed nothing");
  for (const theme of ["light", "dark"] as const) {
    const file = files[theme];
    if (file) await drawTerminal(browser, screen.ansi, screen.rows, cols, theme, file);
  }
}
