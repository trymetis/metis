import type { CSSProperties } from "react";

import { isThemeColor, THEME_TOKENS, type ThemePalette, type ThemeTokens } from "./tokens";

const THEME_ID_PATTERN = /^[a-z0-9-]+$/;

function declarations(tokens: ThemeTokens): string {
  return THEME_TOKENS.map((token) => {
    const value = tokens[token];
    if (!isThemeColor(value)) throw new Error(`[theme] invalid ${token} value`);
    return `--${token}:${value};`;
  }).join("");
}

export function themeCss(id: string, palette: ThemePalette): string {
  if (!THEME_ID_PATTERN.test(id)) throw new Error("[theme] invalid theme id");
  const selector = `html[data-brand="${id}"]`;
  return `${selector}{${declarations(palette.light)}}html.dark[data-brand="${id}"]{${declarations(palette.dark)}}`;
}

export function themeStyle(tokens: ThemeTokens): CSSProperties {
  return Object.fromEntries(
    THEME_TOKENS.filter((token) => isThemeColor(tokens[token])).map((token) => [
      `--${token}`,
      tokens[token],
    ]),
  );
}
