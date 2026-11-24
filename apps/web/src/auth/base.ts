import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { betterAuth } from "better-auth/minimal";
import { nextCookies } from "better-auth/next-js";
import { jwt, magicLink } from "better-auth/plugins";

import type { db } from "@/db";
import * as schema from "@/db/schema";
import { CLIENT_IP_HEADER } from "@/lib/client-ip-header";
import type { rateLimit } from "@/services/rate-limit";
import { AUTH_RATE_LIMIT_SCOPE, type AuthRateLimits, RATE_LIMITS } from "@/services/rate-limits";

import { native } from "./native";
import { type CompletedSignIn, signInNotifier } from "./sign-in-notifier";
import { twoFactor, type TwoFactorEvent, type TwoFactorOptions } from "./two-factor";

type Options = NonNullable<Parameters<typeof betterAuth>[0]>;

export interface AuthDeps {
  baseURL: string;
  secret: string;
  signupDisabled: boolean;
  db: typeof db;
  mcpAudience: string;
  rateLimit: typeof rateLimit;
  rateLimits: AuthRateLimits;
  secondaryStorage: Options["secondaryStorage"];
  sendMagicLink: Parameters<typeof magicLink>[0]["sendMagicLink"];
  sendResetPassword: NonNullable<Options["emailAndPassword"]>["sendResetPassword"];
  sendVerificationEmail: NonNullable<Options["emailVerification"]>["sendVerificationEmail"];
  onSignIn: (signIn: CompletedSignIn) => Promise<void>;
  onTwoFactorEvent: (event: TwoFactorEvent) => Promise<void>;
  onTwoFactorRedirect: TwoFactorOptions["onRedirect"];
}

export const TWO_FACTOR_ISSUER = "Metis Suite";

export function authOptions(deps: AuthDeps) {
  return {
    appName: "Metis Suite",
    baseURL: deps.baseURL,
    secret: deps.secret,
    database: drizzleAdapter(deps.db, {
      provider: "sqlite",
      schema,
    }),
    user: {
      additionalFields: {
        defaultWorkspaceSlug: { type: "string", input: false, required: false },
        role: { type: "string", input: false, required: true, defaultValue: "user" },
        banned: { type: "boolean", input: false, required: true, defaultValue: false },
        banReason: { type: "string", input: false, required: false },
        banExpires: { type: "date", input: false, required: false },
      },
    },
    session: {
      cookieCache: { enabled: true, maxAge: 2 * 60 },
      storeSessionInDatabase: true,
    },
    verification: { storeInDatabase: true },
    secondaryStorage: deps.secondaryStorage,
    advanced: { ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] } },
    rateLimit: {
      enabled: true,
      window: deps.rateLimits.default.windowSec,
      max: deps.rateLimits.default.limit,
      customRules: Object.fromEntries(
        Object.entries(deps.rateLimits.paths).map(([path, rule]) => [
          path,
          rule && { window: rule.windowSec, max: rule.limit },
        ]),
      ),
      customStorage: {
        consume: async (key, rule) => {
          const rl = await deps.rateLimit(key, {
            scope: AUTH_RATE_LIMIT_SCOPE,
            limit: rule.max,
            windowSec: rule.window,
          });
          return rl.ok
            ? { allowed: true, retryAfter: null }
            : { allowed: false, retryAfter: Math.max(1, Math.ceil(rl.resetMs / 1000)) };
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: 60 * 15,
        disableSignUp: true,
        sendMagicLink: deps.sendMagicLink,
      }),
      twoFactor({
        issuer: TWO_FACTOR_ISSUER,
        verifyPage: "/2fa/verify",
        redirectPaths: ["/magic-link/verify"],
        onRedirect: deps.onTwoFactorRedirect,
        onEvent: deps.onTwoFactorEvent,
        rateLimit: deps.rateLimits.twoFactor,
      }),
      signInNotifier(deps.onSignIn),
      native(),
      jwt({
        jwt: {
          // FIXME(auth): pass workspaceId and role
          definePayload: async ({ user }) => {
            return {
              sub: user.id,
              email: user.email,
            };
          },
        },
      }),
      mcp({
        loginPage: "/",
        consentPage: "/oauth/consent",
        resource: deps.mcpAudience,
        allowDynamicClientRegistration: false,
        allowUnauthenticatedClientRegistration: false,
        refreshTokenReuseInterval: 0,
        validateRedirectUri: (uri, registered, defaultResult) => {
          if (registered.includes(uri)) return true;
          if (!defaultResult) return false;
          const { hostname } = new URL(uri);
          return hostname === "127.0.0.1" || hostname === "[::1]";
        },
      }),
      cimd({
        fetchClientMetadataResource,
        metadataProfile: "mcp-2026-07-28",
        isMetadataDocumentUrlAllowed: async (clientIdUrl) => {
          let origin: string;
          try {
            origin = new URL(clientIdUrl).origin;
          } catch {
            return false;
          }
          const rl = await deps.rateLimit(origin, RATE_LIMITS.cimdMetadataFetch);
          return rl.ok;
        },
      }),
      nextCookies(),
    ],
    emailAndPassword: {
      enabled: true,
      disableSignUp: deps.signupDisabled,
      requireEmailVerification: true,
      minPasswordLength: 8,
      autoSignIn: false,
      sendResetPassword: deps.sendResetPassword,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60,
      sendVerificationEmail: deps.sendVerificationEmail,
    },
  } satisfies Options;
}
