import { fnv1a } from "@/lib/utils";
import type { CustomLabelColor } from "@/types/mail";

import { customLabelColor, customLabelMark } from "./label-meta";

const ACCOUNT_PALETTE: readonly CustomLabelColor[] = [
  "red",
  "orange",
  "green",
  "teal",
  "blue",
  "purple",
  "navy",
  "gray",
];

function paletteKey(email: string): CustomLabelColor {
  // oxlint-disable-next-line typescript/no-non-null-assertion --modulo of a non-empty array
  return ACCOUNT_PALETTE[fnv1a(email.toLowerCase()) % ACCOUNT_PALETTE.length]!;
}

export function mailboxChipStyle(email: string): {
  label: string;
  bg: string;
  fg: string;
} {
  const color = customLabelColor(paletteKey(email));
  return {
    label: email,
    bg: `color-mix(in srgb, ${color} 15%, transparent)`,
    fg: color,
  };
}

export function mailboxMarkColor(email: string): string {
  return customLabelMark(paletteKey(email));
}
