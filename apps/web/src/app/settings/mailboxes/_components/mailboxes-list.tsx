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
import { MailboxDialog } from "@/components/mailbox-dialog";
import { PageHeader } from "@/components/page-header";
import { usePlatformPolicy } from "@/components/platform-policy-context";
import { RESOURCE_PROVIDER_META } from "@/components/provider-meta";
import {
  type ResourceWorkspaceRow,
  ResourceWorkspacesDialog,
} from "@/components/resource-workspaces-dialog";
import type { MailProvider } from "@/connections/types";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import type { UserMailbox } from "@/server/schema";

const MICROSOFT_REVOKE_PERSONAL = "https://account.microsoft.com/privacy/app-access";
const MICROSOFT_REVOKE_WORK = "https://myapps.microsoft.com";

function connectHref(provider: MailProvider) {
  return `/api/connections/start/${provider}/mailbox?callbackURL=${encodeURIComponent("/settings/mailboxes")}`;
}

function refresh() {
  return refreshQuery(rpc.mailboxes.list.queryKey());
}

export function MailboxesList() {
  const platform = usePlatformPolicy();
  const query = useQuery(rpc.mailboxes.list.queryOptions());
  const mailboxes = query.data?.mailboxes ?? null;
  const loadError = query.error ? query.error.message || "Could not load your mailboxes" : null;
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDetach, setConfirmDetach] = useState<{
    mailbox: UserMailbox;
    workspace: ResourceWorkspaceRow;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserMailbox | null>(null);

  async function setPolicy(
    linkId: string,
    patch: { aiEnabled?: boolean; phishingDetectionEnabled?: boolean },
    code?: string,
  ) {
    setBusy(linkId);
    try {
      await orpc.mailboxes.setPolicy({ linkId, ...patch, code });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change these settings");
    } finally {
      setBusy(null);
    }
  }

  async function setPolicyEverywhere(
    mailboxId: string,
    patch: { aiEnabled?: boolean; phishingDetectionEnabled?: boolean },
    code?: string,
  ) {
    setBusy(mailboxId);
    try {
      await orpc.mailboxes.setPolicyEverywhere({ mailboxId, ...patch, code });
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
      await orpc.mailboxes.detach({ linkId });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove(mailboxId: string) {
    setBusy(mailboxId);
    setConfirmDelete(null);
    try {
      await orpc.mailboxes.delete({ mailboxId });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Mailboxes"
        description="Every mailbox connected to your account, and which workspaces use it."
        action={
          <MailboxDialog connectHref={connectHref}>
            <Button variant="outline" size="sm">
              <Plus className="h-3.5 w-3.5" />
              Connect mailbox
            </Button>
          </MailboxDialog>
        }
      />

      <div className="mt-6 flex flex-col gap-2">
        {mailboxes === null && loadError ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <p className="text-[13px] text-destructive-text">{loadError}</p>
          </div>
        ) : mailboxes === null ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
          </div>
        ) : mailboxes.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <p className="text-[13px] text-faint">No mailboxes connected yet.</p>
          </div>
        ) : (
          mailboxes.map((m) => {
            const meta = RESOURCE_PROVIDER_META.mailbox[m.provider];
            const count = m.workspaces.length;
            return (
              <div
                key={m.mailboxId}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3"
              >
                {m.image ? (
                  // oxlint-disable-next-line nextjs/no-img-element --avatars are data URLs / external CDN; next/image adds no value here
                  <img
                    src={m.image}
                    alt={meta.label}
                    referrerPolicy="no-referrer"
                    className="h-9 w-9 shrink-0 rounded-lg border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border">
                    <meta.Mark className="h-5 w-5" />
                  </div>
                )}
                <AccountIdentity email={m.email} label={meta.label} server={m.server} />

                <ResourceWorkspacesDialog
                  busy={busy}
                  onRemove={(w) => setConfirmDetach({ mailbox: m, workspace: w })}
                  onSetEverywhere={(patch, code) => setPolicyEverywhere(m.mailboxId, patch, code)}
                  onSetPolicy={setPolicy}
                  platform={platform}
                  resourceLabel="This mailbox"
                  showPhishing
                  title={m.email}
                  workspaces={m.workspaces}
                >
                  <Button variant="outline" size="sm" disabled={count === 0}>
                    In {count} {count === 1 ? "workspace" : "workspaces"}
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </ResourceWorkspacesDialog>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDelete(m)}
                  disabled={busy === m.mailboxId}
                  className="text-destructive-text hover:text-destructive-text"
                  aria-label={`Delete ${m.email}`}
                >
                  {busy === m.mailboxId ? (
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
              Remove {confirmDetach?.mailbox.email} from {confirmDetach?.workspace.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              That workspace loses access to this mailbox, along with any workflows set up for it
              there. The mailbox stays on your account and keeps working in your other workspaces.
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
            <AlertDialogTitle>Delete {confirmDelete?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the mailbox from every workspace. If you have no calendar, drive or
              address book on this account either, we disconnect it completely; otherwise it stays
              connected for those, since mail access can&rsquo;t be removed on its own. The copies
              of your emails, labels, and summaries we stored are deleted. Your actual mail is
              untouched.
              {confirmDelete?.provider === "microsoft" && (
                <>
                  {" "}
                  Microsoft has no per-app revoke API, so also remove this app from your{" "}
                  <a
                    href={MICROSOFT_REVOKE_PERSONAL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    personal account
                  </a>{" "}
                  or{" "}
                  <a
                    href={MICROSOFT_REVOKE_WORK}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    work or school account
                  </a>
                  .
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn("bg-destructive text-white")}
              onClick={() => confirmDelete && remove(confirmDelete.mailboxId)}
            >
              Delete mailbox
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
