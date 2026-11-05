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
import { useState } from "react";

import { useTwoFactorCode } from "@/hooks/use-two-factor-code";

import { TwoFactorInput } from "./two-factor-input";

export function TotpConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  confirmDisabled = false,
  children,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  children?: React.ReactNode;
  onOpenChange: (open: boolean) => void;
  onConfirm: (code: string) => Promise<void>;
}) {
  const code = useTwoFactorCode();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(code.value);
      code.reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          code.reset();
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <AlertDialogContent size={children ? "lg" : "default"}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>

        {children}
        <TwoFactorInput autoFocus field={code.field} />
        {error && <p className="text-center text-[12px] text-destructive-text">{error}</p>}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={busy || !code.complete || confirmDisabled} onClick={submit}>
            {busy ? "Saving…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
