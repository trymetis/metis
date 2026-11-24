import "server-only";
import { ORPCError } from "@orpc/server";

import { invalidSecondFactorMessage, verify2FA } from "@/auth/server";
import { RateLimitedError, rateLimit } from "@/services/rate-limit";
import type { RateLimitRule } from "@/services/rate-limits";

export async function requireTotp(opts: {
  userId: string;
  code: string | undefined;
  headers: Headers;
  rule: RateLimitRule;
  message: string;
}): Promise<void> {
  const rl = await rateLimit(opts.userId, opts.rule);
  if (!rl.ok) {
    throw new RateLimitedError(rl, "attempts");
  }

  if (!opts.code) {
    throw new ORPCError("BAD_REQUEST", { message: opts.message });
  }

  const verified = await verify2FA({
    code: opts.code,
    headers: opts.headers,
  });
  if (!verified) {
    throw new ORPCError("UNAUTHORIZED", { message: invalidSecondFactorMessage(opts.code) });
  }
}
