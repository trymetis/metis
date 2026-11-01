import "server-only";
import { randomBytes } from "node:crypto";

import type { ReactElement } from "react";

export function newNonce(): string {
  return randomBytes(18).toString("base64");
}

export function pagePolicy(nonce: string): string {
  return `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
}

export function pageHeaders(policy: string): HeadersInit {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": policy,
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

async function renderStream(element: ReactElement): Promise<ReadableStream<Uint8Array>> {
  const { renderToReadableStream } = await import("react-dom/server");
  const stream = await renderToReadableStream(element);
  await stream.allReady;
  return stream;
}

export async function renderMarkup(element: ReactElement): Promise<string> {
  return new Response(await renderStream(element)).text();
}

export async function renderPage(
  element: ReactElement,
  policy: string,
  status = 200,
): Promise<Response> {
  return new Response(await renderStream(element), { status, headers: pageHeaders(policy) });
}
