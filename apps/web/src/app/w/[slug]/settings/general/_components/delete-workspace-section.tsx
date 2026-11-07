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
import { useState } from "react";

import { TwoFactorInput } from "@/components/two-factor-input";
import { useTwoFactorCode } from "@/hooks/use-two-factor-code";
import { orpc } from "@/lib/orpc";

export function DeleteWorkspaceSection({
  workspaceSlug,
  workspaceName,
  isOnlyWorkspace,
}: {
  workspaceSlug: string;
  workspaceName: string;
  isOnlyWorkspace: boolean;
}) {
  const [nameInput, setNameInput] = useState("");
  const code = useTwoFactorCode();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameMatches = nameInput.trim() === workspaceName;

  async function deleteWorkspace() {
    setBusy(true);
    setError(null);
    try {
      await orpc.workspaces.delete({ workspaceSlug, code: code.value });
      window.location.href = "/w";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
      <div className="flex items-center gap-2">
        <Trash2 className="size-4 text-destructive-text" />
        <h2 className="text-[13px] font-medium text-foreground">Delete this workspace</h2>
      </div>
      <p className="mt-1 text-[12px] text-destructive-muted">
        Permanently deletes “{workspaceName}” for every member, including its mailboxes, calendars,
        drives, address books, workflows, labels, and scheduled sends. This cannot be undone. If
        anyone connected Outlook, they should also remove the app from their{" "}
        <a
          href="https://account.microsoft.com/privacy/app-access"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          personal
        </a>{" "}
        or{" "}
        <a
          href="https://myapps.microsoft.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          work or school
        </a>{" "}
        Microsoft account.
      </p>
      {isOnlyWorkspace ? (
        <p className="mt-3 text-[12px] text-destructive-muted">
          You can't delete your only workspace.
        </p>
      ) : (
        <div className="mt-3 flex flex-col items-start gap-2 sm:flex-row">
          <Input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder={`Type “${workspaceName}” to confirm`}
            disabled={busy}
            className="sm:max-w-72 text-[13px]"
          />
          <Button
            variant="destructive"
            disabled={busy || !nameMatches}
            onClick={() => setConfirmOpen(true)}
          >
            Delete workspace
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-[12px] text-destructive-text">{error}</p>}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{workspaceName}”?</AlertDialogTitle>
            <AlertDialogDescription>
              All members lose access immediately. Mailboxes, calendars, drives, address books,
              workflows, labels, scheduled sends, and cached data are erased from it. If anyone
              connected Outlook, they should also remove the app from their{" "}
              <a
                href="https://account.microsoft.com/privacy/app-access"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                personal
              </a>{" "}
              or{" "}
              <a
                href="https://myapps.microsoft.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                work or school
              </a>{" "}
              Microsoft account.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <TwoFactorInput autoFocus field={code.field} />

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteWorkspace} disabled={busy || !code.complete}>
              {busy ? "Deleting…" : "Delete workspace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
