import type { BetterAuthPlugin, GenericEndpointContext } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";

import type { PathRateLimit } from "@/services/rate-limits";

import { challengeSignIn, type ResolvedTwoFactorOptions } from "./challenge";
import { twoFactorEndpoints } from "./endpoints";
import { TWO_FACTOR_ERROR_CODES } from "./errors";
import type { TwoFactorEvent } from "./events";
import { twoFactorSchema } from "./schema";

export interface TwoFactorOptions {
  issuer: string;
  verifyPage: string;
  redirectPaths: string[];
  onRedirect: (ctx: GenericEndpointContext) => void;
  onEvent: (event: TwoFactorEvent) => Promise<void>;
  rateLimit: PathRateLimit;
}

const CREDENTIAL_SIGN_IN_PATHS = ["/sign-in/email", "/sign-in/username"];
const UNTHROTTLED_PATHS = new Set(["/two-factor/methods"]);

export const twoFactor = (options: TwoFactorOptions) => {
  const opts: ResolvedTwoFactorOptions = {
    issuer: options.issuer,
    verifyPage: options.verifyPage,
    trustDeviceMaxAge: 30 * 24 * 60 * 60,
    twoFactorCookieMaxAge: 10 * 60,
    maxFailedAttempts: 10,
    lockoutMs: 15 * 60 * 1000,
  };
  const redirectPaths = new Set(options.redirectPaths);
  const challengedPaths = new Set([...CREDENTIAL_SIGN_IN_PATHS, ...options.redirectPaths]);

  return {
    id: "two-factor",
    endpoints: twoFactorEndpoints(opts, options.onEvent),
    hooks: {
      after: [
        {
          matcher: (context) => challengedPaths.has(context.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const challenge = await challengeSignIn(ctx, opts);
            if (!challenge) return undefined;
            if (!redirectPaths.has(ctx.path)) return ctx.json(challenge);
            options.onRedirect(ctx);
            const base = ctx.context.options.baseURL;
            throw ctx.redirect(
              typeof base === "string"
                ? new URL(opts.verifyPage, base).toString()
                : opts.verifyPage,
            );
          }),
        },
      ],
    },
    schema: twoFactorSchema,
    rateLimit: [
      {
        pathMatcher: (path) => path.startsWith("/two-factor/") && !UNTHROTTLED_PATHS.has(path),
        window: options.rateLimit.windowSec,
        max: options.rateLimit.limit,
      },
    ],
    $ERROR_CODES: TWO_FACTOR_ERROR_CODES,
  } satisfies BetterAuthPlugin;
};

export type TwoFactorPlugin = ReturnType<typeof twoFactor>;

export { enrollTwoFactor, totpUri } from "./secrets";
export type { TwoFactorEvent } from "./events";
