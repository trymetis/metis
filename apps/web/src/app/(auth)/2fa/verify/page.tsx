"use client";

import { Button } from "@metis/ui/components/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/auth/client";
import { consumeTwoFactorCallback } from "@/auth/two-factor-callback";
import { signInWithPasskey } from "@/auth/two-factor/passkey-client";
import { TwoFactorInput } from "@/components/two-factor-input";
import { type TwoFactorInputMode, useTwoFactorCode } from "@/hooks/use-two-factor-code";
import { route } from "@/lib/route";

import { Checkbox } from "./_components/checkbox";

const INSTRUCTIONS: Record<TwoFactorInputMode, string> = {
  totp: "Enter the code from your authenticator app.",
  passkey: "Use the passkey you added to this account.",
  backup: "Enter one of your backup codes.",
};

export default function TwoFactorVerifyPage() {
  const router = useRouter();
  const code = useTwoFactorCode();
  const [trustDevice, setTrustDevice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passkey = code.kind === "passkey";

  async function handlePasskey() {
    setError(null);
    await signInWithPasskey(trustDevice);
    router.replace(route(consumeTwoFactorCallback()));
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (passkey || !code.complete) return;

    setSubmitting(true);
    try {
      const result = await authClient.twoFactor.verify({
        method: code.kind === "backup" ? "backup_code" : "totp",
        code: code.value,
        trustDevice,
      });
      if (result?.error) {
        setError(result.error.message ?? "Invalid code");
        return;
      }
      router.replace(route(consumeTwoFactorCallback()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white dark:bg-neutral-950 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Two-factor authentication
          </h1>
          <p className="mt-1.5 text-sm text-neutral-500">{INSTRUCTIONS[code.kind]}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <TwoFactorInput
            field={code.field}
            autoFocus
            disabled={submitting}
            onPasskey={handlePasskey}
          />
          {error && <p className="text-center text-xs text-destructive-text">{error}</p>}
          <label className="flex cursor-pointer items-center gap-2.5 text-xs text-neutral-500">
            <Checkbox
              checked={trustDevice}
              disabled={submitting}
              onCheckedChange={setTrustDevice}
            />
            Trust this device for 30 days
          </label>
          {!passkey && (
            <Button
              type="submit"
              disabled={submitting || !code.complete}
              className="mt-1 h-auto w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-900 hover:opacity-90 dark:bg-white dark:text-neutral-900 dark:hover:bg-white"
            >
              {submitting ? "Verifying…" : "Verify"}
            </Button>
          )}
          <Link
            href="/"
            className="text-center text-xs text-neutral-500 underline-offset-4 hover:underline"
          >
            Cancel and sign out
          </Link>
        </form>
      </div>
    </main>
  );
}
