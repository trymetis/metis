import { defineErrorCodes } from "better-auth";

export const TWO_FACTOR_ERROR_CODES = defineErrorCodes({
  TWO_FACTOR_NOT_ENABLED: "Two factor isn't enabled",
  TOTP_NOT_ENABLED: "TOTP not enabled",
  TOTP_ALREADY_ENABLED: "TOTP is already enabled",
  BACKUP_CODES_NOT_ENABLED: "Backup codes aren't enabled",
  INVALID_BACKUP_CODE: "Invalid backup code",
  INVALID_CODE: "Invalid code",
  SECOND_FACTOR_REQUIRED: "Confirm it's you first",
  INVALID_SECOND_FACTOR: "Invalid authenticator or backup code",
  INVALID_STEP_UP_PROOF: "Your passkey confirmation expired. Confirm with your passkey again.",
  LAST_METHOD:
    "You need at least one way to confirm it's you. Add another one first, or turn off two-factor authentication.",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "Too many attempts. Sign in again to get a new challenge.",
  ACCOUNT_TEMPORARILY_LOCKED:
    "Too many failed verification attempts. Your account is temporarily locked. Please try again later.",
  INVALID_TWO_FACTOR_COOKIE: "Invalid two factor cookie",
  METHOD_NOT_AVAILABLE: "That method isn't set up for this account",
  PASSKEY_NOT_FOUND: "Passkey not found",
  PASSKEY_CHALLENGE_NOT_FOUND: "The passkey request expired. Try again.",
  PASSKEY_REGISTRATION_FAILED: "Couldn't verify the new passkey",
  PASSKEY_AUTHENTICATION_FAILED: "Passkey verification failed",
  PASSKEY_NAME_TOO_LONG: "Passkey names are at most 64 characters",
});
