import "server-only";
import { randomBytes } from "node:crypto";

import { tryAgainIn } from "@/lib/rate-limit-message";

const STYLE = `
:root { color-scheme: light dark; }
body { margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; font-family: ui-sans-serif, system-ui, sans-serif; background: #fff; color: #171717; }
main { max-width: 24rem; text-align: center; }
h1 { margin: 0 0 8px; font-size: 1.5rem; font-weight: 600; letter-spacing: -0.01em; }
p { margin: 0; font-size: 0.875rem; color: #525252; }
@media (prefers-color-scheme: dark) { body { background: #0a0a0a; color: #f5f5f5; } p { color: #a3a3a3; } }
`;

function retryAfterSeconds(response: Response): number | null {
  const header = response.headers.get("X-Retry-After");
  if (header === null) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 1;
}

function rateLimitedPage(retryAfter: number): Response {
  const nonce = randomBytes(18).toString("base64");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Too many requests</title><style nonce="${nonce}">${STYLE}</style></head><body><main><h1>Too many requests</h1><p>${tryAgainIn(retryAfter)}</p></main></body></html>`;
  return new Response(html, {
    status: 429,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `default-src 'none'; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      "Cache-Control": "no-store",
      "Retry-After": String(retryAfter),
    },
  });
}

export function rateLimitedAuthResponse(request: Request, response: Response): Response {
  if (response.status !== 429) return response;
  const retryAfter = retryAfterSeconds(response);
  if (retryAfter === null) return response;
  if (request.method === "GET" && (request.headers.get("accept") ?? "").includes("text/html")) {
    return rateLimitedPage(retryAfter);
  }
  const headers = new Headers(response.headers);
  headers.set("Retry-After", String(retryAfter));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
