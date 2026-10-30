import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { betterAuth } from "better-auth/minimal";
import { nextCookies } from "better-auth/next-js";
import { jwt, magicLink, twoFactor } from "better-auth/plugins";

import type { db } from "@/db";
import * as schema from "@/db/schema";
import type { rateLimit } from "@/services/rate-limit";

import { native } from "./native";
import { type CompletedSignIn, signInNotifier } from "./sign-in-notifier";

type Options = NonNullable<Parameters<typeof betterAuth>[0]>;

export interface AuthDeps {
  baseURL: string;
  secret: string;
  signupDisabled: boolean;
  db: typeof db;
  mcpAudience: string;
  rateLimit: typeof rateLimit;
  secondaryStorage: Options["secondaryStorage"];
  sendMagicLink: Parameters<typeof magicLink>[0]["sendMagicLink"];
  sendResetPassword: NonNullable<Options["emailAndPassword"]>["sendResetPassword"];
  sendVerificationEmail: NonNullable<Options["emailVerification"]>["sendVerificationEmail"];
  onSignIn: (signIn: CompletedSignIn) => Promise<void>;
}

export const twoFactorPlugin = twoFactor({
  issuer: "Metis Suite",
});

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
      },
    },
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
      storeSessionInDatabase: true,
    },
    verification: { storeInDatabase: true },
    secondaryStorage: deps.secondaryStorage,
    rateLimit: {
      enabled: true,
      storage: "secondary-storage",
      window: 60,
      max: 60,
      customRules: {
        "/get-session": false,
        "/sign-in/magic-link": { window: 60 * 60, max: 5 },
        "/request-password-reset": { window: 60 * 60, max: 5 },
        "/send-verification-email": { window: 60 * 60, max: 5 },
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60 * 60, max: 5 },
        "/two-factor/verify-totp": { window: 60, max: 10 },
        "/two-factor/verify-backup-code": { window: 60, max: 5 },
        "/native/code": { window: 60, max: 10 },
        "/native/exchange": { window: 60, max: 10 },
        "/native/connect-ticket": { window: 60, max: 20 },
      },
    },
    plugins: [
      magicLink({
        expiresIn: 60 * 15,
        disableSignUp: true,
        sendMagicLink: deps.sendMagicLink,
      }),
      twoFactorPlugin,
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
          const rl = await deps.rateLimit(origin, {
            scope: "cimd-metadata-fetch",
            limit: 20,
            windowSec: 60,
          });
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
