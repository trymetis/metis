"use client";

import { Button } from "@metis/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@metis/ui/components/dialog";
import { Loader2, Mail } from "lucide-react";
import { useState } from "react";

import { validateEmailRows } from "@/components/email-rows";
import {
  EMPTY_INVITE_ROW,
  type InviteRow,
  InviteRows,
  sendInvites,
} from "@/components/invite-rows";

export function InviteMembersDialog({
  workspaceSlug,
  workspaceName,
  onInvited,
}: {
  workspaceSlug: string;
  workspaceName: string;
  onInvited: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<InviteRow[]>([EMPTY_INVITE_ROW]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filledCount = rows.filter((r) => r.email.trim().length > 0).length;

  function reset() {
    setRows([EMPTY_INVITE_ROW]);
    setError(null);
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const { rows: invites, error: validationError } = validateEmailRows(rows);
    if (validationError) return setError(validationError);
    if (invites.length === 0) return setError("Enter at least one email");

    setBusy(true);
    try {
      const failed = await sendInvites(workspaceSlug, invites);
      await onInvited();
      if (failed.length > 0) {
        setRows(failed);
        setError(`These invites failed: ${failed.map((f) => f.email).join(", ")}. Retry or close.`);
        return;
      }
      setOpen(false);
      reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Mail className="size-3.5" />
            Invite
          </Button>
        }
      />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Invite to {workspaceName}</DialogTitle>
          <DialogDescription>
            Invites expire after a while and can be revoked from the pending list.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <InviteRows rows={rows} onChange={setRows} disabled={busy} />
          {error && <p className="text-xs text-destructive-text">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : filledCount > 1 ? (
              "Send invites"
            ) : (
              "Send invite"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
