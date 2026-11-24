"use client";

import { Button } from "@metis/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@metis/ui/components/dialog";
import { Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/auth/client";
import { extractTotpSecret } from "@/auth/two-factor-code";
import { InfoHint } from "@/components/info-hint";
import { ManualKey } from "@/components/manual-key";
import { PasswordConfirmDialog } from "@/components/password-confirm-dialog";
import { TotpConfirmDialog } from "@/components/totp-confirm-dialog";
import { TwoFactorInput } from "@/components/two-factor-input";
import { useTwoFactorCode } from "@/hooks/use-two-factor-code";
import { refreshTwoFactorMethods, useTwoFactorMethods } from "@/hooks/use-two-factor-methods";

async function removeAuthenticator(code: string) {
  const { error } = await authClient.twoFactor.remove({ method: "totp", code });
  if (error) throw new Error(error.message || "Couldn't remove the authenticator app");
  refreshTwoFactorMethods();
  toast.success("Authenticator app removed");
}

export function AuthenticatorSection() {
  const methods = useTwoFactorMethods().data;
  const [starting, setStarting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [totpURI, setTotpURI] = useState<string | null>(null);

  if (!methods) return null;
  const active = methods.methods.includes("totp");
  const onlyMethod = active && methods.methods.length === 1;

  async function start(password: string) {
    const { data, error } = await authClient.twoFactor.enroll({ method: "totp", password });
    if (error || !data?.totpURI) {
      throw new Error(error?.message || "Couldn't start authenticator setup");
    }
    setTotpURI(data.totpURI);
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <Smartphone className="size-4 text-brand-text" />
        <h2 className="text-[13px] font-medium text-foreground">Authenticator app</h2>
        <InfoHint label="Authenticator app">
          {active
            ? "Six-digit codes from your authenticator app confirm sign-ins and sensitive changes."
            : "Add an authenticator app, such as Google Authenticator, 1Password or Authy, as another way to confirm it's you."}
        </InfoHint>
      </div>
      <div className="mt-3 flex flex-col items-start gap-2">
        {active ? (
          <Button variant="outline" disabled={onlyMethod} onClick={() => setRemoving(true)}>
            Remove authenticator
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setStarting(true)}>
            Set up an authenticator
          </Button>
        )}
        {onlyMethod && (
          <p className="text-[12px] text-faint">
            Add a passkey first. You need at least one way to confirm it&rsquo;s you.
          </p>
        )}
      </div>

      <PasswordConfirmDialog
        open={starting}
        title="Set up an authenticator app"
        body="Enter your account password to confirm it's you, then scan the QR code with your authenticator app."
        confirmLabel="Continue"
        onOpenChange={setStarting}
        onConfirm={start}
      />

      <TotpConfirmDialog
        open={removing}
        title="Remove your authenticator app?"
        body="Its codes stop working for this account straight away. Confirm it's you to remove it."
        confirmLabel="Remove authenticator"
        onOpenChange={setRemoving}
        onConfirm={removeAuthenticator}
      />

      <AuthenticatorScanDialog totpURI={totpURI} onClose={() => setTotpURI(null)} />
    </section>
  );
}

function AuthenticatorScanDialog({
  totpURI,
  onClose,
}: {
  totpURI: string | null;
  onClose: () => void;
}) {
  const code = useTwoFactorCode();
  const [qr, setQr] = useState<{ uri: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qrDataUrl = totpURI && qr?.uri === totpURI ? qr.url : null;
  const manualSecret = totpURI ? extractTotpSecret(totpURI) : null;

  useEffect(() => {
    if (!totpURI) return;
    QRCode.toDataURL(totpURI, { width: 200, margin: 1 }).then(
      (url) => setQr({ uri: totpURI, url }),
      () => setQr(null),
    );
  }, [totpURI]);

  function close() {
    code.reset();
    setError(null);
    onClose();
  }

  async function confirm(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await authClient.twoFactor.enroll.confirm({
        method: "totp",
        code: code.value,
      });
      if (err) throw new Error(err.message || "Invalid code");
      refreshTwoFactorMethods();
      toast.success("Authenticator app added");
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={totpURI !== null}
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Scan the QR code</DialogTitle>
          <DialogDescription>
            Scan it with your authenticator app, then enter the 6-digit code it shows.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={confirm} className="flex flex-col items-center gap-3">
          <div className="rounded-lg border border-border bg-white p-3">
            {qrDataUrl ? (
              // oxlint-disable-next-line nextjs/no-img-element --data URL QR code
              <img
                src={qrDataUrl}
                alt="QR code for your authenticator app"
                width={200}
                height={200}
              />
            ) : (
              <div className="size-50 animate-pulse rounded bg-panel" />
            )}
          </div>
          {manualSecret && <ManualKey secret={manualSecret} />}
          <TwoFactorInput
            field={code.field}
            disabled={busy}
            allowBackupCode={false}
            allowPasskey={false}
          />
          {error && <p className="text-center text-[12px] text-destructive-text">{error}</p>}
          <Button type="submit" disabled={busy || !code.complete} className="w-full">
            {busy ? "Verifying…" : "Verify and add"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
