import { decodeHTML } from "entities";

export const MAX_BODY_CHARS = 1_000_000;

const SNIPPET_CHARS = 200;
const SNIPPET_SCAN_CHARS = 65_536;
const INVISIBLE_CHARS = new RegExp(
  "\\u034F|[\\u00AD\\u061C\\u115F\\u1160\\u17B4\\u17B5\\u180E\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u206A-\\u206F\\u3164\\uFEFF\\uFFA0]",
  "g",
);

export function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

function visibleHtmlText(html: string): string {
  const body = html.search(/<body[\s>]/i);
  const start = body >= 0 ? body : 0;
  const markup = html
    .slice(start, start + SNIPPET_SCAN_CHARS)
    .replace(/<!--[\s\S]*?(?:-->|$)/g, " ")
    .replace(/<(head|title|style|script|noscript|template|xml|svg)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, " ")
    .replace(/<[^>]*(?:>|$)/g, " ");
  return decodeHTML(markup);
}

function previewLine(value: string): string {
  return value.replace(INVISIBLE_CHARS, "").replace(/\s+/g, " ").trim().slice(0, SNIPPET_CHARS);
}

export function snippetOf(
  text: string | null | undefined,
  html: string | null | undefined,
): string {
  const fromHtml = html ? previewLine(visibleHtmlText(html)) : "";
  if (fromHtml) return fromHtml;
  return text ? previewLine(text.slice(0, SNIPPET_SCAN_CHARS)) : "";
}

export function truncate(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length > MAX_BODY_CHARS ? value.slice(0, MAX_BODY_CHARS) : value;
}

export function firstMessageId(references: string | null | undefined): string | null {
  const match = (references ?? "").match(/<[^<>]+>/);
  return match ? match[0] : null;
}

export function bracketMessageId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const bare = trimmed.replace(/^<|>$/g, "");
  return bare ? `<${bare.slice(0, 996)}>` : null;
}

export function normalizeThreadKey(value: string): string {
  return value.replace(/[<>]/g, "").trim();
}

export function likePattern(query: string): string {
  return `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
}
