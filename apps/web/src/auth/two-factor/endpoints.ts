import type { GenericEndpointContext, Session } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  getSessionFromCtx,
  sensitiveSessionMiddleware,
  sessionMiddleware,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import * as z from "zod";

import {
  assertNotLocked,
  beginAttempt,
  finishSignIn,
  forgetTrustedDevice,
  recordFailure,
  resetFailures,
  type ResolvedTwoFactorOptions,
  resolveSubject,
  sessionIdOf,
} from "./challenge";
import { TWO_FACTOR_ERROR_CODES } from "./errors";
import type { TwoFactorEvent } from "./events";
import { TWO_FACTOR_METHODS, type TwoFactorMethod } from "./methods";
import {
  newBackupCodes,
  newTotpSecret,
  openSecret,
  sealBackupCodes,
  sealSecret,
  totpUri,
  verifyTotpCode,
} from "./secrets";
import {
  activeMethods,
  type Factors,
  loadFactors,
  methodList,
  PASSKEY_MODEL,
  publicPasskey,
  setTwoFactorEnabled,
  TOTP_MODEL,
  TWO_FACTOR_MODEL,
  twoFactorEnabled,
  type TwoFactorUser,
} from "./store";
import {
  checkFactor,
  INVALID_FACTOR,
  mintStepUpProof,
  requireSecondFactor,
  verifyBodySchema,
} from "./verify";
import {
  authenticationOptions,
  passkeyNameSchema,
  registerPasskey,
  registrationOptions,
  registrationResponseSchema,
} from "./webauthn";

type Emit = (event: TwoFactorEvent) => Promise<void>;

const passwordBody = z.object({ password: z.string() });

async function replaceSession(ctx: GenericEndpointContext, user: TwoFactorUser, current: Session) {
  const created = await ctx.context.internalAdapter.createSession(user.id, false, current);
  await setSessionCookie(ctx, { session: created, user });
  await ctx.context.internalAdapter.deleteSession(current.token);
}

async function issueBackupCodes(
  ctx: GenericEndpointContext,
  userId: string,
  factors: Factors,
): Promise<string[]> {
  const codes = newBackupCodes();
  const backupCodes = await sealBackupCodes(ctx.context.secretConfig, codes);
  if (factors.state) {
    await ctx.context.adapter.update({
      model: TWO_FACTOR_MODEL,
      where: [{ field: "id", value: factors.state.id }],
      update: { backupCodes },
    });
  } else {
    await ctx.context.adapter.create({ model: TWO_FACTOR_MODEL, data: { userId, backupCodes } });
  }
  return codes;
}

function stillActive(factors: Factors, method: TwoFactorMethod): boolean {
  return activeMethods(factors).includes(method);
}

export function twoFactorEndpoints(opts: ResolvedTwoFactorOptions, emit: Emit) {
  const event = (
    ctx: GenericEndpointContext,
    user: TwoFactorUser,
    action: TwoFactorEvent["action"],
    label: string | null = null,
  ) => emit({ action, user: { id: user.id, email: user.email }, label, headers: ctx.headers });

  const enroll = createAuthEndpoint(
    "/two-factor/enroll",
    {
      method: "POST",
      body: z.object({
        method: z.enum(TWO_FACTOR_METHODS),
        password: z.string().optional(),
        code: z.string().optional(),
      }),
      use: [sessionMiddleware],
    },
    async (ctx) => {
      const { user, session } = ctx.context.session;
      const factors = await loadFactors(ctx, user.id);
      const enabled = twoFactorEnabled(user);
      if (enabled) {
        await requireSecondFactor(
          ctx,
          { userId: user.id, sessionId: session.id },
          factors,
          ctx.body.code,
        );
      } else {
        await ctx.context.password.checkPassword(user.id, ctx);
      }
      const backupCodes = enabled ? null : await issueBackupCodes(ctx, user.id, factors);

      if (ctx.body.method === "totp") {
        if (factors.totp?.verified) {
          throw APIError.from("BAD_REQUEST", TWO_FACTOR_ERROR_CODES.TOTP_ALREADY_ENABLED);
        }
        const secret = newTotpSecret();
        const sealed = await sealSecret(ctx.context.secretConfig, secret);
        if (factors.totp) {
          await ctx.context.adapter.update({
            model: TOTP_MODEL,
            where: [{ field: "id", value: factors.totp.id }],
            update: { secret: sealed, verified: false },
          });
        } else {
          await ctx.context.adapter.create({
            model: TOTP_MODEL,
            data: { userId: user.id, secret: sealed, verified: false },
          });
        }
        return ctx.json({
          method: "totp" as const,
          totpURI: totpUri(secret, opts.issuer, user.email),
          options: null,
          backupCodes,
        });
      }

      const options = await registrationOptions(ctx, {
        user,
        sessionId: session.id,
        passkeys: factors.passkeys,
        rpName: opts.issuer,
      });
      return ctx.json({ method: "passkey" as const, totpURI: null, options, backupCodes });
    },
  );

  const confirmEnrollment = createAuthEndpoint(
    "/two-factor/enroll/confirm",
    {
      method: "POST",
      body: z.discriminatedUnion("method", [
        z.object({ method: z.literal("totp"), code: z.string() }),
        z.object({
          method: z.literal("passkey"),
          response: registrationResponseSchema,
          name: passkeyNameSchema.optional(),
        }),
      ]),
      use: [sessionMiddleware],
    },
    async (ctx) => {
      const { user, session } = ctx.context.session;
      const factors = await loadFactors(ctx, user.id);
      if (!factors.state) {
        throw APIError.from("BAD_REQUEST", TWO_FACTOR_ERROR_CODES.TWO_FACTOR_NOT_ENABLED);
      }
      const body = ctx.body;
      let passkey: ReturnType<typeof publicPasskey> | null = null;

      if (body.method === "totp") {
        const totp = factors.totp;
        if (!totp) throw APIError.from("BAD_REQUEST", TWO_FACTOR_ERROR_CODES.TOTP_NOT_ENABLED);
        if (totp.verified) {
          throw APIError.from("BAD_REQUEST", TWO_FACTOR_ERROR_CODES.TOTP_ALREADY_ENABLED);
        }
        const secret = await openSecret(ctx.context.secretConfig, totp.secret);
        if (!(await verifyTotpCode(secret, body.code))) {
          throw APIError.from("UNAUTHORIZED", TWO_FACTOR_ERROR_CODES.INVALID_CODE);
        }
        await ctx.context.adapter.update({
          model: TOTP_MODEL,
          where: [{ field: "id", value: totp.id }],
          update: { verified: true },
        });
      } else {
        const row = await registerPasskey(ctx, {
          userId: user.id,
          sessionId: session.id,
          response: body.response,
          name: body.name,
        });
        passkey = publicPasskey(row);
      }

      if (!twoFactorEnabled(user)) {
        await ctx.context.adapter.update({
          model: TWO_FACTOR_MODEL,
          where: [{ field: "id", value: factors.state.id }],
          update: { preferredMethod: body.method },
        });
        await replaceSession(ctx, await setTwoFactorEnabled(ctx, user.id, true), session);
      }
      await (passkey
        ? event(ctx, user, "passkey.added", passkey.name)
        : event(ctx, user, "authenticator.added"));
      return ctx.json({ method: body.method, passkey });
    },
  );

  const challenge = createAuthEndpoint(
    "/two-factor/challenge",
    { method: "POST", body: z.object({ method: z.literal("passkey") }) },
    async (ctx) => {
      const subject = await resolveSubject(ctx);
      if (!subject) {
        throw APIError.from("UNAUTHORIZED", TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE);
      }
      if (!twoFactorEnabled(subject.user)) {
        throw APIError.from("BAD_REQUEST", TWO_FACTOR_ERROR_CODES.TWO_FACTOR_NOT_ENABLED);
      }
      const factors = await loadFactors(ctx, subject.user.id);
      if (factors.passkeys.length === 0) {
        throw APIError.from("BAD_REQUEST", TWO_FACTOR_ERROR_CODES.METHOD_NOT_AVAILABLE);
      }
      return ctx.json(
        await authenticationOptions(ctx, {
          userId: subject.user.id,
          sessionId: sessionIdOf(subject),
          passkeys: factors.passkeys,
        }),
      );
    },
  );

  const verifyTwoFactor = createAuthEndpoint(
    "/two-factor/verify",
    { method: "POST", body: verifyBodySchema },
    async (ctx) => {
      const subject = await resolveSubject(ctx);
      if (!subject) {
        throw APIError.from("UNAUTHORIZED", TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE);
      }
      const { user } = subject;
      const factors = await loadFactors(ctx, user.id);
      const state = factors.state;
      if (!twoFactorEnabled(user) || !state) {
        throw APIError.from("BAD_REQUEST", TWO_FACTOR_ERROR_CODES.TWO_FACTOR_NOT_ENABLED);
      }
      const invalid = () =>
        APIError.from("UNAUTHORIZED", TWO_FACTOR_ERROR_CODES[INVALID_FACTOR[ctx.body.method]]);

      if (subject.kind === "session") {
        const valid = await checkFactor(
          ctx,
          { userId: user.id, sessionId: subject.session.id },
          factors,
          ctx.body,
        );
        if (!valid) throw invalid();
        return ctx.json({ proof: await mintStepUpProof(ctx, user.id, subject.session.id) });
      }

      await assertNotLocked(ctx, state);
      const tracker = await beginAttempt(ctx, subject.pending);
      let valid: boolean;
      try {
        valid = await checkFactor(ctx, { userId: user.id, sessionId: null }, factors, ctx.body);
      } catch (error) {
        await tracker.restore();
        throw error;
      }
      if (!valid) {
        await tracker.recordFailure();
        await recordFailure(ctx, state, opts);
        throw invalid();
      }
      await resetFailures(ctx, state);
      return finishSignIn(ctx, user, subject.pending, opts);
    },
  );

  const removeMethod = createAuthEndpoint(
    "/two-factor/remove",
    {
      method: "POST",
      body: z.discriminatedUnion("method", [
        z.object({ method: z.literal("totp"), code: z.string().optional() }),
        z.object({ method: z.literal("passkey"), id: z.string(), code: z.string().optional() }),
      ]),
      use: [sessionMiddleware],
    },
    async (ctx) => {
      const { user, session } = ctx.context.session;
      const factors = await loadFactors(ctx, user.id);
      await requireSecondFactor(
        ctx,
        { userId: user.id, sessionId: session.id },
        factors,
        ctx.body.code,
      );
      const body = ctx.body;
      let remaining: Factors;
      let label: string | null = null;
      if (body.method === "totp") {
        if (!factors.totp?.verified) {
          throw APIError.from("BAD_REQUEST", TWO_FACTOR_ERROR_CODES.TOTP_NOT_ENABLED);
        }
        remaining = { ...factors, totp: null };
      } else {
        const row = factors.passkeys.find((passkey) => passkey.id === body.id);
        if (!row) throw APIError.from("NOT_FOUND", TWO_FACTOR_ERROR_CODES.PASSKEY_NOT_FOUND);
        label = publicPasskey(row).name;
        remaining = { ...factors, passkeys: factors.passkeys.filter((p) => p.id !== row.id) };
      }
      if (activeMethods(remaining).length === 0) {
        throw APIError.from("BAD_REQUEST", TWO_FACTOR_ERROR_CODES.LAST_METHOD);
      }
      await (body.method === "totp"
        ? ctx.context.adapter.deleteMany({
            model: TOTP_MODEL,
            where: [{ field: "userId", value: user.id }],
          })
        : ctx.context.adapter.delete({
            model: PASSKEY_MODEL,
            where: [{ field: "id", value: body.id }],
          }));
      if (factors.state?.preferredMethod === body.method && !stillActive(remaining, body.method)) {
        await ctx.context.adapter.update({
          model: TWO_FACTOR_MODEL,
          where: [{ field: "id", value: factors.state.id }],
          update: { preferredMethod: null },
        });
      }
      await event(
        ctx,
        user,
        body.method === "totp" ? "authenticator.removed" : "passkey.removed",
        label,
      );
      return ctx.json(methodList(await loadFactors(ctx, user.id), { withPasskeys: true }));
    },
  );

  const renameMethod = createAuthEndpoint(
    "/two-factor/rename",
    {
      method: "POST",
      body: z.object({
        method: z.literal("passkey"),
        id: z.string(),
        name: passkeyNameSchema.min(1),
      }),
      use: [sessionMiddleware],
    },
    async (ctx) => {
      const userId = ctx.context.session.user.id;
      const factors = await loadFactors(ctx, userId);
      const row = factors.passkeys.find((passkey) => passkey.id === ctx.body.id);
      if (!row) throw APIError.from("NOT_FOUND", TWO_FACTOR_ERROR_CODES.PASSKEY_NOT_FOUND);
      await ctx.context.adapter.update({
        model: PASSKEY_MODEL,
        where: [{ field: "id", value: row.id }],
        update: { name: ctx.body.name },
      });
      return ctx.json(publicPasskey({ ...row, name: ctx.body.name }));
    },
  );

  const setPreferences = createAuthEndpoint(
    "/two-factor/preferences",
    {
      method: "POST",
      body: z.object({ preferred: z.enum(TWO_FACTOR_METHODS) }),
      use: [sessionMiddleware],
    },
    async (ctx) => {
      const userId = ctx.context.session.user.id;
      const factors = await loadFactors(ctx, userId);
      if (!factors.state || !stillActive(factors, ctx.body.preferred)) {
        throw APIError.from("BAD_REQUEST", TWO_FACTOR_ERROR_CODES.METHOD_NOT_AVAILABLE);
      }
      await ctx.context.adapter.update({
        model: TWO_FACTOR_MODEL,
        where: [{ field: "id", value: factors.state.id }],
        update: { preferredMethod: ctx.body.preferred },
      });
      return ctx.json(methodList(await loadFactors(ctx, userId), { withPasskeys: true }));
    },
  );

  const listMethods = createAuthEndpoint("/two-factor/methods", { method: "GET" }, async (ctx) => {
    const subject = await resolveSubject(ctx);
    if (!subject) {
      throw APIError.from("UNAUTHORIZED", TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE);
    }
    const factors = await loadFactors(ctx, subject.user.id);
    return ctx.json(methodList(factors, { withPasskeys: subject.kind === "session" }));
  });

  const regenerateBackupCodes = createAuthEndpoint(
    "/two-factor/backup-codes",
    { method: "POST", body: passwordBody, use: [sessionMiddleware] },
    async (ctx) => {
      const user = ctx.context.session.user;
      if (!twoFactorEnabled(user)) {
        throw APIError.from("BAD_REQUEST", TWO_FACTOR_ERROR_CODES.TWO_FACTOR_NOT_ENABLED);
      }
      await ctx.context.password.checkPassword(user.id, ctx);
      const factors = await loadFactors(ctx, user.id);
      if (!factors.state) {
        throw APIError.from("BAD_REQUEST", TWO_FACTOR_ERROR_CODES.TWO_FACTOR_NOT_ENABLED);
      }
      return ctx.json({ backupCodes: await issueBackupCodes(ctx, user.id, factors) });
    },
  );

  const revealTotp = createAuthEndpoint(
    "/two-factor/totp-uri",
    { method: "POST", body: z.object({ code: z.string() }), use: [sessionMiddleware] },
    async (ctx) => {
      const { user, session } = ctx.context.session;
      const factors = await loadFactors(ctx, user.id);
      if (!factors.totp?.verified) {
        throw APIError.from("BAD_REQUEST", TWO_FACTOR_ERROR_CODES.TOTP_NOT_ENABLED);
      }
      await requireSecondFactor(
        ctx,
        { userId: user.id, sessionId: session.id },
        factors,
        ctx.body.code,
      );
      const secret = await openSecret(ctx.context.secretConfig, factors.totp.secret);
      return ctx.json({ totpURI: totpUri(secret, opts.issuer, user.email) });
    },
  );

  const disable = createAuthEndpoint(
    "/two-factor/disable",
    {
      method: "POST",
      body: passwordBody.extend({ code: z.string().optional() }),
      use: [sensitiveSessionMiddleware],
    },
    async (ctx) => {
      const { user, session } = ctx.context.session;
      await ctx.context.password.checkPassword(user.id, ctx);
      await requireSecondFactor(
        ctx,
        { userId: user.id, sessionId: session.id },
        await loadFactors(ctx, user.id),
        ctx.body.code,
      );
      const where = [{ field: "userId", value: user.id }];
      await ctx.context.adapter.deleteMany({ model: PASSKEY_MODEL, where });
      await ctx.context.adapter.deleteMany({ model: TOTP_MODEL, where });
      await ctx.context.adapter.deleteMany({ model: TWO_FACTOR_MODEL, where });
      await replaceSession(ctx, await setTwoFactorEnabled(ctx, user.id, false), session);
      await forgetTrustedDevice(ctx, opts);
      await event(ctx, user, "two_factor.disabled");
      return ctx.json({ status: true });
    },
  );

  const verifyStepUp = createAuthEndpoint.serverOnly(
    { method: "POST", body: z.object({ code: z.string() }) },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx);
      if (!session) throw new APIError("UNAUTHORIZED");
      const factors = await loadFactors(ctx, session.user.id);
      await requireSecondFactor(
        ctx,
        { userId: session.user.id, sessionId: session.session.id },
        factors,
        ctx.body.code,
      );
      return ctx.json({ status: true });
    },
  );

  return {
    enrollTwoFactor: enroll,
    confirmTwoFactorEnrollment: confirmEnrollment,
    twoFactorChallenge: challenge,
    verifyTwoFactor,
    removeTwoFactorMethod: removeMethod,
    renameTwoFactorMethod: renameMethod,
    setTwoFactorPreferences: setPreferences,
    listTwoFactorMethods: listMethods,
    regenerateBackupCodes,
    revealTotpUri: revealTotp,
    disableTwoFactor: disable,
    verifyStepUp,
  };
}
