export type MessageHeaders = Record<string, string>;

export function pickHeaders(
  headers: { name?: string | null; value?: string | null }[],
  names: string[],
): MessageHeaders {
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  const out: MessageHeaders = {};
  for (const header of headers) {
    const name = header.name?.toLowerCase();
    if (!name || !wanted.has(name) || out[name] !== undefined) continue;
    const value = header.value?.trim();
    if (value) out[name] = value;
  }
  return out;
}

export function isMixedMultipart(contentType: string | undefined): boolean {
  return /^\s*multipart\/mixed\b/i.test(contentType ?? "");
}

function mimeText(raw: string): string {
  if (/^[A-Za-z-]+:/m.test(raw.slice(0, 2000))) return raw;
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    return /^[A-Za-z-]+:/m.test(decoded) ? decoded : raw;
  } catch {
    return raw;
  }
}

export function headersFromRaw(raw: string, names: string[]): MessageHeaders {
  const block = mimeText(raw).split(/\r?\n\r?\n/, 1)[0] ?? "";
  const lines = block.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/);
  return pickHeaders(
    lines.map((line) => {
      const colon = line.indexOf(":");
      return colon === -1
        ? {}
        : { name: line.slice(0, colon).trim(), value: line.slice(colon + 1) };
    }),
    names,
  );
}
