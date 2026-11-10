import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { eq } from "drizzle-orm";

import { recordAuditEvent } from "@/audit";
import { config, type InstanceConfig } from "@/config";
import { sectionCached } from "@/config/runtime";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { isRecord } from "@/lib/guards";
import { MCP_AUDIENCE } from "@/mcp/auth";
import { toSecondaryStorage } from "@/services/cache";
import {
  sendMagicLinkEmail,
  sendResetPasswordEmail,
  sendVerificationEmail,
} from "@/services/mailer";
import { rateLimit } from "@/services/rate-limit";
import { createWorkspace, personalWorkspaceName, setDefaultWorkspaceSlug } from "@/workspace";

import { BANNED_MESSAGE, userBanned } from "./ban";
import { authOptions, twoFactorPlugin } from "./base";
import { recordSignIn } from "./last-sign-in";
import { attachLegalConsent, enforceLegalConsent } from "./legal-consent";
import { isOwnerEmail } from "./owner";
import { sendSignInAlert } from "./sign-in-alert";
import {
  TWO_FACTOR_CALLBACK_COOKIE,
  TWO_FACTOR_CALLBACK_MAX_AGE,
  toCallbackPath,
} from "./two-factor-callback";
import { isTwoFactorCodeComplete, twoFactorCodeKind } from "./two-factor-code";

const TWO_FACTOR_GATED_PATHS = new Set(["/magic-link/verify"]);

async function userExists(email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email.toLowerCase()))
    .limit(1);
  return Boolean(row);
}

export async function verify2FA(opts: { code: string; headers: Headers }): Promise<boolean> {
  const code = opts.code.trim();
  const kind = twoFactorCodeKind(code);
  if (!kind) return false;
  try {
    if (kind === "totp") {
      await getAuth().api.verifyTOTP({
        body: { code },
        headers: opts.headers,
      });
    } else {
      await getAuth().api.verifyBackupCode({
        body: { code, disableSession: true },
        headers: opts.headers,
      });
    }
    return true;
  } catch {
    return false;
  }
}

async function requireTotpCode(headers: Headers | undefined, message: string) {
  const code = headers?.get("x-totp-code")?.trim() ?? "";
  if (!isTwoFactorCodeComplete(code)) {
    throw APIError.from("BAD_REQUEST", {
      code: "TOTP_CODE_REQUIRED",
      message,
    });
  }
  const verified = await verify2FA({
    code,
    headers: headers ?? new Headers(),
  });
  if (!verified) {
    throw APIError.from("UNAUTHORIZED", {
      code: "INVALID_TWO_FACTOR_CODE",
      message: "Invalid authenticator or backup code",
    });
  }
}

function buildAuth(cfg: InstanceConfig) {
  return betterAuth({
    ...authOptions({
      baseURL: config.auth.url,
      secret: config.auth.secret,
      signupDisabled: cfg.signup.signupDisabled,
      db,
      mcpAudience: MCP_AUDIENCE,
      rateLimit,
      secondaryStorage: toSecondaryStorage(),
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail({ to: email, url });
      },
      sendResetPassword: async ({ user, url }) => {
        await sendResetPasswordEmail({ to: user.email, url });
      },
      sendVerificationEmail: async ({ user, url }) => {
        await sendVerificationEmail({ to: user.email, url });
      },
      onSignIn: async (signIn) => {
        await recordSignIn(signIn);
        await sendSignInAlert(signIn);
      },
    }),
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            if (await userBanned(session.userId)) {
              throw APIError.from("FORBIDDEN", { code: "ACCOUNT_BANNED", message: BANNED_MESSAGE });
            }
          },
        },
      },
      user: {
        create: {
          after: async (user, context) => {
            try {
              await attachLegalConsent(user.id, user.email, context?.headers);
            } catch (err) {
              console.error("[auth] failed to record legal consent", err);
            }
            try {
              const name = await personalWorkspaceName(user.name ?? user.email);
              const created = await createWorkspace({
                name,
                ownerUserId: user.id,
              });
              await setDefaultWorkspaceSlug(user.id, created.slug);
            } catch (err) {
              console.error("[auth] failed to auto-create workspace", err);
            }
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-up/email") {
          const email = isRecord(ctx.body) ? ctx.body.email : undefined;
          if (typeof email === "string" && isOwnerEmail(email)) {
            throw APIError.from("FORBIDDEN", {
              code: "OWNER_ADDRESS_SETUP_ONLY",
              message: "This address is the instance owner's. Create it at /setup.",
            });
          }
          enforceLegalConsent(ctx.headers);
          return;
        }

        if (ctx.path === "/sign-in/magic-link") {
          const email = isRecord(ctx.body) ? ctx.body.email : undefined;
          if (typeof email !== "string" || !email) return;
          const known = await userExists(email);
          if (known) return;
          return { status: true };
        }

        if (ctx.path === "/change-password") {
          await requireTotpCode(
            ctx.headers,
            "Enter your authenticator code to change your password",
          );
          return;
        }

        if (ctx.path === "/revoke-sessions" || ctx.path === "/revoke-other-sessions") {
          await requireTotpCode(
            ctx.headers,
            "Enter your authenticator code to sign out those sessions",
          );
          return;
        }

        if (ctx.path === "/oauth2/consent") {
          const accept = isRecord(ctx.body) ? ctx.body.accept : undefined;
          if (accept === true) {
            await requireTotpCode(
              ctx.headers,
              "Enter your authenticator code to approve this client",
            );
          }
          return;
        }

        return undefined;
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/two-factor/disable") {
          const disabledFor = ctx.context.newSession?.user;
          if (disabledFor && !(ctx.context.returned instanceof APIError)) {
            await recordAuditEvent(
              {
                userId: disabledFor.id,
                email: disabledFor.email,
                via: "app",
                headers: ctx.headers,
              },
              { action: "two_factor.disabled" },
            );
          }
          return;
        }

        if (!TWO_FACTOR_GATED_PATHS.has(ctx.path)) return;

        const newSession = ctx.context.newSession;
        if (!newSession) return;

        if (!("twoFactorEnabled" in newSession.user)) return;
        if (newSession.user.twoFactorEnabled !== true) return;

        const challenge = twoFactorPlugin.hooks?.after?.[0]?.handler;
        if (!challenge) {
          console.error("[auth] two-factor challenge handler unavailable");
          return;
        }

        const result = (await challenge(ctx)) as
          | {
              twoFactorRedirect?: boolean;
              response?: { twoFactorRedirect?: boolean };
            }
          | undefined;

        const challenged =
          result?.twoFactorRedirect === true || result?.response?.twoFactorRedirect === true;
        if (!challenged) return;

        const { callbackURL } = (ctx.query ?? {}) as { callbackURL?: string };
        const target = toCallbackPath(callbackURL, config.auth.url);
        if (target) {
          ctx.setCookie(TWO_FACTOR_CALLBACK_COOKIE, target, {
            path: "/",
            maxAge: TWO_FACTOR_CALLBACK_MAX_AGE,
            sameSite: "Lax",
            secure: config.auth.secureCookies,
          });
        }

        throw ctx.redirect(new URL("/2fa/verify", config.auth.url).toString());
      }),
    },
  });
}

export type Auth = ReturnType<typeof buildAuth>;

export const getAuth: () => Auth = sectionCached(["signup", "cache"], buildAuth);
