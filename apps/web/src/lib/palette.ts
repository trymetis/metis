import { fnv1a } from "./utils";

const PALETTE = ["red", "orange", "green", "teal", "blue", "purple", "navy", "gray"] as const;

type PaletteColor = (typeof PALETTE)[number];

function paletteKey(seed: string): PaletteColor {
  // oxlint-disable-next-line typescript/no-non-null-assertion --modulo of a non-empty array
  return PALETTE[fnv1a(seed) % PALETTE.length]!;
}

export function paletteText(seed: string): string {
  return `var(--label-custom-${paletteKey(seed)})`;
}

export function paletteMark(seed: string): string {
  return `var(--label-custom-${paletteKey(seed)}-mark)`;
}
