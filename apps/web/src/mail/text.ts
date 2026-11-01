import { escapeText } from "entities";

export function textToHtml(text: string): string {
  return `<p>${escapeText(text).replace(/\r?\n/g, "<br>")}</p>`;
}
