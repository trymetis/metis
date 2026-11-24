import { ORPCError } from "@orpc/client";

function waitText(retryAfterSec: number): string {
  if (retryAfterSec < 60) return `${retryAfterSec} second${retryAfterSec === 1 ? "" : "s"}`;
  const minutes = Math.ceil(retryAfterSec / 60);
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export function tryAgainIn(retryAfterSec: number): string {
  return `Try again in ${waitText(Math.max(1, Math.ceil(retryAfterSec)))}.`;
}

export function rateLimitMessage(retryAfterSec: number, subject = "requests"): string {
  return `Too many ${subject}. ${tryAgainIn(retryAfterSec)}`;
}

export function rateLimitWait(err: unknown): number | null {
  if (!(err instanceof ORPCError) || err.code !== "TOO_MANY_REQUESTS") return null;
  const data: unknown = err.data;
  const sec =
    data && typeof data === "object" && "retryAfterSec" in data ? Number(data.retryAfterSec) : NaN;
  return Number.isFinite(sec) && sec > 0 ? sec : 1;
}
