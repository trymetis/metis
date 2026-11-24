import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { type Browser, chromium, type Page, type PageScreenshotOptions } from "@playwright/test";
import sharp from "sharp";

export const RENDER_FLAGS = [
  "--disable-lcd-text",
  "--font-render-hinting=none",
  "--disable-font-subpixel-positioning",
  "--disable-skia-runtime-opts",
  "--force-color-profile=srgb",
  "--disable-gpu",
];

export const VIEWPORT = { width: 1440, height: 900 };

export function launch(cdpUrl?: string): Promise<Browser> {
  return cdpUrl
    ? chromium.connectOverCDP(cdpUrl)
    : chromium.launch({ channel: "chrome", headless: true, args: RENDER_FLAGS });
}

export function contextOptions(baseURL: string) {
  return {
    baseURL,
    viewport: { ...VIEWPORT },
    deviceScaleFactor: 2,
    colorScheme: "light" as const,
    timezoneId: "UTC",
    locale: "en-US",
    extraHTTPHeaders: { "X-Forwarded-For": "203.0.113.10" },
  };
}

export async function writeWebp(png: Buffer, file: string) {
  await mkdir(dirname(file), { recursive: true });
  await sharp(png).webp({ quality: 80 }).toFile(file);
}

export async function shoot(page: Page, file: string, options: PageScreenshotOptions = {}) {
  await writeWebp(await page.screenshot({ ...options, type: "png" }), file);
}
