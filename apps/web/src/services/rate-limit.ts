import "server-only";
import { rateLimitMessage } from "@/lib/rate-limit-message";

import { getCache } from "./cache";
import type { RateLimitRule } from "./rate-limits";

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetMs: number;
}

export async function rateLimit(identifier: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const windowMs = rule.windowSec * 1000;
  const key = `rl:${rule.scope}:${identifier}`;
  const cache = getCache();
  const n = await cache.incr(key, rule.windowSec);
  if (n > rule.limit) {
    const left = await cache.ttlMs(key);
    return { ok: false, remaining: 0, resetMs: left ?? windowMs };
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

  constructor(result: RateLimitResult, subject?: string) {
    const retryAfterSec = Math.max(1, Math.ceil(result.resetMs / 1000));
    super(rateLimitMessage(retryAfterSec, subject));
    this.name = "RateLimitedError";
    this.retryAfterSec = retryAfterSec;
  }
}

export async function enforceRateLimit(
  identifier: string,
  rule: RateLimitRule,
  subject?: string,
): Promise<void> {
  const result = await rateLimit(identifier, rule);
  if (!result.ok) throw new RateLimitedError(result, subject);
}

export function tooManyRequests(result: RateLimitResult): Response {
  const { message, retryAfterSec } = new RateLimitedError(result);
  return new Response(JSON.stringify({ error: message, retryAfterSec }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfterSec),
    },
  });
}
