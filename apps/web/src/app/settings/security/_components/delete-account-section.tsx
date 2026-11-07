"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@metis/ui/components/alert-dialog";
import { Button } from "@metis/ui/components/button";
import { Input } from "@metis/ui/components/input";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { authClient, useSession } from "@/auth/client";
import { useConnectServers } from "@/components/connect-servers-context";
import { providerNames, serverProviders, serversForResource } from "@/components/provider-meta";
import { TwoFactorInput } from "@/components/two-factor-input";
import { clearPreviewCache } from "@/drive/preview-cache";
import { useTwoFactorCode } from "@/hooks/use-two-factor-code";
import { orpc } from "@/lib/orpc";

const MICROSOFT_REVOKE_PERSONAL = "https://account.microsoft.com/privacy/app-access";
const MICROSOFT_REVOKE_WORK = "https://myapps.microsoft.com";

export function DeleteAccountSection() {
  const { data: session } = useSession();
  const configuredProviders = serverProviders(serversForResource(useConnectServers(), "mailbox"));
  const providers = providerNames(configuredProviders, "mail");
  const email = session?.user?.email ?? "";
  const [typed, setTyped] = useState("");
  const code = useTwoFactorCode();
  const [step, setStep] = useState<"idle" | "confirm" | "code">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailMatches = email.length > 0 && typed.trim().toLowerCase() === email.toLowerCase();

  async function finalize() {
    setBusy(true);
    setError(null);
    try {
      await orpc.user.prepareDeleteAccount({ email: typed.trim() });
      code.reset();
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not continue");
      setStep("idle");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    try {
      await orpc.user.deleteAccount({ email: typed.trim(), code: code.value });
      await clearPreviewCache();
      await authClient.signOut().catch(() => {});
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
      setBusy(false);
      setStep("idle");
    }
  }

  return (
    <section className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
      <div className="flex items-center gap-2">
        <Trash2 className="size-4 text-destructive-text" />
        <h2 className="text-[13px] font-medium text-foreground">Delete account</h2>
      </div>
      <p className="mt-1 text-[12px] text-destructive-muted">
        Permanently deletes your account and everything we store — workspaces only you belong to,
        mailboxes, calendars, drives and address books you connected, labels, workflows, and
        scheduled sends — except the security activity record, kept until your server&rsquo;s
        retention period ends. Mail stays in {providers}. If you connected Outlook, also remove the
        app from your{" "}
        <a
          href={MICROSOFT_REVOKE_PERSONAL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          personal
        </a>{" "}
        or{" "}
        <a
          href={MICROSOFT_REVOKE_WORK}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          work or school
        </a>{" "}
        Microsoft account. If you own a workspace with other people, transfer ownership in{" "}
        <Link
          href="/settings/workspaces"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Settings → Workspaces
        </Link>
        , then come back.
      </p>
      <div className="mt-3 flex flex-col items-start gap-2 sm:flex-row">
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={email ? `Type “${email}” to confirm` : "Your email"}
          disabled={busy || !email}
          className="sm:max-w-72 text-[13px]"
          autoComplete="off"
        />
        <Button
          variant="destructive"
          disabled={busy || !emailMatches}
          onClick={() => {
            setError(null);
            setStep("confirm");
          }}
        >
          Delete account
        </Button>
      </div>
      {error && <p className="mt-2 text-[12px] text-destructive-text">{error}</p>}

      <AlertDialog
        open={step === "confirm"}
        onOpenChange={(open) => {
          if (!open && !busy) setStep("idle");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Workspaces only you belong to and the mailboxes, calendars,
              drives and address books you connected will be removed from here. Mail stays with{" "}
              {providers}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={finalize} disabled={busy}>
              {busy ? "Checking…" : "Continue"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={step === "code"}
        onOpenChange={(open) => {
          if (!open && !busy) setStep("idle");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enter your authenticator code</AlertDialogTitle>
            <AlertDialogDescription>
              Last step. Enter the code from your authenticator app, or a backup code, to delete the
              account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <TwoFactorInput autoFocus field={code.field} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteAccount} disabled={busy || !code.complete}>
              {busy ? "Deleting…" : "Delete account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
