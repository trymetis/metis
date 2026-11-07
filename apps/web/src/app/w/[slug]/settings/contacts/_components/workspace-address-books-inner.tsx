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
import { TooltipProvider } from "@metis/ui/components/tooltip";
import { cn } from "@metis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AccountIdentity } from "@/components/account-identity";
import { AddressBookDialog } from "@/components/address-book-dialog";
import { useConnectServers } from "@/components/connect-servers-context";
import { PageHeader } from "@/components/page-header";
import { usePlatformPolicy } from "@/components/platform-policy-context";
import { attachPolicyNotice, overrideLabel, PolicyBadge } from "@/components/policy-badge";
import { AiMark, AiToggle } from "@/components/policy-icons";
import {
  providerNames,
  RESOURCE_PROVIDER_META,
  serverProviders,
  serversForResource,
} from "@/components/provider-meta";
import { TotpConfirmDialog } from "@/components/totp-confirm-dialog";
import type { AddressBookProvider } from "@/connections/types";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import type { WorkspaceAddressBook } from "@/server/schema";
import { workspaceSettingsPath } from "@/workspace/path";

import { AddressBookVisibility } from "./address-book-visibility";

export function WorkspaceAddressBooksInner() {
  const platform = usePlatformPolicy();
  const configuredProviders = serverProviders(
    serversForResource(useConnectServers(), "addressbook"),
  );
  const scope = useWorkspaceScope();
  const searchParams = useSearchParams();
  const errorFromOAuth = searchParams.get("error");

  const listQuery = useQuery(rpc.workspaceAddressBooks.list.queryOptions({ input: scope }));
  const attachableQuery = useQuery(
    rpc.workspaceAddressBooks.attachable.queryOptions({ input: scope }),
  );
  const policyQuery = useQuery(rpc.workspaces.getPolicy.queryOptions({ input: scope }));
  const data = listQuery.data ?? null;
  const attachable = attachableQuery.data?.addressBooks ?? [];
  const workspacePolicy = policyQuery.data ?? null;
  const loading = listQuery.isPending || attachableQuery.isPending || policyQuery.isPending;
  const failed = listQuery.error ?? attachableQuery.error ?? policyQuery.error;
  const loadError = failed
    ? failed.message || "Could not load this workspace's address books"
    : null;
  async function refresh() {
    await Promise.all([
      refreshQuery(rpc.workspaceAddressBooks.list.queryKey({ input: scope })),
      refreshQuery(rpc.workspaceAddressBooks.attachable.queryKey({ input: scope })),
      refreshQuery(rpc.workspaces.getPolicy.queryKey({ input: scope })),
    ]);
  }
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [flashing, setFlashing] = useState<string | null>(null);
  const [listed, setListed] = useState<Record<string, number>>({});
  const onListed = useCallback(
    (linkId: string, selected: number) => setListed((prev) => ({ ...prev, [linkId]: selected })),
    [],
  );
  const [confirmAi, setConfirmAi] = useState<{
    linkId: string;
    email: string;
  } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<WorkspaceAddressBook | null>(null);

  const deepLinked = searchParams.get("addressBook");
  const linkDeps = [deepLinked, data] as const;
  const [linkedDeps, setLinkedDeps] = useState<typeof linkDeps | null>(null);
  if (linkedDeps === null || linkDeps.some((dep, i) => dep !== linkedDeps[i])) {
    setLinkedDeps(linkDeps);
    const linked = deepLinked
      ? data?.addressBooks.find((c) => c.addressBookId === deepLinked)
      : undefined;
    if (linked) {
      setExpanded(linked.linkId);
      setFlashing(linked.linkId);
    }
  }

  useEffect(() => {
    if (!deepLinked || !data) return;
    const target = data.addressBooks.find((c) => c.addressBookId === deepLinked);
    if (!target) return;

    const row = document.getElementById(`address-book-${target.linkId}`);
    row?.scrollIntoView({ block: "center", behavior: "smooth" });

    const url = new URL(window.location.href);
    url.searchParams.delete("addressBook");
    window.history.replaceState(null, "", url.toString());

    const timer = setTimeout(() => setFlashing(null), 2000);
    return () => clearTimeout(timer);
  }, [deepLinked, data]);

  const connectHref = useCallback(
    (provider: AddressBookProvider) => {
      const back = encodeURIComponent(workspaceSettingsPath(scope.workspaceSlug, "contacts"));
      return `/api/connections/start/${provider}/addressbook?attachTo=${encodeURIComponent(scope.workspaceSlug)}&callbackURL=${back}`;
    },
    [scope.workspaceSlug],
  );

  async function setPolicy(linkId: string, aiEnabled: boolean, code?: string) {
    setBusy(linkId);
    try {
      await orpc.addressBooks.setPolicy({ linkId, aiEnabled, code });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  function toggleAi(linkId: string, email: string, next: boolean) {
    if (next) {
      setConfirmAi({ linkId, email });
      return;
    }
    setPolicy(linkId, false).catch((err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Could not turn AI off");
    });
  }

  async function attach(addressBookId: string) {
    await orpc.workspaceAddressBooks.attach({ ...scope, addressBookId });
    await refresh();
  }

  async function remove(target: WorkspaceAddressBook) {
    setBusy(target.linkId);
    setConfirmRemove(null);
    try {
      await orpc.workspaceAddressBooks.detach({
        ...scope,
        linkId: target.linkId,
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the address book");
    } finally {
      setBusy(null);
    }
  }

  const isAdmin = data?.viewerRole === "owner" || data?.viewerRole === "admin";

  return (
    <TooltipProvider delay={200}>
      <PageHeader
        className="mb-6"
        title="Contacts"
        description={`Connect your ${providerNames(configuredProviders, "account")} account once and pick which of its address books this workspace can see.`}
      />

      {errorFromOAuth && (
        <div className="mb-6 rounded-lg border border-destructive/25 bg-destructive/8 px-4 py-3 text-[12px] text-destructive-text">
          {decodeURIComponent(errorFromOAuth)}
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[1.5px] text-faint">
          Address books in this workspace
        </div>
        <AddressBookDialog
          connectHref={connectHref}
          attachable={attachable}
          policyNotice={attachPolicyNotice(workspacePolicy, "addressbook")}
          workspaceSlug={scope.workspaceSlug}
          onAttach={attach}
        >
          <Button variant="outline" size="sm">
            <Plus className="h-3.5 w-3.5" />
            Add address book
          </Button>
        </AddressBookDialog>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
        </div>
      ) : !data && loadError ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-[13px] text-destructive-text">{loadError}</p>
        </div>
      ) : !data || data.addressBooks.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-[13px] text-faint">
            No address books here yet. Use Add address book to pick an account you&rsquo;ve already
            connected, or connect a new one.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {data.addressBooks.map((book) => {
            const meta = RESOURCE_PROVIDER_META.addressbook[book.provider];
            const open = expanded === book.linkId;
            const canEdit = isAdmin || book.ownedByMe;
            const aiOverride = overrideLabel(book.aiEnabled, book.policy.ai);
            const selected = listed[book.linkId] ?? book.visibleBookIds.length;
            return (
              <div
                key={book.linkId}
                id={`address-book-${book.linkId}`}
                className={cn(
                  "rounded-xl border border-border bg-surface",
                  flashing === book.linkId && "metis-flash",
                )}
              >
                <div className="flex flex-wrap items-center gap-3 p-3">
                  {book.image ? (
                    // oxlint-disable-next-line nextjs/no-img-element --avatars are data URLs / external CDN; next/image adds no value here
                    <img
                      src={book.image}
                      alt={meta.label}
                      referrerPolicy="no-referrer"
                      className="h-9 w-9 shrink-0 rounded-lg border border-border object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface">
                      <meta.Mark className="h-5 w-5" />
                    </div>
                  )}
                  <AccountIdentity
                    className="min-w-40"
                    email={book.email}
                    label={meta.label}
                    server={book.server}
                    detail={`/${book.slug} · ${
                      selected === 0 ? "none selected" : `${selected} selected`
                    }`}
                  />

                  {aiOverride && <PolicyBadge label={aiOverride} on={book.policy.ai} />}

                  {platform.ai &&
                    (book.ownedByMe ? (
                      <AiToggle
                        disabled={busy === book.linkId}
                        label={
                          book.aiEnabled
                            ? "AI is on for this address book here"
                            : "AI is off for this address book here"
                        }
                        on={book.aiEnabled}
                        onToggle={(next) => toggleAi(book.linkId, book.email, next)}
                      />
                    ) : (
                      <AiMark
                        label={
                          book.policy.ai
                            ? "AI is on for this address book here"
                            : "AI is off for this address book here"
                        }
                        on={book.policy.ai}
                      />
                    ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmRemove(book)}
                    disabled={busy === book.linkId}
                  >
                    {busy === book.linkId ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Remove
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={open ? "Hide address books" : "Show address books"}
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : book.linkId)}
                  >
                    <ChevronDown
                      className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
                    />
                  </Button>
                </div>

                {open && (
                  <AddressBookVisibility
                    linkId={book.linkId}
                    visibleBookIds={book.visibleBookIds}
                    canEdit={canEdit}
                    onSaved={refresh}
                    onListed={onListed}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={confirmRemove !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {confirmRemove?.email} from this workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              This workspace loses the address book and the visibility choices made for it.
              {confirmRemove?.ownedByMe
                ? " The account stays connected and nothing is disconnected at the provider — manage that under Settings → Address books."
                : " The account belongs to whoever connected it and stays on their account; nothing is disconnected at the provider."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmRemove && remove(confirmRemove)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TotpConfirmDialog
        body={`AI will be able to read and, with your approval, change ${confirmAi?.email ?? "this address book"} in this workspace — the assistants and any enabled MCP client. Other workspaces are unaffected.`}
        confirmLabel="Turn AI on"
        onConfirm={async (code) => {
          if (!confirmAi) return;
          await setPolicy(confirmAi.linkId, true, code);
        }}
        onOpenChange={(open) => {
          if (!open) setConfirmAi(null);
        }}
        open={confirmAi !== null}
        title="Turn AI on for this address book here?"
      />
    </TooltipProvider>
  );
}
