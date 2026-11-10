import { escapeText } from "entities";

export const SIGNATURE_ATTR = "data-metis-signature";
export const FOOTER_ATTR = "data-metis-footer";

export const SIGNATURE_HTML_MAX = 20_000;
export const SIGNATURE_NAME_MAX = 80;
export const SIGNATURES_PER_OWNER_MAX = 25;

export interface SignatureVariables {
  name: string;
  email: string;
}

export function fillSignatureVariables(html: string, vars: SignatureVariables): string {
  return html
    .replace(/\{\{\s*name\s*\}\}/gi, escapeText(vars.name))
    .replace(/\{\{\s*email\s*\}\}/gi, escapeText(vars.email));
}

export function signatureBlock(id: string, html: string): string {
  return `<div ${SIGNATURE_ATTR}="${escapeText(id)}">${html}</div>`;
}

export function footerBlock(html: string): string {
  return `<div ${FOOTER_ATTR}="">${html}</div>`;
}

export function hasSignatureBlock(html: string | undefined): boolean {
  return !!html && html.includes(`${SIGNATURE_ATTR}=`);
}

export function htmlToPlainLines(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
