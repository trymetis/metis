"use client";

import { Button } from "@metis/ui/components/button";
import { Input } from "@metis/ui/components/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@metis/ui/components/input-otp";
import { cn } from "@metis/ui/lib/utils";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Check, Fingerprint } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { BACKUP_CODE_LENGTH, TOTP_CODE_LENGTH } from "@/auth/two-factor-code";
import { confirmWithPasskey, usePasskeySupport } from "@/auth/two-factor/passkey-client";
import type { TwoFactorFieldHandle, TwoFactorInputMode } from "@/hooks/use-two-factor-code";
import { useTwoFactorMethods } from "@/hooks/use-two-factor-methods";

const SLOT = "size-11 text-base";

const MODE_ORDER: TwoFactorInputMode[] = ["passkey", "totp", "backup"];

const SWITCH_LABELS: Record<TwoFactorInputMode, string> = {
  totp: "Use your authenticator instead",
  passkey: "Use a passkey instead",
  backup: "Use a backup code instead",
};

export function TwoFactorInput({
  field,
  disabled,
  autoFocus,
  allowBackupCode = true,
  allowPasskey = true,
  onPasskey,
  align = "center",
  className,
}: {
  field: TwoFactorFieldHandle;
  disabled?: boolean;
  autoFocus?: boolean;
  allowBackupCode?: boolean;
  allowPasskey?: boolean;
  onPasskey?: () => Promise<void>;
  align?: "center" | "start";
  className?: string;
}) {
  const list = useTwoFactorMethods({ enabled: allowPasskey }).data;
  const supported = usePasskeySupport();
  const touched = useRef(false);
  const { kind, value, setKind } = field;

  const available = MODE_ORDER.filter((mode) => {
    if (mode === "passkey") {
      return allowPasskey && supported && (list?.methods.includes("passkey") ?? false);
    }
    if (mode === "totp") return !list || list.methods.includes("totp");
    return allowBackupCode;
  });
  const preferred: TwoFactorInputMode | null =
    list?.preferred && available.includes(list.preferred) ? list.preferred : null;
  const current: TwoFactorInputMode = available.includes(kind) ? kind : (available[0] ?? "totp");

  useEffect(() => {
    if (!touched.current && preferred && value === "" && kind !== preferred) {
      touched.current = true;
      setKind(preferred);
    } else if (kind !== current) {
      setKind(current);
    }
  }, [preferred, current, kind, value, setKind]);

  const centered = align === "center";
  const others = available.filter((mode) => mode !== current);

  function choose(next: TwoFactorInputMode) {
    touched.current = true;
    setKind(next);
  }

  return (
    <div
      className={cn("flex flex-col gap-2.5", centered ? "items-center" : "items-start", className)}
    >
      {current === "passkey" ? (
        <PasskeyConfirm
          field={field}
          disabled={disabled}
          autoFocus={autoFocus}
          onPasskey={onPasskey}
        />
      ) : current === "backup" ? (
        <Input
          value={field.value}
          onChange={(e) => field.setValue(e.target.value)}
          disabled={disabled}
          autoFocus={autoFocus}
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
          maxLength={BACKUP_CODE_LENGTH + 1}
          placeholder="abcde-12345"
          aria-label="Backup code"
          className="h-11 text-center font-mono text-base tracking-[0.2em]"
        />
      ) : (
        <InputOTP
          value={field.value}
          onChange={field.setValue}
          maxLength={TOTP_CODE_LENGTH}
          pattern={REGEXP_ONLY_DIGITS}
          aria-label="Authentication code"
          disabled={disabled}
          autoFocus={autoFocus}
          containerClassName={centered ? "justify-center" : "justify-start"}
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} className={SLOT} />
            <InputOTPSlot index={1} className={SLOT} />
            <InputOTPSlot index={2} className={SLOT} />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={3} className={SLOT} />
            <InputOTPSlot index={4} className={SLOT} />
            <InputOTPSlot index={5} className={SLOT} />
          </InputOTPGroup>
        </InputOTP>
      )}

      {others.length > 0 ? (
        <div
          className={cn(
            "flex flex-wrap gap-x-4 gap-y-1",
            centered ? "justify-center" : "justify-start",
          )}
        >
          {others.map((option) => (
            <Button
              key={option}
              type="button"
              variant="link"
              disabled={disabled}
              onClick={() => choose(option)}
              className="h-auto p-0 text-xs text-faint underline-offset-4 hover:text-muted-foreground"
            >
              {SWITCH_LABELS[option]}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PasskeyConfirm({
  field,
  disabled,
  autoFocus,
  onPasskey,
}: {
  field: TwoFactorFieldHandle;
  disabled?: boolean;
  autoFocus?: boolean;
  onPasskey?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      if (onPasskey) await onPasskey();
      else field.setValue(await confirmWithPasskey());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passkey verification failed");
    } finally {
      setBusy(false);
    }
  }

  if (field.value && !onPasskey) {
    return (
      <div className="flex flex-col items-center gap-1">
        <p className="flex h-11 items-center gap-1.5 text-sm text-foreground">
          <Check className="size-4 text-brand-text" />
          Passkey confirmed
        </p>
        <Button
          type="button"
          variant="link"
          disabled={disabled}
          onClick={() => field.setValue("")}
          className="h-auto p-0 text-xs text-faint underline-offset-4 hover:text-muted-foreground"
        >
          Confirm again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        disabled={disabled || busy}
        autoFocus={autoFocus}
        onClick={confirm}
        className="h-11"
      >
        <Fingerprint data-icon="inline-start" />
        {busy ? "Waiting for your passkey…" : "Use your passkey"}
      </Button>
      {error && <p className="text-center text-xs text-destructive-text">{error}</p>}
    </div>
  );
}
