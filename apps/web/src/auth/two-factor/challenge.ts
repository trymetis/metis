import { createHMAC } from "@better-auth/utils/hmac";
import type { GenericEndpointContext, Session } from "better-auth";
import { APIError, getSessionFromCtx } from "better-auth/api";
import { deleteSessionCookie, expireCookie, setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { parseUserOutput } from "better-auth/db";

import { TWO_FACTOR_ERROR_CODES } from "./errors";
import type { TwoFactorMethod } from "./methods";
import {
  loadFactors,
  methodList,
  TWO_FACTOR_MODEL,
  twoFactorEnabled,
  type TwoFactorRow,
  type TwoFactorUser,
} from "./store";

export const TWO_FACTOR_COOKIE_NAME = "two_factor";
export const TRUST_DEVICE_COOKIE_NAME = "trust_device";
const CHALLENGE_ATTEMPTS = 5;

export interface ResolvedTwoFactorOptions {
  issuer: string;
  verifyPage: string;
  trustDeviceMaxAge: number;
  twoFactorCookieMaxAge: number;
  maxFailedAttempts: number;
  lockoutMs: number;
}

export interface PendingSignIn {
  identifier: string;
  expiresAt: Date;
}

export type Subject =
  | { kind: "session"; user: TwoFactorUser; session: Session }
  | { kind: "sign-in"; user: TwoFactorUser; pending: PendingSignIn };

export function sessionIdOf(subject: Subject): string | null {
  return subject.kind === "session" ? subject.session.id : null;
}

export async function resolveSubject(ctx: GenericEndpointContext): Promise<Subject | null> {
  const session = await getSessionFromCtx(ctx);
  if (session) return { kind: "session", user: session.user, session: session.session };
  const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME);
  const identifier = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
  if (!identifier) return null;
  const record = await ctx.context.internalAdapter.findVerificationValue(identifier);
  if (!record || record.expiresAt < new Date()) return null;
  const user: TwoFactorUser | null = await ctx.context.internalAdapter.findUserById(record.value);
  if (!user) return null;
  return { kind: "sign-in", user, pending: { identifier, expiresAt: record.expiresAt } };
}

async function trustToken(ctx: GenericEndpointContext, userId: string, identifier: string) {
  return createHMAC("SHA-256", "base64urlnopad").sign(
    ctx.context.secret,
    `${userId}!${identifier}`,
  );
}

function trustCookie(ctx: GenericEndpointContext, opts: ResolvedTwoFactorOptions) {
  return ctx.context.createAuthCookie(TRUST_DEVICE_COOKIE_NAME, {
    maxAge: opts.trustDeviceMaxAge,
  });
}

async function setTrustDeviceCookie(
  ctx: GenericEndpointContext,
  userId: string,
  opts: ResolvedTwoFactorOptions,
) {
  const cookie = trustCookie(ctx, opts);
  const identifier = `trust-device-${generateRandomString(32)}`;
  await ctx.context.internalAdapter.createVerificationValue({
    value: userId,
    identifier,
    expiresAt: new Date(Date.now() + opts.trustDeviceMaxAge * 1000),
  });
  await ctx.setSignedCookie(
    cookie.name,
    `${await trustToken(ctx, userId, identifier)}!${identifier}`,
    ctx.context.secret,
    cookie.attributes,
  );
}

export async function forgetTrustedDevice(
  ctx: GenericEndpointContext,
  opts: ResolvedTwoFactorOptions,
) {
  const cookie = trustCookie(ctx, opts);
  const value = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
  if (!value) return;
  const [, identifier] = value.split("!");
  if (identifier) await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier);
  expireCookie(ctx, cookie);
}

async function trustedDevice(
  ctx: GenericEndpointContext,
  userId: string,
  opts: ResolvedTwoFactorOptions,
): Promise<boolean> {
  const cookie = trustCookie(ctx, opts);
  const value = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
  if (!value) return false;
  const [token, identifier] = value.split("!");
  if (token && identifier && token === (await trustToken(ctx, userId, identifier))) {
    const record = await ctx.context.internalAdapter.findVerificationValue(identifier);
    if (record && record.value === userId && record.expiresAt > new Date()) {
      await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier);
      await setTrustDeviceCookie(ctx, userId, opts);
      return true;
    }
  }
  expireCookie(ctx, cookie);
  return false;
}

export async function beginAttempt(ctx: GenericEndpointContext, pending: PendingSignIn) {
  const identifier = `2fa-attempts-${pending.identifier}`;
  const consumed = await ctx.context.internalAdapter
    .consumeVerificationValue(identifier)
    .catch(() => null);
  if (!consumed) {
    throw APIError.from("UNAUTHORIZED", TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE);
  }
  const parsed = Number(consumed.value);
  const attempts = Number.isInteger(parsed) && parsed >= 0 ? parsed : CHALLENGE_ATTEMPTS;
  if (attempts >= CHALLENGE_ATTEMPTS) {
    const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME);
    try {
      await ctx.context.internalAdapter.consumeVerificationValue(pending.identifier);
    } catch {
      expireCookie(ctx, cookie);
      throw APIError.from("INTERNAL_SERVER_ERROR", {
        message: "Failed to invalidate two-factor challenge",
        code: "FAILED_TO_INVALIDATE_TWO_FACTOR_CHALLENGE",
      });
    }
    expireCookie(ctx, cookie);
    throw APIError.from("BAD_REQUEST", TWO_FACTOR_ERROR_CODES.TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE);
  }
  const rearm = (count: number) =>
    ctx.context.internalAdapter
      .createVerificationValue({ value: `${count}`, identifier, expiresAt: pending.expiresAt })
      .catch(() => {});
  return { recordFailure: () => rearm(attempts + 1), restore: () => rearm(attempts) };
}

export async function assertNotLocked(ctx: GenericEndpointContext, state: TwoFactorRow) {
  if (!state.lockedUntil) return;
  if (new Date(state.lockedUntil).getTime() > Date.now()) {
    throw APIError.from("TOO_MANY_REQUESTS", TWO_FACTOR_ERROR_CODES.ACCOUNT_TEMPORARILY_LOCKED);
  }
  await ctx.context.adapter.incrementOne({
    model: TWO_FACTOR_MODEL,
    where: [
      { field: "id", value: state.id },
      { field: "lockedUntil", operator: "lte", value: new Date() },
    ],
    increment: {},
    set: { failedVerificationCount: 0, lockedUntil: null },
  });
}

export async function recordFailure(
  ctx: GenericEndpointContext,
  state: TwoFactorRow,
  opts: ResolvedTwoFactorOptions,
) {
  const updated = await ctx.context.adapter.incrementOne<TwoFactorRow>({
    model: TWO_FACTOR_MODEL,
    where: [{ field: "id", value: state.id }],
    increment: { failedVerificationCount: 1 },
  });
  if ((updated?.failedVerificationCount ?? 0) < opts.maxFailedAttempts) return;
  await ctx.context.adapter.incrementOne({
    model: TWO_FACTOR_MODEL,
    where: [
      { field: "id", value: state.id },
      { field: "failedVerificationCount", operator: "gte", value: opts.maxFailedAttempts },
    ],
    increment: {},
    set: { lockedUntil: new Date(Date.now() + opts.lockoutMs) },
  });
}

export async function resetFailures(ctx: GenericEndpointContext, state: TwoFactorRow) {
  await ctx.context.adapter.update({
    model: TWO_FACTOR_MODEL,
    where: [{ field: "id", value: state.id }],
    update: { failedVerificationCount: 0, lockedUntil: null },
  });
}

export async function finishSignIn(
  ctx: GenericEndpointContext,
  user: TwoFactorUser,
  pending: PendingSignIn,
  opts: ResolvedTwoFactorOptions,
) {
  const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME);
  const consumed = await ctx.context.internalAdapter.consumeVerificationValue(pending.identifier);
  if (!consumed || consumed.value !== user.id) {
    expireCookie(ctx, cookie);
    throw APIError.from("UNAUTHORIZED", TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE);
  }
  const dontRememberMe = await ctx.getSignedCookie(
    ctx.context.authCookies.dontRememberToken.name,
    ctx.context.secret,
  );
  const created = await ctx.context.internalAdapter.createSession(user.id, !!dontRememberMe);
  if (!created) {
    throw APIError.from("INTERNAL_SERVER_ERROR", {
      message: "failed to create session",
      code: "FAILED_TO_CREATE_SESSION",
    });
  }
  await setSessionCookie(ctx, { session: created, user });
  expireCookie(ctx, cookie);
  if (ctx.body?.trustDevice === true) {
    await setTrustDeviceCookie(ctx, user.id, opts);
    expireCookie(ctx, ctx.context.authCookies.dontRememberToken);
  }
  return ctx.json({ token: created.token, user: parseUserOutput(ctx.context.options, user) });
}

export async function challengeSignIn(
  ctx: GenericEndpointContext,
  opts: ResolvedTwoFactorOptions,
): Promise<{ twoFactorRedirect: true; twoFactorMethods: TwoFactorMethod[] } | null> {
  const data = ctx.context.newSession;
  if (!data || !twoFactorEnabled(data.user)) return null;
  if (await trustedDevice(ctx, data.user.id, opts)) return null;

  deleteSessionCookie(ctx, true);
  await ctx.context.internalAdapter.deleteSession(data.session.token);
  ctx.context.setNewSession(null);

  const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME, {
    maxAge: opts.twoFactorCookieMaxAge,
  });
  const identifier = `2fa-${generateRandomString(20)}`;
  const expiresAt = new Date(Date.now() + opts.twoFactorCookieMaxAge * 1000);
  await ctx.context.internalAdapter.createVerificationValue({
    value: data.user.id,
    identifier,
    expiresAt,
  });
  await ctx.context.internalAdapter.createVerificationValue({
    value: "0",
    identifier: `2fa-attempts-${identifier}`,
    expiresAt,
  });
  await ctx.setSignedCookie(cookie.name, identifier, ctx.context.secret, cookie.attributes);
  const factors = await loadFactors(ctx, data.user.id);
  return {
    twoFactorRedirect: true,
    twoFactorMethods: methodList(factors, { withPasskeys: false }).methods,
  };
}
