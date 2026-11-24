import { base64 } from "@better-auth/utils/base64";
import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { GenericEndpointContext } from "better-auth";
import { APIError } from "better-auth/api";
import { expireCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import * as z from "zod";

import { isRecord } from "@/lib/guards";

import { authenticatorName } from "./authenticators";
import { TWO_FACTOR_ERROR_CODES } from "./errors";
import { PASSKEY_MODEL, type PasskeyRow, type TwoFactorUser } from "./store";

const CHALLENGE_COOKIE_NAME = "two_factor_passkey";
const CHALLENGE_MAX_AGE = 5 * 60;
const PASSKEY_NAME_MAX = 64;

export const registrationResponseSchema = z.custom<RegistrationResponseJSON>(isRecord);
export const authenticationResponseSchema = z.custom<AuthenticationResponseJSON>(isRecord);
export const passkeyNameSchema = z
  .string()
  .trim()
  .max(PASSKEY_NAME_MAX, TWO_FACTOR_ERROR_CODES.PASSKEY_NAME_TOO_LONG.message);

const storedChallengeSchema = z.object({
  type: z.enum(["registration", "authentication"]),
  challenge: z.string(),
  userId: z.string(),
  sessionId: z.string().nullable(),
});
type StoredChallenge = z.infer<typeof storedChallengeSchema>;

interface Subject {
  userId: string;
  sessionId: string | null;
}

function relyingParty(ctx: GenericEndpointContext) {
  const base = new URL(ctx.context.baseURL);
  return { rpID: base.hostname, origin: base.origin };
}

function transportsOf(row: PasskeyRow): AuthenticatorTransportFuture[] | undefined {
  if (!row.transports) return undefined;
  return row.transports
    .split(",")
    .filter((transport): transport is AuthenticatorTransportFuture => transport.length > 0);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function storeChallenge(ctx: GenericEndpointContext, value: StoredChallenge) {
  const token = generateRandomString(32);
  const cookie = ctx.context.createAuthCookie(CHALLENGE_COOKIE_NAME);
  await ctx.setSignedCookie(cookie.name, token, ctx.context.secret, {
    ...cookie.attributes,
    maxAge: CHALLENGE_MAX_AGE,
  });
  await ctx.context.internalAdapter.createVerificationValue({
    identifier: `2fa-passkey-${token}`,
    value: JSON.stringify(value),
    expiresAt: new Date(Date.now() + CHALLENGE_MAX_AGE * 1000),
  });
}

async function consumeChallenge(
  ctx: GenericEndpointContext,
  type: StoredChallenge["type"],
  subject: Subject,
): Promise<string> {
  const cookie = ctx.context.createAuthCookie(CHALLENGE_COOKIE_NAME);
  const token = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
  const record = token
    ? await ctx.context.internalAdapter.consumeVerificationValue(`2fa-passkey-${token}`)
    : null;
  expireCookie(ctx, cookie);
  const parsed =
    record && record.expiresAt > new Date()
      ? storedChallengeSchema.safeParse(parseJson(record.value))
      : null;
  if (
    !parsed?.success ||
    parsed.data.type !== type ||
    parsed.data.userId !== subject.userId ||
    parsed.data.sessionId !== subject.sessionId
  ) {
    throw APIError.from("BAD_REQUEST", TWO_FACTOR_ERROR_CODES.PASSKEY_CHALLENGE_NOT_FOUND);
  }
  return parsed.data.challenge;
}

export async function registrationOptions(
  ctx: GenericEndpointContext,
  input: { user: TwoFactorUser; sessionId: string; passkeys: PasskeyRow[]; rpName: string },
) {
  const options = await generateRegistrationOptions({
    rpName: input.rpName,
    rpID: relyingParty(ctx).rpID,
    userID: new TextEncoder().encode(generateRandomString(32, "a-z", "0-9")),
    userName: input.user.email,
    userDisplayName: input.user.name || input.user.email,
    attestationType: "none",
    excludeCredentials: input.passkeys.map((row) => ({
      id: row.credentialID,
      transports: transportsOf(row),
    })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  await storeChallenge(ctx, {
    type: "registration",
    challenge: options.challenge,
    userId: input.user.id,
    sessionId: input.sessionId,
  });
  return options;
}

export async function registerPasskey(
  ctx: GenericEndpointContext,
  input: { userId: string; sessionId: string; response: RegistrationResponseJSON; name?: string },
): Promise<PasskeyRow> {
  const challenge = await consumeChallenge(ctx, "registration", input);
  const rp = relyingParty(ctx);
  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    verification = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: false,
    });
  } catch (error) {
    ctx.context.logger.error("[auth] passkey registration failed", error);
    throw APIError.from("BAD_REQUEST", TWO_FACTOR_ERROR_CODES.PASSKEY_REGISTRATION_FAILED);
  }
  const info = verification.registrationInfo;
  if (!verification.verified || !info) {
    throw APIError.from("BAD_REQUEST", TWO_FACTOR_ERROR_CODES.PASSKEY_REGISTRATION_FAILED);
  }
  return ctx.context.adapter.create<Omit<PasskeyRow, "id">, PasskeyRow>({
    model: PASSKEY_MODEL,
    data: {
      name: input.name || authenticatorName(info.aaguid) || null,
      userId: input.userId,
      credentialID: info.credential.id,
      publicKey: base64.encode(info.credential.publicKey),
      counter: info.credential.counter,
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      transports: input.response.response.transports?.join(",") ?? "",
      createdAt: new Date(),
      aaguid: info.aaguid,
    },
  });
}

export async function authenticationOptions(
  ctx: GenericEndpointContext,
  input: Subject & { passkeys: PasskeyRow[] },
) {
  const options = await generateAuthenticationOptions({
    rpID: relyingParty(ctx).rpID,
    userVerification: "preferred",
    allowCredentials: input.passkeys.map((row) => ({
      id: row.credentialID,
      transports: transportsOf(row),
    })),
  });
  await storeChallenge(ctx, {
    type: "authentication",
    challenge: options.challenge,
    userId: input.userId,
    sessionId: input.sessionId,
  });
  return options;
}

export async function verifyPasskeyAssertion(
  ctx: GenericEndpointContext,
  input: Subject & { passkeys: PasskeyRow[]; response: AuthenticationResponseJSON },
): Promise<boolean> {
  const challenge = await consumeChallenge(ctx, "authentication", input);
  const passkey = input.passkeys.find((row) => row.credentialID === input.response.id);
  if (!passkey) return false;
  const rp = relyingParty(ctx);
  try {
    const verification = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: {
        id: passkey.credentialID,
        publicKey: base64.decode(passkey.publicKey),
        counter: passkey.counter,
        transports: transportsOf(passkey),
      },
      requireUserVerification: false,
    });
    if (!verification.verified) return false;
    await ctx.context.adapter.update({
      model: PASSKEY_MODEL,
      where: [{ field: "id", value: passkey.id }],
      update: { counter: verification.authenticationInfo.newCounter },
    });
    return true;
  } catch (error) {
    ctx.context.logger.error("[auth] passkey verification failed", error);
    return false;
  }
}
