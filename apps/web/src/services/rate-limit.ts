import "server-only";
import { defu } from "defu";

import { config } from "@/config";
import { keysOf } from "@/lib/guards";
import { rateLimitMessage } from "@/lib/rate-limit-message";

import { getCache } from "./cache";
import {
  AUTH_RATE_LIMITS,
  type AuthRateLimits,
  RATE_LIMITS,
  type RateLimitRule,
} from "./rate-limits";

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetMs: number;
}

let appOverrides: Map<string, RateLimitRule> | null = null;

function effectiveRule(rule: RateLimitRule): RateLimitRule {
  if (!appOverrides) {
    const overrides = config.rateLimitOverrides.app ?? {};
    appOverrides = new Map(
      keysOf(overrides).map((name) => {
        const base = RATE_LIMITS[name];
        return [base.scope, defu(overrides[name], base)];
      }),
    );
  }
  return appOverrides.get(rule.scope) ?? rule;
}

export function authRateLimits(): AuthRateLimits {
  const overrides = config.rateLimitOverrides.auth ?? {};
  const paths = { ...AUTH_RATE_LIMITS.paths };
  for (const path of keysOf(overrides.paths ?? {})) {
    const base = paths[path];
    if (base) paths[path] = defu(overrides.paths?.[path], base);
  }
  return {
    default: defu(overrides.default, AUTH_RATE_LIMITS.default),
    twoFactor: defu(overrides.twoFactor, AUTH_RATE_LIMITS.twoFactor),
    paths,
  };
}

export async function rateLimit(
  identifier: string,
  requested: RateLimitRule,
): Promise<RateLimitResult> {
  const rule = effectiveRule(requested);
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
