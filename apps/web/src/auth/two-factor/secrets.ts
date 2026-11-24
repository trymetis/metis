import { createOTP } from "@better-auth/utils/otp";
import type { AuthContext } from "better-auth";
import { generateRandomString, symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";

import { TOTP_MODEL, type TotpRow, TWO_FACTOR_MODEL, type TwoFactorRow } from "./store";

type SecretKey = AuthContext["secretConfig"];

const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 10;

export function newTotpSecret(): string {
  return generateRandomString(32);
}

export function newBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () => {
    const code = generateRandomString(BACKUP_CODE_LENGTH, "a-z", "0-9", "A-Z");
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  });
}

export function sealSecret(key: SecretKey, secret: string): Promise<string> {
  return symmetricEncrypt({ key, data: secret });
}

export function openSecret(key: SecretKey, sealed: string): Promise<string> {
  return symmetricDecrypt({ key, data: sealed });
}

export function sealBackupCodes(key: SecretKey, codes: string[]): Promise<string> {
  return symmetricEncrypt({ key, data: JSON.stringify(codes) });
}

export async function openBackupCodes(key: SecretKey, sealed: string): Promise<string[] | null> {
  try {
    const parsed: unknown = JSON.parse(await symmetricDecrypt({ key, data: sealed }));
    return Array.isArray(parsed) && parsed.every((code) => typeof code === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function totpUri(secret: string, issuer: string, account: string): string {
  return createOTP(secret, { digits: TOTP_DIGITS, period: TOTP_PERIOD }).url(issuer, account);
}

export function verifyTotpCode(secret: string, code: string): Promise<boolean> {
  return createOTP(secret, { digits: TOTP_DIGITS, period: TOTP_PERIOD }).verify(code);
}

type EnrollContext = Pick<AuthContext, "secretConfig" | "internalAdapter"> & {
  adapter: Pick<AuthContext["adapter"], "create" | "deleteMany">;
};

export async function enrollTwoFactor(
  context: EnrollContext,
  enrollment: { userId: string; secret: string; backupCodes: string[] },
): Promise<void> {
  const where = [{ field: "userId", value: enrollment.userId }];
  await context.adapter.deleteMany({ model: TWO_FACTOR_MODEL, where });
  await context.adapter.deleteMany({ model: TOTP_MODEL, where });
  await context.adapter.create<Omit<TwoFactorRow, "id">>({
    model: TWO_FACTOR_MODEL,
    data: {
      userId: enrollment.userId,
      backupCodes: await sealBackupCodes(context.secretConfig, enrollment.backupCodes),
    },
  });
  await context.adapter.create<Omit<TotpRow, "id">>({
    model: TOTP_MODEL,
    data: {
      userId: enrollment.userId,
      secret: await sealSecret(context.secretConfig, enrollment.secret),
      verified: true,
    },
  });
  await context.internalAdapter.updateUser(enrollment.userId, { twoFactorEnabled: true });
}
