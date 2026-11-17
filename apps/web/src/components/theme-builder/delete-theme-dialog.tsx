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

interface DeleteThemeDialogProps {
  name: string | null;
  description: string;
  onCancel: () => void;
  onConfirm: () => Promise<string | null>;
}

export function DeleteThemeDialog({
  name,
  description,
  onCancel,
  onConfirm,
}: DeleteThemeDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AlertDialog
      open={name !== null}
      onOpenChange={(open) => {
        if (!open && !busy) {
          setError(null);
          onCancel();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-center text-xs text-destructive-text">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const failure = await onConfirm();
              setBusy(false);
              setError(failure);
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
