import type { Page } from "@playwright/test";
import { z } from "zod";

import { VIEWPORT } from "./browser.ts";

export const boxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type Box = z.infer<typeof boxSchema>;

function contentBox(el: Element, scrolled: boolean): Box {
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
    x: rect.left + (scrolled ? window.scrollX : 0),
    y: rect.top + (scrolled ? window.scrollY : 0),
    width: rect.width,
    height: end - rect.top,
  };
}

function enclose(boxes: Box[], pad: number, bounds: { width: number; height: number }): Box {
  const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const right = Math.min(bounds.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
  const bottom = Math.min(bounds.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
  return { x, y, width: right - x, height: bottom - y };
}

function selectors(element: string | string[]): string[] {
  return Array.isArray(element) ? element : [element];
}

export async function pageRegion(page: Page, element: string | string[], pad: number) {
  const boxes: Box[] = [];
  for (const selector of selectors(element))
    boxes.push(await page.locator(selector).first().evaluate(contentBox, true));
  const doc = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  return enclose(boxes, pad, doc);
}

export async function viewportRegion(
  page: Page,
  element: string | string[],
  pad: number,
): Promise<Box | null> {
  const boxes: Box[] = [];
  for (const selector of selectors(element)) {
    const loc = page.locator(selector).first();
    if (!(await loc.isVisible().catch(() => false))) return null;
    boxes.push(await loc.evaluate(contentBox, false));
  }
  const box = enclose(boxes, pad, page.viewportSize() ?? VIEWPORT);
  return box.width < 8 || box.height < 8 ? null : box;
}
