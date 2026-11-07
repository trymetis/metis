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
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useState } from "react";

import { TotpConfirmDialog } from "@/components/totp-confirm-dialog";
import { TwoFactorInput } from "@/components/two-factor-input";
import { useTwoFactorCode } from "@/hooks/use-two-factor-code";
import { invalidateWorkspaces } from "@/hooks/use-workspaces";
import { orpc } from "@/lib/orpc";
import type { WorkspaceRole } from "@/types/workspace";
import { workspaceRootPath } from "@/workspace/path";

export interface AdminMember {
  memberId: string;
  userId?: string | null;
  email: string;
  name: string;
  role: WorkspaceRole;
}

export interface AdminInvite {
  id: string;
  email: string;
}

export interface MemberAdmin {
  canChangeRole: (member: AdminMember) => boolean;
  canRemove: (member: AdminMember) => boolean;
  canTransfer: (member: AdminMember) => boolean;
  canRevoke: boolean;
  setRole: (member: AdminMember, role: "admin" | "member") => void;
  remove: (member: AdminMember) => void;
  transfer: (member: AdminMember) => void;
  revoke: (invite: AdminInvite) => void;
  busy: string | null;
  error: string | null;
  dialogs: ReactNode;
}

export function useMemberAdmin({
  workspaceSlug,
  workspaceName,
  role,
  selfUserId,
  onChange,
}: {
  workspaceSlug: string;
  workspaceName: string;
  role: WorkspaceRole | null;
  selfUserId?: string;
  onChange: () => Promise<void> | void;
}): MemberAdmin {
  const router = useRouter();
  const isAdmin = role === "owner" || role === "admin";
  const isOwner = role === "owner";
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promote, setPromote] = useState<AdminMember | null>(null);
  const [removing, setRemoving] = useState<AdminMember | null>(null);
  const [transferring, setTransferring] = useState<AdminMember | null>(null);
  const [revoking, setRevoking] = useState<AdminInvite | null>(null);
  const transferCode = useTwoFactorCode();

  const run = useCallback(
    async (id: string, fn: () => Promise<unknown>, fallback: string) => {
      setError(null);
      setBusy(id);
      try {
        await fn();
        await onChange();
      } catch (err) {
        setError(err instanceof Error ? err.message : fallback);
        throw err;
      } finally {
        setBusy(null);
      }
    },
    [onChange],
  );

  const changeRole = useCallback(
    (member: AdminMember, next: "admin" | "member", code?: string) =>
      run(
        member.memberId,
        () =>
          orpc.workspaces.updateMemberRole({
            workspaceSlug,
            memberId: member.memberId,
            role: next,
            code,
          }),
        "Could not change role",
      ),
    [run, workspaceSlug],
  );

  const dialogs = (
    <>
      <TotpConfirmDialog
        body={`${promote?.email ?? "This member"} will be able to change this workspace's AI and privacy settings, and manage its mailboxes, calendars, drives and address books.`}
        confirmLabel="Make admin"
        onConfirm={async (code) => {
          if (!promote) return;
          await changeRole(promote, "admin", code);
        }}
        onOpenChange={(open) => {
          if (!open) setPromote(null);
        }}
        open={promote !== null}
        title="Make this member an admin?"
      />

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removing?.email} from {workspaceName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They immediately lose access to every mailbox, calendar, drive and address book in
              this workspace. Anything they connected themselves stays on their own account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = removing;
                setRemoving(null);
                if (!target) return;
                const remove = () =>
                  orpc.workspaces.removeMember({
                    workspaceSlug,
                    memberId: target.memberId,
                  });
                if (selfUserId && target.userId === selfUserId) {
                  setError(null);
                  setBusy(target.memberId);
                  remove()
                    .then(() => {
                      invalidateWorkspaces();
                      router.push(workspaceRootPath());
                    })
                    .catch((err) => {
                      setError(
                        err instanceof Error ? err.message : "Could not leave the workspace",
                      );
                      setBusy(null);
                    });
                  return;
                }
                run(target.memberId, remove, "Could not remove member").catch(() => {});
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={transferring !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setTransferring(null);
            transferCode.reset();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer ownership?</AlertDialogTitle>
            <AlertDialogDescription>
              {transferring
                ? `This workspace will belong to ${transferring.name || transferring.email}. You'll become an admin.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <TwoFactorInput autoFocus field={transferCode.field} />
          {error && <p className="text-center text-xs text-destructive-text">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!transferring || !!busy || !transferCode.complete}
              onClick={() => {
                const target = transferring;
                if (!target) return;
                run(
                  target.memberId,
                  async () => {
                    await orpc.workspaces.transferOwnership({
                      workspaceSlug,
                      memberId: target.memberId,
                      code: transferCode.value,
                    });
                    invalidateWorkspaces();
                  },
                  "Could not transfer ownership",
                )
                  .then(() => {
                    setTransferring(null);
                    transferCode.reset();
                  })
                  .catch(() => {});
              }}
            >
              {busy ? "Transferring…" : "Transfer ownership"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel the invite to {revoking?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their invite link stops working right away. You can invite them again at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep invite</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = revoking;
                setRevoking(null);
                if (!target) return;
                run(
                  target.id,
                  () =>
                    orpc.workspaces.revokeInvite({
                      workspaceSlug,
                      inviteId: target.id,
                    }),
                  "Could not revoke invite",
                ).catch(() => {});
              }}
            >
              Cancel invite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return {
    canChangeRole: (m) => isOwner && m.role !== "owner",
    canRemove: (m) => isAdmin && m.role !== "owner",
    canTransfer: (m) => isOwner && m.role !== "owner",
    canRevoke: isAdmin,
    setRole: (m, next) => {
      if (next === "admin") {
        setPromote(m);
        return;
      }
      changeRole(m, next).catch(() => {});
    },
    remove: (m) => setRemoving(m),
    transfer: (m) => {
      setError(null);
      transferCode.reset();
      setTransferring(m);
    },
    revoke: (invite) => setRevoking(invite),
    busy,
    error,
    dialogs,
  };
}
