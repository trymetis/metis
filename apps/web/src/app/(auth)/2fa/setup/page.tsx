"use client";

import { Button } from "@metis/ui/components/button";
import { Fingerprint } from "lucide-react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { authClient, useSession } from "@/auth/client";
import { consumeTwoFactorCallback } from "@/auth/two-factor-callback";
import { extractTotpSecret } from "@/auth/two-factor-code";
import {
  finishPasskeyEnrollment,
  PASSKEY_ENROLLMENT_MAX_AGE_MS,
  PasskeyCeremonyError,
  type PasskeyEnrollment,
  startPasskeyEnrollment,
  usePasskeySupport,
} from "@/auth/two-factor/passkey-client";
import { BackupCodesCard } from "@/components/backup-codes-card";
import { ManualKey } from "@/components/manual-key";
import { TwoFactorInput } from "@/components/two-factor-input";
import { useTwoFactorCode } from "@/hooks/use-two-factor-code";
import { route } from "@/lib/route";

type Step = "password" | "scan" | "verify" | "codes" | "done";

export default function TwoFactorSetupPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [totpURI, setTotpURI] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const code = useTwoFactorCode();
  const [submitting, setSubmitting] = useState<"totp" | "passkey" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canUsePasskey = usePasskeySupport();
  const [enrollment, setEnrollment] = useState<PasskeyEnrollment | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending && !session) router.replace("/");
  }, [session, isPending, router]);

  useEffect(() => {
    if (!totpURI) return;
    QRCode.toDataURL(totpURI, { width: 220, margin: 1 }).then(setQrDataUrl, () =>
      setQrDataUrl(null),
    );
  }, [totpURI]);

  function finish() {
    setStep("done");
    setTimeout(() => router.replace(route(consumeTwoFactorCallback())), 1200);
  }

  function passwordReady(): boolean {
    if (password.length >= 8) return true;
    setError("Enter your account password");
    return false;
  }

  async function handleEnable(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!passwordReady()) return;
    setSubmitting("totp");
    try {
      const result = await authClient.twoFactor.enroll({ method: "totp", password });
      if (result?.error) {
        setError(result.error.message ?? "Could not start 2FA setup");
        return;
      }
      if (!result.data?.totpURI) {
        setError("Couldn't start authenticator setup. Try again.");
        return;
      }
      setTotpURI(result.data.totpURI);
      setBackupCodes(result.data.backupCodes ?? []);
      setStep("scan");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start 2FA setup");
    } finally {
      setSubmitting(null);
    }
  }

  async function beginPasskey(): Promise<PasskeyEnrollment> {
    const started = await startPasskeyEnrollment({ password });
    setEnrollment(started);
    setBackupCodes(started.backupCodes ?? []);
    return started;
  }

  async function handlePasskey() {
    setError(null);
    if (!passwordReady()) return;
    setSubmitting("passkey");
    try {
      await beginPasskey();
      setNotice(null);
      setStep("codes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't set up the passkey");
    } finally {
      setSubmitting(null);
    }
  }

  async function createPasskey() {
    setError(null);
    setSubmitting("passkey");
    try {
      if (!enrollment || Date.now() - enrollment.startedAt > PASSKEY_ENROLLMENT_MAX_AGE_MS) {
        await beginPasskey();
        setNotice(
          "Here is a fresh set of backup codes. Save these instead of the earlier ones, then continue.",
        );
        return;
      }
      await finishPasskeyEnrollment(enrollment, "");
      finish();
    } catch (err) {
      if (!(err instanceof PasskeyCeremonyError)) setEnrollment(null);
      setError(err instanceof Error ? err.message : "Couldn't set up the passkey");
    } finally {
      setSubmitting(null);
    }
  }

  async function handleVerify(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!code.complete) return;
    setSubmitting("totp");
    try {
      const result = await authClient.twoFactor.enroll.confirm({
        method: "totp",
        code: code.value,
      });
      if (result?.error) {
        setError(result.error.message ?? "Invalid code");
        return;
      }
      finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setSubmitting(null);
    }
  }

  const manualSecret = totpURI ? extractTotpSecret(totpURI) : null;
  const busy = submitting !== null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white dark:bg-neutral-950 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Set up two-factor authentication
          </h1>
          <p className="mt-1.5 text-sm text-neutral-500">
            Required to protect your Metis Suite account.
          </p>
        </div>

        {step === "password" && (
          <form
            onSubmit={handleEnable}
            className="flex flex-col gap-3 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6"
          >
            <p className="text-xs text-neutral-500">
              Confirm your password, then set up an authenticator app or a passkey.
            </p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              autoComplete="current-password"
              autoFocus
              disabled={busy}
              className={inputCls}
            />
            {error && <p className="text-xs text-destructive-text">{error}</p>}
            <Button type="submit" disabled={busy} className={btnCls}>
              {submitting === "totp" ? "Generating…" : "Continue"}
            </Button>
            {canUsePasskey && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={handlePasskey}
                className="h-auto w-full rounded-xl py-3 text-sm"
              >
                <Fingerprint data-icon="inline-start" />
                {submitting === "passkey"
                  ? "Waiting for your passkey…"
                  : "Set up a passkey instead"}
              </Button>
            )}
          </form>
        )}

        {step === "scan" && (
          <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6">
            <p className="text-xs text-neutral-500">
              Scan this QR code with Google Authenticator, 1Password, Authy or another authenticator
              app.
            </p>
            <div className="flex justify-center rounded-xl bg-white p-3">
              {qrDataUrl ? (
                // oxlint-disable-next-line nextjs/no-img-element --qr code is data URL / external CDN; next/image adds no value here
                <img
                  src={qrDataUrl}
                  alt="QR code for your authenticator app"
                  width={220}
                  height={220}
                />
              ) : (
                <div className="size-55 animate-pulse rounded bg-neutral-100" />
              )}
            </div>
            {manualSecret && <ManualKey secret={manualSecret} />}

            {session && <BackupCodesCard codes={backupCodes} accountEmail={session.user.email} />}

            <Button onClick={() => setStep("verify")} className={btnCls}>
              I've saved my backup codes, continue
            </Button>
          </div>
        )}

        {step === "verify" && (
          <form
            onSubmit={handleVerify}
            className="flex flex-col gap-3 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6"
          >
            <p className="text-xs text-neutral-500">
              Enter the 6-digit code from your authenticator app to finish setup.
            </p>
            <TwoFactorInput
              field={code.field}
              autoFocus
              disabled={busy}
              allowBackupCode={false}
              allowPasskey={false}
            />
            {error && <p className="text-center text-xs text-destructive-text">{error}</p>}
            <Button type="submit" disabled={busy || !code.complete} className={btnCls}>
              {busy ? "Verifying…" : "Verify and enable"}
            </Button>
            <Button
              variant="link"
              onClick={() => setStep("scan")}
              className="h-auto p-0 text-xs text-neutral-500 underline-offset-4 hover:underline"
            >
              Back
            </Button>
          </form>
        )}

        {step === "codes" && (
          <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6">
            <p className="text-xs text-neutral-500">
              Keep these codes somewhere safe before you create the passkey. They get you in if you
              lose access to it.
            </p>
            {notice && <p className="text-xs text-neutral-700 dark:text-neutral-300">{notice}</p>}
            {session && <BackupCodesCard codes={backupCodes} accountEmail={session.user.email} />}
            {error && <p className="text-center text-xs text-destructive-text">{error}</p>}
            <Button onClick={createPasskey} disabled={busy} className={btnCls}>
              {submitting === "passkey"
                ? "Waiting for your passkey…"
                : "I've saved my backup codes, continue"}
            </Button>
          </div>
        )}

        {step === "done" && (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-6 text-center">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Two-factor enabled
            </h2>
            <p className="mt-1.5 text-xs text-neutral-500">Taking you to your inbox…</p>
          </div>
        )}
      </div>
    </main>
  );
}

const inputCls =
  "w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 outline-none focus:border-neutral-900 dark:focus:border-neutral-300 disabled:opacity-50";

const btnCls =
  "mt-1 h-auto w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-900 hover:opacity-90 dark:bg-white dark:text-neutral-900 dark:hover:bg-white";
