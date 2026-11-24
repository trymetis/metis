"use client";

import { useCallback, useMemo, useState } from "react";

import { formatBackupCode, formatTotpCode, isTwoFactorCodeComplete } from "@/auth/two-factor-code";

export type TwoFactorInputMode = "totp" | "backup" | "passkey";

export type TwoFactorFieldHandle = {
  value: string;
  kind: TwoFactorInputMode;
  setValue: (raw: string) => void;
  setKind: (next: TwoFactorInputMode) => void;
};

export type TwoFactorCode = {
  value: string;
  kind: TwoFactorInputMode;
  complete: boolean;
  reset: () => void;
  clearSpentCode: () => void;
  field: TwoFactorFieldHandle;
};

const FORMAT: Record<TwoFactorInputMode, (raw: string) => string> = {
  totp: formatTotpCode,
  backup: formatBackupCode,
  passkey: (raw) => raw.trim(),
};

export function useTwoFactorCode(): TwoFactorCode {
  const [value, setRawValue] = useState("");
  const [kind, setRawKind] = useState<TwoFactorInputMode>("totp");

  const setValue = useCallback((raw: string) => setRawValue(FORMAT[kind](raw)), [kind]);

  const setKind = useCallback((next: TwoFactorInputMode) => {
    setRawKind(next);
    setRawValue("");
  }, []);

  const reset = useCallback(() => {
    setRawKind("totp");
    setRawValue("");
  }, []);

  const clearSpentCode = useCallback(() => {
    if (kind === "backup") setRawValue("");
  }, [kind]);

  return useMemo(
    () => ({
      value,
      kind,
      complete: isTwoFactorCodeComplete(value),
      reset,
      clearSpentCode,
      field: { value, kind, setValue, setKind },
    }),
    [value, kind, setValue, setKind, reset, clearSpentCode],
  );
}
