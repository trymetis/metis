import "server-only";
import { ORPCError } from "@orpc/server";

import { invalidSecondFactorMessage, verify2FA } from "@/auth/server";
import { rateLimit } from "@/services/rate-limit";

export async function requireTotp(opts: {
  userId: string;
  code: string | undefined;
  headers: Headers;
  scope: string;
  message: string;
  limit?: number;
}): Promise<void> {
  const rl = await rateLimit(opts.userId, {
    scope: opts.scope,
    limit: opts.limit ?? 10,
    windowSec: 300,
  });
  if (!rl.ok) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "Too many attempts. Please slow down.",
      data: { retryAfterSec: Math.ceil(rl.resetMs / 1000) },
    });
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
