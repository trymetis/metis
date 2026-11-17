import {
  contrastRatio,
  type Oklch,
  oklchHex,
  oklchToRgb,
  parseColor,
  rgbToOklch,
  toRgba,
} from "./color";
import type { ThemeMode, ThemePalette, ThemeTint, ThemeTokens } from "./tokens";

const TINT_STRENGTH: Record<ThemeTint, number> = { none: 0, light: 0.5, strong: 1 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function generatePalette({
  accent,
  tint,
}: {
  accent: string;
  tint: ThemeTint;
}): ThemePalette {
  const parsed = parseColor(accent) ?? { r: 176, g: 125, b: 31, a: 1 };
  const base = rgbToOklch(parsed);
  const s = TINT_STRENGTH[tint] * Math.min(1, base.c / 0.12);
  const at = (l: number, c: number): string => oklchHex({ l, c: c * s, h: base.h });
  const accentAt = (l: number): Oklch => ({ l, c: base.c, h: base.h });

  const lightBrandL = clamp(base.l, 0.45, 0.62);
  const lightTextL = Math.min(lightBrandL, 0.5);
  const lightBrand = oklchToRgb(accentAt(lightBrandL));
  const ink = oklchToRgb({ l: 0.3, c: 0.03 * s, h: base.h });

  const light: ThemeTokens = {
    "bg-base": at(0.985, 0.012),
    "bg-panel": at(0.962, 0.018),
    "bg-surface": "#ffffff",
    "bg-hover": at(0.935, 0.022),
    "bg-active": at(0.91, 0.028),
    "bg-selected": at(0.9, 0.04),
    border: toRgba(ink, 0.1),
    "border-soft": toRgba(ink, 0.05),
    "text-primary": at(0.26, 0.02),
    "text-secondary": at(0.5, 0.025),
    "text-muted": at(0.7, 0.02),
    "text-faint": at(0.55, 0.02),
    brand: oklchHex(accentAt(lightBrandL)),
    "brand-text": oklchHex(accentAt(lightTextL)),
    "brand-on-tint": oklchHex(accentAt(lightTextL - 0.04)),
    "brand-mark": oklchHex(accentAt(lightBrandL)),
    "brand-soft": toRgba(lightBrand, 0.15),
    "brand-glow": toRgba(lightBrand, 0.08),
  };

  const darkBrandL = clamp(base.l, 0.68, 0.8);
  const darkBrand = oklchToRgb(accentAt(darkBrandL));
  const white = { r: 255, g: 255, b: 255 };

  const dark: ThemeTokens = {
    "bg-base": at(0.17, 0.006),
    "bg-panel": at(0.195, 0.008),
    "bg-surface": at(0.22, 0.01),
    "bg-hover": at(0.245, 0.012),
    "bg-active": at(0.26, 0.014),
    "bg-selected": at(0.285, 0.02),
    border: toRgba(white, 0.07),
    "border-soft": toRgba(white, 0.04),
    "text-primary": at(0.92, 0.015),
    "text-secondary": at(0.66, 0.015),
    "text-muted": at(0.43, 0.012),
    "text-faint": at(0.6, 0.012),
    brand: oklchHex(accentAt(darkBrandL)),
    "brand-text": oklchHex(accentAt(darkBrandL)),
    "brand-on-tint": oklchHex(accentAt(Math.min(0.9, darkBrandL + 0.04))),
    "brand-mark": oklchHex(accentAt(darkBrandL)),
    "brand-soft": toRgba(darkBrand, 0.12),
    "brand-glow": toRgba(darkBrand, 0.06),
  };

  return { light, dark };
}

export interface ContrastIssue {
  mode: ThemeMode;
  label: string;
  ratio: number;
  min: number;
}

const CONTRAST_CHECKS: {
  label: string;
  fg: keyof ThemeTokens;
  bg: keyof ThemeTokens;
  min: number;
}[] = [
  { label: "Text on the page", fg: "text-primary", bg: "bg-base", min: 4.5 },
  { label: "Secondary text on the page", fg: "text-secondary", bg: "bg-base", min: 4.5 },
  { label: "Faint text on the page", fg: "text-faint", bg: "bg-base", min: 4.5 },
  { label: "Secondary text on panels", fg: "text-secondary", bg: "bg-panel", min: 4.5 },
  { label: "Accent text on the page", fg: "brand-text", bg: "bg-base", min: 4.5 },
  { label: "Button text on the accent", fg: "bg-base", bg: "brand", min: 3 },
];

export function contrastIssues(palette: ThemePalette): ContrastIssue[] {
  const issues: ContrastIssue[] = [];
  for (const mode of ["light", "dark"] as const) {
    const tokens = palette[mode];
    for (const check of CONTRAST_CHECKS) {
      const ratio = contrastRatio(tokens[check.fg], tokens[check.bg]);
      if (ratio !== null && ratio < check.min) {
        issues.push({
          mode,
          label: check.label,
          ratio: Math.round(ratio * 10) / 10,
          min: check.min,
        });
      }
    }
  }
  return issues;
}
