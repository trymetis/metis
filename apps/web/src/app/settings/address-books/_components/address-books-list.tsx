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
import { cn } from "@metis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AccountIdentity } from "@/components/account-identity";
import { AddressBookDialog } from "@/components/address-book-dialog";
import { PageHeader } from "@/components/page-header";
import { usePlatformPolicy } from "@/components/platform-policy-context";
import { RESOURCE_PROVIDER_META } from "@/components/provider-meta";
import {
  type ResourceWorkspaceRow,
  ResourceWorkspacesDialog,
} from "@/components/resource-workspaces-dialog";
import type { AddressBookProvider } from "@/connections/types";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import type { UserAddressBook } from "@/server/schema";

function connectHref(provider: AddressBookProvider) {
  return `/api/connections/start/${provider}/addressbook?callbackURL=${encodeURIComponent("/settings/address-books")}`;
}

function refresh() {
  return refreshQuery(rpc.addressBooks.list.queryKey());
}

export function AddressBooksList() {
  const platform = usePlatformPolicy();
  const query = useQuery(rpc.addressBooks.list.queryOptions());
  const addressBooks = query.data?.addressBooks ?? null;
  const loadError = query.error ? query.error.message || "Could not load your address books" : null;
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDetach, setConfirmDetach] = useState<{
    addressBook: UserAddressBook;
    workspace: ResourceWorkspaceRow;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserAddressBook | null>(null);

  async function setPolicy(linkId: string, patch: { aiEnabled?: boolean }, code?: string) {
    if (patch.aiEnabled === undefined) return;
    setBusy(linkId);
    try {
      await orpc.addressBooks.setPolicy({
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

  async function setAiEverywhere(
    addressBookId: string,
    patch: { aiEnabled?: boolean },
    code?: string,
  ) {
    if (patch.aiEnabled === undefined) return;
    setBusy(addressBookId);
    try {
      await orpc.addressBooks.setPolicyEverywhere({
        addressBookId,
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
      await orpc.addressBooks.detach({ linkId });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove(addressBookId: string) {
    setBusy(addressBookId);
    setConfirmDelete(null);
    try {
      await orpc.addressBooks.delete({ addressBookId });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Address books"
        description="Every address book connected to your account, and which workspaces use it."
        action={
          <AddressBookDialog connectHref={connectHref}>
            <Button variant="outline" size="sm">
              <Plus className="h-3.5 w-3.5" />
              Connect address book
            </Button>
          </AddressBookDialog>
        }
      />

      <div className="mt-6 flex flex-col gap-2">
        {addressBooks === null && loadError ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <p className="text-[13px] text-destructive-text">{loadError}</p>
          </div>
        ) : addressBooks === null ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
          </div>
        ) : addressBooks.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <p className="text-[13px] text-faint">No address books connected yet.</p>
          </div>
        ) : (
          addressBooks.map((c) => {
            const meta = RESOURCE_PROVIDER_META.addressbook[c.provider];
            const count = c.workspaces.length;
            return (
              <div
                key={c.addressBookId}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border">
                  <meta.Mark className="h-5 w-5" />
                </div>
                <AccountIdentity email={c.email} label={meta.label} server={c.server} />

                <ResourceWorkspacesDialog
                  busy={busy}
                  onRemove={(w) => setConfirmDetach({ addressBook: c, workspace: w })}
                  onSetEverywhere={(patch, code) => setAiEverywhere(c.addressBookId, patch, code)}
                  onSetPolicy={setPolicy}
                  platform={platform}
                  resourceLabel="This address book"
                  showPhishing={false}
                  title={c.email}
                  workspaces={c.workspaces}
                >
                  <Button variant="outline" size="sm" disabled={count === 0}>
                    In {count} {count === 1 ? "workspace" : "workspaces"}
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </ResourceWorkspacesDialog>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDelete(c)}
                  disabled={busy === c.addressBookId}
                  className="text-destructive-text hover:text-destructive-text"
                  aria-label={`Delete address book for ${c.email}`}
                >
                  {busy === c.addressBookId ? (
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
              Remove {confirmDetach?.addressBook.email} from {confirmDetach?.workspace.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              That workspace loses this address book along with the visibility choices it had for
              it. The account stays connected and keeps working in your other workspaces.
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
            <AlertDialogTitle>Remove the address book for {confirmDelete?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the address book from every workspace using it. If you have no mailbox,
              calendar or drive on this account either, we disconnect it completely; otherwise it
              stays connected for those, since contacts access can&rsquo;t be removed on its own.
              Your contacts are untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn("bg-destructive text-white")}
              onClick={() => confirmDelete && remove(confirmDelete.addressBookId)}
            >
              Remove address book
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
