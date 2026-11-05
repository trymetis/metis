const SIZE = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)?$/i;
const SIZE_UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
  tb: 1024 ** 4,
};

export function parseSize(raw: string): number | null {
  const match = SIZE.exec(raw.trim());
  if (!match) return null;
  const unit = (match[2] ?? "b").toLowerCase();
  const factor = SIZE_UNITS[unit];
  if (!factor) return null;
  return Math.round(Number(match[1]) * factor);
}
