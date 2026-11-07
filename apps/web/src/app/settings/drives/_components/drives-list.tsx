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
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AccountIdentity } from "@/components/account-identity";
import { DriveDialog } from "@/components/drive-dialog";
import { PageHeader } from "@/components/page-header";
import { usePlatformPolicy } from "@/components/platform-policy-context";
import { RESOURCE_PROVIDER_META } from "@/components/provider-meta";
import {
  type ResourceWorkspaceRow,
  ResourceWorkspacesDialog,
} from "@/components/resource-workspaces-dialog";
import type { DriveProvider } from "@/connections/types";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import type { UserDrive } from "@/server/schema";

function connectHref(provider: DriveProvider) {
  return `/api/connections/start/${provider}/drive?callbackURL=${encodeURIComponent("/settings/drives")}`;
}

function refresh() {
  return refreshQuery(rpc.drives.list.queryKey());
}

export function DrivesList() {
  const platform = usePlatformPolicy();
  const query = useQuery(rpc.drives.list.queryOptions());
  const drives = query.data?.drives ?? null;
  const loadError = query.error ? query.error.message || "Could not load your drives" : null;
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDetach, setConfirmDetach] = useState<{
    drive: UserDrive;
    workspace: ResourceWorkspaceRow;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserDrive | null>(null);

  async function setPolicy(linkId: string, patch: { aiEnabled?: boolean }, code?: string) {
    if (patch.aiEnabled === undefined) return;
    setBusy(linkId);
    try {
      await orpc.drives.setPolicy({
        linkId,
        aiEnabled: patch.aiEnabled,
        code,
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change these settings");
    } finally {
      setBusy(null);
    }
  }

  async function setAiEverywhere(driveId: string, patch: { aiEnabled?: boolean }, code?: string) {
    if (patch.aiEnabled === undefined) return;
    setBusy(driveId);
    try {
      await orpc.drives.setPolicyEverywhere({
        driveId,
        aiEnabled: patch.aiEnabled,
        code,
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change these settings");
    } finally {
      setBusy(null);
    }
  }

  async function detach(linkId: string) {
    setBusy(linkId);
    setConfirmDetach(null);
    try {
      await orpc.drives.detach({ linkId });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove that drive");
    } finally {
      setBusy(null);
    }
  }

  async function remove(driveId: string) {
    setBusy(driveId);
    setConfirmDelete(null);
    try {
      await orpc.drives.delete({ driveId });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Drives"
        description="Every drive connected to your account, and which workspaces use it."
        action={
          <DriveDialog connectHref={connectHref}>
            <Button variant="outline" size="sm">
              <Plus className="h-3.5 w-3.5" />
              Connect drive
            </Button>
          </DriveDialog>
        }
      />

      <div className="mt-6 flex flex-col gap-2">
        {drives === null && loadError ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <p className="text-[13px] text-destructive-text">{loadError}</p>
          </div>
        ) : drives === null ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
          </div>
        ) : drives.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <p className="text-[13px] text-faint">No drives connected yet.</p>
          </div>
        ) : (
          drives.map((d) => {
            const meta = RESOURCE_PROVIDER_META.drive[d.provider];
            const count = d.workspaces.length;
            return (
              <div
                key={d.driveId}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border">
                  <meta.Mark className="h-5 w-5" />
                </div>
                <AccountIdentity email={d.email} label={meta.label} server={d.server} />

                <ResourceWorkspacesDialog
                  busy={busy}
                  onRemove={(w) => setConfirmDetach({ drive: d, workspace: w })}
                  onSetEverywhere={(patch, code) => setAiEverywhere(d.driveId, patch, code)}
                  onSetPolicy={setPolicy}
                  platform={platform}
                  resourceLabel="This drive"
                  showPhishing={false}
                  title={d.email}
                  workspaces={d.workspaces}
                >
                  <Button variant="outline" size="sm" disabled={count === 0}>
                    In {count} {count === 1 ? "workspace" : "workspaces"}
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </ResourceWorkspacesDialog>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDelete(d)}
                  disabled={busy === d.driveId}
                  className="text-destructive-text hover:text-destructive-text"
                  aria-label={`Delete drive for ${d.email}`}
                >
                  {busy === d.driveId ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            );
          })
        )}
      </div>

      <AlertDialog
        open={confirmDetach !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDetach(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {confirmDetach?.drive.email} from {confirmDetach?.workspace.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              That workspace loses this drive along with the folder choices it had for it. The
              account stays connected and keeps working in your other workspaces.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDetach && detach(confirmDetach.workspace.linkId)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the drive for {confirmDelete?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from every workspace it is in. Nothing is deleted at the provider. If
              this account has no mailbox, calendar or address book left here, the whole grant is
              revoked — otherwise the file access stays granted until you remove the rest too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && remove(confirmDelete.driveId)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
