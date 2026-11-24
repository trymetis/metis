import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";

import { isRecord, keysOf } from "@/lib/guards";

const SIGN_IN_METHODS = {
  "/sign-in/email": "password",
  "/magic-link/verify": "magic-link",
  "/native/exchange": "native-app",
} as const;

const SECOND_FACTOR_PATH = "/two-factor/verify";

const SECOND_FACTORS = {
  totp: "totp",
  backup_code: "backup-code",
  passkey: "passkey",
} as const;

export type SignInMethod =
  | (typeof SIGN_IN_METHODS)[keyof typeof SIGN_IN_METHODS]
  | (typeof SECOND_FACTORS)[keyof typeof SECOND_FACTORS];

export interface CompletedSignIn {
  userId: string;
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
  at: Date;
  method: SignInMethod;
}

function signInMethod(path: string | undefined, body: unknown): SignInMethod | null {
  if (path === SECOND_FACTOR_PATH) {
    const method = isRecord(body) ? body.method : undefined;
    const known = keysOf(SECOND_FACTORS).find((key) => key === method);
    return known ? SECOND_FACTORS[known] : null;
  }
  const known = keysOf(SIGN_IN_METHODS).find((key) => key === path);
  return known ? SIGN_IN_METHODS[known] : null;
}

export const signInNotifier = (onSignIn: (signIn: CompletedSignIn) => Promise<void>) =>
  ({
    id: "metis-sign-in-notifier",
    hooks: {
      after: [
        {
          matcher: (ctx) => signInMethod(ctx.path, ctx.body) !== null,
          handler: createAuthMiddleware(async (ctx) => {
            const method = signInMethod(ctx.path, ctx.body);
            const created = ctx.context.newSession;
            if (!method || !created) return;
            if (ctx.path === SECOND_FACTOR_PATH) {
              const signedIn = await ctx.getSignedCookie(
                ctx.context.authCookies.sessionToken.name,
                ctx.context.secret,
              );
              if (signedIn) return;
            }
            await onSignIn({
              userId: created.user.id,
              email: created.user.email,
              ipAddress: created.session.ipAddress ?? null,
              userAgent: created.session.userAgent ?? null,
              at: created.session.createdAt,
              method,
            });
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
