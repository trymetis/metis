"use client";

import { Button } from "@metis/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@metis/ui/components/dialog";
import { Input } from "@metis/ui/components/input";
import { useState } from "react";

export function DriveNameDialog({
  open,
  title,
  description,
  initialValue,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  initialValue: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const seedKey = open ? initialValue : null;
  const [seeded, setSeeded] = useState(seedKey);

  if (seedKey !== seeded) {
    setSeeded(seedKey);
    if (open) {
      setValue(initialValue);
      setBusy(false);
    }
  }

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Input
          className="text-[13px]"
          autoFocus
          aria-label="Name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!value.trim() || busy}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
