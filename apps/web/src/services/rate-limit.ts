import "server-only";
import { getCache } from "./cache";

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetMs: number;
}

export interface RateLimitRule {
  scope: string;
  limit: number;
  windowSec: number;
}

export async function rateLimit(identifier: string, rule: RateLimitRule) {
  const windowMs = rule.windowSec * 1000;
  const key = `rl:${rule.scope}:${identifier}`;
  const n = await getCache().incr(key, rule.windowSec);
  if (n > rule.limit) {
    return { ok: false, remaining: 0, resetMs: windowMs };
  }
  return {
    ok: true,
    remaining: rule.limit - n,
    resetMs: windowMs,
  };
}

export class RateLimitedError extends Error {
  readonly status = 429;
  readonly retryAfterSec: number;

  constructor(result: RateLimitResult, message = "Too many requests. Please slow down.") {
    super(message);
    this.name = "RateLimitedError";
    this.retryAfterSec = Math.ceil(result.resetMs / 1000);
  }
}

export async function enforceRateLimit(
  identifier: string,
  rule: RateLimitRule,
  message?: string,
): Promise<void> {
  const result = await rateLimit(identifier, rule);
  if (!result.ok) throw new RateLimitedError(result, message);
}

export function tooManyRequests(result: RateLimitResult): Response {
  const retryAfterSec = Math.ceil(result.resetMs / 1000);
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please slow down.",
      retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    },
  );
}
