import "server-only";
import { formatAddresses, headerValue, parseRaw } from "./source";

export const SHOWN_LIMIT = 1_000_000;

export const AUTH_METHODS = ["spf", "dkim", "dmarc"] as const;
export type AuthMethod = (typeof AUTH_METHODS)[number];

export interface AuthenticationResults {
  reportedBy: string | null;
  results: Record<AuthMethod, string | null>;
}

export interface OriginalSummary {
  messageId: string;
  date: string;
  from: string;
  to: string;
  subject: string;
  auth: AuthenticationResults;
}

export function authenticationResults(value: string | undefined): AuthenticationResults {
  const [head = "", ...rest] = (value ?? "").split(";");
  const body = rest.join(";");
  const result = (method: AuthMethod) =>
    new RegExp(`(?:^|[\\s;])${method}\\s*=\\s*([a-z]+)`, "i").exec(body)?.[1]?.toLowerCase() ??
    null;
  return {
    reportedBy: head.trim().split(/\s+/)[0] || null,
    results: { spf: result("spf"), dkim: result("dkim"), dmarc: result("dmarc") },
  };
}

export async function summarizeOriginal(raw: string): Promise<OriginalSummary> {
  const email = await parseRaw(raw);
  return {
    messageId: email.messageId ?? "",
    date: headerValue(email, "date") ?? "",
    from: formatAddresses(email.from),
    to: formatAddresses(email.to),
    subject: email.subject ?? "",
    auth: authenticationResults(headerValue(email, "authentication-results")),
  };
}

function emlName(subject: string): string {
  const base = subject
    .replace(/[^\w .-]+/g, "_")
    .trim()
    .slice(0, 80);
  return `${base || "message"}.eml`;
}

export async function originalDownload(raw: string): Promise<Response> {
  const { subject } = await summarizeOriginal(raw);
  return new Response(raw, {
    headers: {
      "Content-Type": "message/rfc822",
      "Content-Disposition": `attachment; filename="${emlName(subject)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
