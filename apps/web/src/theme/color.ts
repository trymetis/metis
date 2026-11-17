export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

export function parseColor(value: string): Rgba | null {
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value.trim());
  if (hex) {
    const n = Number.parseInt(hex[1] ?? "", 16);
    const alpha = hex[2] ? Number.parseInt(hex[2], 16) / 255 : 1;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: alpha };
  }
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i.exec(value.trim());
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: Number(rgba[4]),
    };
  }
  return null;
}

function channelHex(value: number): string {
  return Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, "0");
}

export function toHex({ r, g, b }: Pick<Rgba, "r" | "g" | "b">): string {
  return `#${channelHex(r)}${channelHex(g)}${channelHex(b)}`;
}

export function toRgba({ r, g, b }: Pick<Rgba, "r" | "g" | "b">, alpha: number): string {
  const a = Math.round(alpha * 100) / 100;
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(channel: number): number {
  const c = channel <= 0.003_130_8 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
  return c * 255;
}

export function rgbToOklch({ r, g, b }: Pick<Rgba, "r" | "g" | "b">): Oklch {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.412_221_470_8 * lr + 0.536_332_536_3 * lg + 0.051_445_992_9 * lb);
  const m = Math.cbrt(0.211_903_498_2 * lr + 0.680_699_545_1 * lg + 0.107_396_956_6 * lb);
  const s = Math.cbrt(0.088_302_461_9 * lr + 0.281_718_837_6 * lg + 0.629_978_700_5 * lb);
  const L = 0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s;
  const A = 1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s;
  const B = 0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s;
  const c = Math.hypot(A, B);
  const h = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const A = c * Math.cos(rad);
  const B = c * Math.sin(rad);
  const lc = (l + 0.396_337_777_4 * A + 0.215_803_757_3 * B) ** 3;
  const mc = (l - 0.105_561_345_8 * A - 0.063_854_172_8 * B) ** 3;
  const sc = (l - 0.089_484_177_5 * A - 1.291_485_548 * B) ** 3;
  return [
    4.076_741_662_1 * lc - 3.307_711_591_3 * mc + 0.230_969_929_2 * sc,
    -1.268_438_004_6 * lc + 2.609_757_401_1 * mc - 0.341_319_396_5 * sc,
    -0.004_196_086_3 * lc - 0.703_418_614_7 * mc + 1.707_614_701 * sc,
  ];
}

function inGamut(channels: [number, number, number]): boolean {
  return channels.every((v) => v >= -0.0001 && v <= 1.0001);
}

export function oklchToRgb(color: Oklch): Pick<Rgba, "r" | "g" | "b"> {
  let low = 0;
  let high = color.c;
  let channels = oklchToLinear(color);
  if (!inGamut(channels)) {
    for (let i = 0; i < 24; i += 1) {
      const mid = (low + high) / 2;
      if (inGamut(oklchToLinear({ ...color, c: mid }))) low = mid;
      else high = mid;
    }
    channels = oklchToLinear({ ...color, c: low });
  }
  const [r, g, b] = channels.map((v) => fromLinear(Math.min(1, Math.max(0, v))));
  return { r: r ?? 0, g: g ?? 0, b: b ?? 0 };
}

export function oklchHex(color: Oklch): string {
  return toHex(oklchToRgb(color));
}

function blend(top: Rgba, bottom: Pick<Rgba, "r" | "g" | "b">): Pick<Rgba, "r" | "g" | "b"> {
  return {
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
  };
}

function luminance({ r, g, b }: Pick<Rgba, "r" | "g" | "b">): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrastRatio(foreground: string, background: string): number | null {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) return null;
  const solidBg = blend(bg, { r: 255, g: 255, b: 255 });
  const solidFg = blend(fg, solidBg);
  const a = luminance(solidFg);
  const b = luminance(solidBg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
