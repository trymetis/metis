import { createHMAC } from "@better-auth/utils/hmac";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { GenericEndpointContext } from "better-auth";
import { APIError } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import * as z from "zod";

import {
  STEP_UP_PROOF_LENGTH,
  STEP_UP_PROOF_PREFIX,
  twoFactorCodeKind,
} from "@/auth/two-factor-code";

import { TWO_FACTOR_ERROR_CODES } from "./errors";
import type { VerifyMethod } from "./methods";
import { openBackupCodes, openSecret, sealBackupCodes, verifyTotpCode } from "./secrets";
import { type Factors, TWO_FACTOR_MODEL } from "./store";
import { authenticationResponseSchema, verifyPasskeyAssertion } from "./webauthn";

const STEP_UP_PROOF_MAX_AGE = 2 * 60;

export type FactorInput =
  | { method: "totp"; code: string }
  | { method: "backup_code"; code: string }
  | { method: "passkey"; response: AuthenticationResponseJSON };

export const verifyBodySchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("totp"),
    code: z.string(),
    trustDevice: z.boolean().optional(),
  }),
  z.object({
    method: z.literal("backup_code"),
    code: z.string(),
    trustDevice: z.boolean().optional(),
  }),
  z.object({
    method: z.literal("passkey"),
    response: authenticationResponseSchema,
    trustDevice: z.boolean().optional(),
  }),
]);

export const INVALID_FACTOR: Record<VerifyMethod, keyof typeof TWO_FACTOR_ERROR_CODES> = {
  totp: "INVALID_CODE",
  backup_code: "INVALID_BACKUP_CODE",
  passkey: "PASSKEY_AUTHENTICATION_FAILED",
};

interface Subject {
  userId: string;
  sessionId: string | null;
}

async function consumeBackupCode(
  ctx: GenericEndpointContext,
  factors: Factors,
  code: string,
): Promise<boolean> {
  const state = factors.state;
  if (!state) return false;
  const codes = await openBackupCodes(ctx.context.secretConfig, state.backupCodes);
  if (!codes?.includes(code)) return false;
  const remaining = await sealBackupCodes(
    ctx.context.secretConfig,
    codes.filter((candidate) => candidate !== code),
  );
  const swapped = await ctx.context.adapter.incrementOne({
    model: TWO_FACTOR_MODEL,
    where: [
      { field: "id", value: state.id },
      { field: "backupCodes", value: state.backupCodes },
    ],
    increment: {},
    set: { backupCodes: remaining },
  });
  if (!swapped) {
    throw APIError.fromStatus("CONFLICT", {
      message: "Failed to verify backup code. Please try again.",
    });
  }
  return true;
}

export async function checkFactor(
  ctx: GenericEndpointContext,
  subject: Subject,
  factors: Factors,
  input: FactorInput,
): Promise<boolean> {
  switch (input.method) {
    case "totp":
      return factors.totp?.verified
        ? verifyTotpCode(
            await openSecret(ctx.context.secretConfig, factors.totp.secret),
            input.code,
          )
        : false;
    case "backup_code":
      return consumeBackupCode(ctx, factors, input.code);
    case "passkey":
      return verifyPasskeyAssertion(ctx, {
        ...subject,
        passkeys: factors.passkeys,
        response: input.response,
      });
  }
}

async function proofIdentifier(ctx: GenericEndpointContext, proof: string) {
  const digest = await createHMAC("SHA-256", "base64urlnopad").sign(ctx.context.secret, proof);
  return `2fa-step-up-${digest}`;
}

export async function mintStepUpProof(
  ctx: GenericEndpointContext,
  userId: string,
  sessionId: string,
): Promise<string> {
  const proof = `${STEP_UP_PROOF_PREFIX}${generateRandomString(STEP_UP_PROOF_LENGTH, "a-z", "A-Z", "0-9")}`;
  await ctx.context.internalAdapter.createVerificationValue({
    identifier: await proofIdentifier(ctx, proof),
    value: `${userId}!${sessionId}`,
    expiresAt: new Date(Date.now() + STEP_UP_PROOF_MAX_AGE * 1000),
  });
  return proof;
}

async function stepUpProofValid(
  ctx: GenericEndpointContext,
  proof: string,
  subject: Subject,
): Promise<boolean> {
  const record = await ctx.context.internalAdapter.findVerificationValue(
    await proofIdentifier(ctx, proof),
  );
  return (
    !!record &&
    record.expiresAt > new Date() &&
    record.value === `${subject.userId}!${subject.sessionId}`
  );
}

export async function requireSecondFactor(
  ctx: GenericEndpointContext,
  subject: Subject,
  factors: Factors,
  code: string | undefined,
): Promise<void> {
  const value = code?.trim() ?? "";
  const kind = twoFactorCodeKind(value);
  if (!kind) throw APIError.from("BAD_REQUEST", TWO_FACTOR_ERROR_CODES.SECOND_FACTOR_REQUIRED);
  const valid =
    kind === "proof"
      ? await stepUpProofValid(ctx, value, subject)
      : await checkFactor(ctx, subject, factors, {
          method: kind === "backup" ? "backup_code" : "totp",
          code: value,
        });
  if (!valid) {
    throw APIError.from(
      "UNAUTHORIZED",
      kind === "proof"
        ? TWO_FACTOR_ERROR_CODES.INVALID_STEP_UP_PROOF
        : TWO_FACTOR_ERROR_CODES.INVALID_SECOND_FACTOR,
    );
  }
}
