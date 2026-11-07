export type UrlMapper = (url: string) => string | null;

export interface SrcsetCandidate {
  url: string;
  descriptor: string;
}

export function parseSrcset(value: string): SrcsetCandidate[] {
  const out: SrcsetCandidate[] = [];
  let i = 0;
  while (i < value.length) {
    while (i < value.length && /[\s,]/.test(value[i] ?? "")) i++;
    if (i >= value.length) break;
    let url = "";
    while (i < value.length && !/\s/.test(value[i] ?? "")) url += value[i++];
    let descriptor = "";
    if (url.endsWith(",")) {
      url = url.replace(/,+$/, "");
    } else {
      let depth = 0;
      while (i < value.length) {
        const c = value[i] ?? "";
        if (c === "(") depth++;
        else if (c === ")") depth = Math.max(0, depth - 1);
        else if (c === "," && depth === 0) break;
        descriptor += c;
        i++;
      }
      i++;
    }
    if (url) out.push({ url, descriptor: descriptor.trim() });
  }
  return out;
}

export function serializeSrcset(candidates: SrcsetCandidate[]): string {
  return candidates.map((c) => (c.descriptor ? `${c.url} ${c.descriptor}` : c.url)).join(", ");
}

export function isRemoteUrl(url: string): boolean {
  return /^(?:https?:)?\/\//i.test(url.trim());
}

export function isInlineUrl(url: string): boolean {
  return /^(?:data|cid|blob):/i.test(url.trim());
}

export function absoluteRemote(url: string): URL | null {
  const trimmed = url.trim();
  if (!isRemoteUrl(trimmed)) return null;
  try {
    const parsed = new URL(trimmed.startsWith("//") ? `https:${trimmed}` : trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed : null;
  } catch {
    return null;
  }
}
