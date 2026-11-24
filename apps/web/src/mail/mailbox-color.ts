import { paletteMark, paletteText } from "@/lib/palette";

export function mailboxChipStyle(email: string): {
  label: string;
  bg: string;
  fg: string;
} {
  const color = paletteText(email.toLowerCase());
  return {
    label: email,
    bg: `color-mix(in srgb, ${color} 15%, transparent)`,
    fg: color,
  };
}

export function mailboxMarkColor(email: string): string {
  return paletteMark(email.toLowerCase());
}
