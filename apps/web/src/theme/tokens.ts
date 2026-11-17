export const THEME_TOKENS = [
  "bg-base",
  "bg-panel",
  "bg-surface",
  "bg-hover",
  "bg-active",
  "bg-selected",
  "border",
  "border-soft",
  "text-primary",
  "text-secondary",
  "text-muted",
  "text-faint",
  "brand",
  "brand-text",
  "brand-on-tint",
  "brand-mark",
  "brand-soft",
  "brand-glow",
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];

export type ThemeTokens = Record<ThemeToken, string>;

export const THEME_MODES = ["light", "dark"] as const;

export type ThemeMode = (typeof THEME_MODES)[number];

export type ThemePalette = Record<ThemeMode, ThemeTokens>;

export const THEME_TINTS = ["none", "light", "strong"] as const;

export type ThemeTint = (typeof THEME_TINTS)[number];

export const THEME_NAME_MAX = 40;

export const THEMES_PER_OWNER_MAX = 50;

export const THEME_COLOR_PATTERN =
  /^(#[0-9a-f]{6}([0-9a-f]{2})?|rgba\((25[0-5]|2[0-4]\d|1?\d?\d), (25[0-5]|2[0-4]\d|1?\d?\d), (25[0-5]|2[0-4]\d|1?\d?\d), (0|1|0?\.\d{1,3})\))$/;

export function normalizeThemeColor(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(trimmed);
  if (!rgba) return trimmed;
  const [, r, g, b, a] = rgba;
  return `rgba(${Number(r)}, ${Number(g)}, ${Number(b)}, ${Number(a)})`;
}

export function isThemeColor(value: string): boolean {
  return THEME_COLOR_PATTERN.test(value);
}
