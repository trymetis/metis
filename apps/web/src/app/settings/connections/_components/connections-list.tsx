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
import type { BrandMark } from "@metis/ui/components/brand-marks";
import { Button } from "@metis/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@metis/ui/components/tooltip";
import { cn } from "@metis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { AccountIdentity } from "@/components/account-identity";
import { PageHeader } from "@/components/page-header";
import { ACCOUNT_PROVIDER_META, resourceProviderMeta } from "@/components/provider-meta";
import {
  type ConnectionProvider,
  type ConnectionResource,
  providerSupportsResource,
} from "@/connections/types";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import type { UserConnection } from "@/server/schema";

const MICROSOFT_REVOKE_PERSONAL = "https://account.microsoft.com/privacy/app-access";
const MICROSOFT_REVOKE_WORK = "https://myapps.microsoft.com";

const RESOURCES: { resource: ConnectionResource; label: string }[] = [
  { resource: "mailbox", label: "Mail" },
  { resource: "calendar", label: "Calendar" },
  { resource: "drive", label: "Drive" },
  { resource: "addressbook", label: "Contacts" },
];

function markFor(resource: ConnectionResource, provider: ConnectionProvider): BrandMark | null {
  return providerSupportsResource(provider, resource)
    ? resourceProviderMeta(resource, provider).Mark
    : null;
}

function addHref(provider: ConnectionProvider, resource: ConnectionResource, connectionId: string) {
  const params = new URLSearchParams({
    expectConnection: connectionId,
    callbackURL: "/settings/connections",
  });
  return `/api/connections/start/${provider}/${resource}?${params.toString()}`;
}

function ResourceIcons({ account }: { account: UserConnection }) {
  return (
    <div className="flex items-center gap-1">
      {RESOURCES.map(({ resource, label }) => {
        const Mark = markFor(resource, account.provider);
        if (!Mark) return null;
        const linked = account.linked.includes(resource);
        const granted = account.granted.includes(resource);
        const tip = linked
          ? `${label} is set up on this account`
          : granted
            ? `Set up ${label.toLowerCase()} on this account`
            : `Add ${label.toLowerCase()} to this account`;

        return (
          <Tooltip key={resource}>
            <TooltipTrigger
              render={
                linked ? (
                  <span
                    aria-label={tip}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface"
                  >
                    <Mark className="h-4 w-4" />
                  </span>
                ) : (
                  <Button
                    aria-label={tip}
                    className="h-8 w-8 border-dashed"
                    onClick={() => {
                      window.location.href = addHref(
                        account.provider,
                        resource,
                        account.connectionId,
                      );
                    }}
                    size="icon-sm"
                    variant="outline"
                  >
                    <Mark
                      className={cn("h-4 w-4", granted ? "opacity-55" : "opacity-30 grayscale")}
                    />
                  </Button>
                )
              }
            />
            <TooltipContent>{tip}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function refresh() {
  return refreshQuery(rpc.connections.list.queryKey());
}

export function ConnectionsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = useQuery(rpc.connections.list.queryOptions());
  const connections = query.data?.connections ?? null;
  const loadError = query.error ? query.error.message || "Could not load your connections" : null;
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<UserConnection | null>(null);
  const warning = searchParams.get("warning");

  async function revoke(connectionId: string) {
    setBusy(connectionId);
    setConfirmRevoke(null);
    try {
      await orpc.connections.delete({ connectionId });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <TooltipProvider delay={200}>
      <div>
        <PageHeader
          title="Connections"
          description={<>The accounts you&rsquo;ve connected, and what you use each one for.</>}
        />

        {warning && (
          <div className="mt-6 flex items-start gap-2 rounded-xl border border-brand/30 bg-brand-soft p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-brand-text" />
            <p className="flex-1 text-[13px] text-foreground">{warning}</p>
            <Button
              aria-label="Dismiss"
              onClick={() => router.replace("/settings/connections")}
              size="icon-sm"
              variant="ghost"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {connections === null && loadError ? (
            <div className="rounded-xl border border-border bg-surface p-6 text-center">
              <p className="text-[13px] text-destructive-text">{loadError}</p>
            </div>
          ) : connections === null ? (
            <div className="rounded-xl border border-border bg-surface p-6 text-center">
              <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
            </div>
          ) : connections.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface p-6 text-center">
              <p className="text-[13px] text-faint">
                No accounts connected yet. Connect a mailbox, calendar, drive or address book to get
                started.
              </p>
            </div>
          ) : (
            connections.map((account) => {
              const meta = ACCOUNT_PROVIDER_META[account.provider];
              return (
                <div
                  key={account.connectionId}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3"
                >
                  {account.image ? (
                    // oxlint-disable-next-line nextjs/no-img-element --avatars are data URLs / external CDN; next/image adds no value here
                    <img
                      src={account.image}
                      alt={meta.label}
                      referrerPolicy="no-referrer"
                      className="h-9 w-9 shrink-0 rounded-lg border border-border object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border">
                      <meta.Mark className="h-5 w-5" />
                    </div>
                  )}
                  <AccountIdentity
                    email={account.email}
                    label={meta.label}
                    server={account.server}
                  />

                  <ResourceIcons account={account} />

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmRevoke(account)}
                    disabled={busy === account.connectionId}
                    className="text-destructive-text hover:text-destructive-text"
                    aria-label={`Disconnect ${account.email}`}
                  >
                    {busy === account.connectionId ? (
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
          open={confirmRevoke !== null}
          onOpenChange={(open) => {
            if (!open) setConfirmRevoke(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disconnect {confirmRevoke?.email}?</AlertDialogTitle>
              <AlertDialogDescription>
                Its mailbox, calendar, drive and address book are removed from every workspace, and
                Metis Suite loses access to the account. Your messages, events, files and contacts
                stay exactly where they are.
                {confirmRevoke?.provider === "microsoft" && (
                  <>
                    {" "}
                    To finish, remove Metis Suite from your{" "}
                    <a
                      href={MICROSOFT_REVOKE_PERSONAL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                    >
                      personal Microsoft account
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
                onClick={() => confirmRevoke && revoke(confirmRevoke.connectionId)}
              >
                Disconnect account
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
