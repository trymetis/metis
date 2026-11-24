export const TOTP_CODE_LENGTH = 6;
export const BACKUP_CODE_LENGTH = 10;
const BACKUP_CODE_GROUP = 5;

export const STEP_UP_PROOF_PREFIX = "proof-";
export const STEP_UP_PROOF_LENGTH = 40;
const STEP_UP_PROOF = new RegExp(`^${STEP_UP_PROOF_PREFIX}[A-Za-z0-9]{${STEP_UP_PROOF_LENGTH}}$`);

export type TwoFactorCodeKind = "totp" | "backup" | "proof";

export function formatTotpCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, TOTP_CODE_LENGTH);
}

export function formatBackupCode(raw: string): string {
  const chars = raw.replace(/[^a-zA-Z0-9]/g, "").slice(0, BACKUP_CODE_LENGTH);
  if (chars.length <= BACKUP_CODE_GROUP) return chars;
  return `${chars.slice(0, BACKUP_CODE_GROUP)}-${chars.slice(BACKUP_CODE_GROUP)}`;
}

export function twoFactorCodeKind(raw: string): TwoFactorCodeKind | null {
  if (STEP_UP_PROOF.test(raw.trim())) return "proof";
  const chars = raw.trim().replace(/[^a-zA-Z0-9]/g, "");
  if (chars.length === BACKUP_CODE_LENGTH) return "backup";
  if (chars.length === TOTP_CODE_LENGTH && /^\d+$/.test(chars)) return "totp";
  return null;
}

export function isTwoFactorCodeComplete(raw: string): boolean {
  return twoFactorCodeKind(raw) !== null;
}

export function extractTotpSecret(uri: string): string | null {
  const secret = uri.match(/[?&]secret=([^&]+)/)?.[1];
  return secret ? decodeURIComponent(secret) : null;
}
