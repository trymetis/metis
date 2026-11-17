import { themeCss } from "./css";
import { defaultSystemTheme } from "./system";
import type { ThemePalette } from "./tokens";

export interface ActiveTheme {
  id: string;
  css: string;
  version: number;
}

export function activeTheme(
  stored: { id: string; palette: ThemePalette; updatedAt: Date } | null,
): ActiveTheme {
  if (stored) {
    return {
      id: stored.id,
      css: themeCss(stored.id, stored.palette),
      version: stored.updatedAt.getTime(),
    };
  }
  const fallback = defaultSystemTheme();
  return { id: fallback.id, css: themeCss(fallback.id, fallback.palette), version: 0 };
}

export function themeStyleHref(theme: ActiveTheme): string {
  return `metis-theme-${theme.id}-${theme.version}`;
}
