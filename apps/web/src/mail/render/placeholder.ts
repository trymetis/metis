import { declaredValues } from "./css";
export const BLOCKED_SRC_ATTR = "data-metis-src";

const DEFAULT_SIZE = 48;
const ICON_SIZE = 20;
const ICON_MIN_BOX = 28;
const MAX_SIZE = 4096;

const IMAGE_OFF_ICON =
  '<line x1="2" x2="22" y1="2" y2="22"/><path d="M10.41 10.41a2 2 0 1 1-2.83-2.83"/><line x1="13.5" x2="6" y1="13.5" y2="21"/><line x1="18" x2="21" y1="12" y2="15"/><path d="M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59"/><path d="M21 15V5a2 2 0 0 0-2-2H9"/>';

function pixels(value: string | null): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(?:px)?$/i);
  if (!match?.[1]) return null;
  const n = Math.round(Number.parseFloat(match[1]));
  return n > 0 ? Math.min(n, MAX_SIZE) : null;
}

function styleSize(style: Map<string, string>, prop: "width" | "height"): number | null {
  const match = /^(\d+(?:\.\d+)?)px\b/i.exec(style.get(prop) ?? "");
  return pixels(match?.[1] ?? null);
}

export function declaredSize(el: Element): {
  width: number;
  height: number;
} {
  const style = declaredValues(el.getAttribute("style") ?? "");
  const width = pixels(el.getAttribute("width")) ?? styleSize(style, "width");
  const height = pixels(el.getAttribute("height")) ?? styleSize(style, "height");
  if (width && height) return { width, height };
  if (width) return { width, height: DEFAULT_SIZE };
  if (height) return { width: Math.round((height * 16) / 9), height };
  return { width: DEFAULT_SIZE, height: DEFAULT_SIZE };
}

export function placeholderImage(width: number, height: number): string {
  const icon =
    width >= ICON_MIN_BOX && height >= ICON_MIN_BOX
      ? `<g transform="translate(${(width - ICON_SIZE) / 2} ${(height - ICON_SIZE) / 2}) scale(${ICON_SIZE / 24})" fill="none" stroke="#8a8a8a" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${IMAGE_OFF_ICON}</g>`
      : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" rx="${Math.min(6, width / 4, height / 4)}" fill="#8a8a8a" fill-opacity="0.16"/>${icon}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
