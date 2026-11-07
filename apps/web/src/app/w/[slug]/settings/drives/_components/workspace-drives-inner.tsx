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
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { AccountIdentity } from "@/components/account-identity";
import { useConnectServers } from "@/components/connect-servers-context";
import { DriveDialog } from "@/components/drive-dialog";
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
import type { DriveProvider } from "@/connections/types";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import type { WorkspaceDrive } from "@/server/schema";
import { workspaceSettingsPath } from "@/workspace/path";

import { DriveVisibility } from "./drive-visibility";

export function WorkspaceDrivesInner() {
  const platform = usePlatformPolicy();
  const configuredProviders = serverProviders(serversForResource(useConnectServers(), "drive"));
  const scope = useWorkspaceScope();
  const searchParams = useSearchParams();
  const errorFromOAuth = searchParams.get("error");

  const listQuery = useQuery(rpc.workspaceDrives.list.queryOptions({ input: scope }));
  const attachableQuery = useQuery(rpc.workspaceDrives.attachable.queryOptions({ input: scope }));
  const policyQuery = useQuery(rpc.workspaces.getPolicy.queryOptions({ input: scope }));
  const data = listQuery.data ?? null;
  const attachable = attachableQuery.data?.drives ?? [];
  const workspacePolicy = policyQuery.data ?? null;
  const loading = listQuery.isPending || attachableQuery.isPending || policyQuery.isPending;
  const failed = listQuery.error ?? attachableQuery.error ?? policyQuery.error;
  const loadError = failed ? failed.message || "Could not load this workspace's drives" : null;
  async function refresh() {
    await Promise.all([
      refreshQuery(rpc.workspaceDrives.list.queryKey({ input: scope })),
      refreshQuery(rpc.workspaceDrives.attachable.queryKey({ input: scope })),
      refreshQuery(rpc.workspaces.getPolicy.queryKey({ input: scope })),
    ]);
  }
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmAi, setConfirmAi] = useState<{
    linkId: string;
    email: string;
  } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<WorkspaceDrive | null>(null);

  const connectHref = useCallback(
    (provider: DriveProvider) => {
      const callbackURL = workspaceSettingsPath(scope.workspaceSlug, "drives");
      const params = new URLSearchParams({
        callbackURL,
        attachTo: scope.workspaceSlug,
      });
      return `/api/connections/start/${provider}/drive?${params.toString()}`;
    },
    [scope.workspaceSlug],
  );

  async function setPolicy(linkId: string, aiEnabled: boolean, code?: string) {
    setBusy(linkId);
    try {
      await orpc.drives.setPolicy({ linkId, aiEnabled, code });
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

  async function attach(driveId: string) {
    await orpc.workspaceDrives.attach({ ...scope, driveId });
    await refresh();
  }

  async function remove(target: WorkspaceDrive) {
    setBusy(target.linkId);
    setConfirmRemove(null);
    try {
      await orpc.workspaceDrives.detach({ ...scope, linkId: target.linkId });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the drive");
    } finally {
      setBusy(null);
    }
  }

  const isAdmin = data?.viewerRole === "owner" || data?.viewerRole === "admin";

  return (
    <TooltipProvider delay={200}>
      <PageHeader
        className="mb-6"
        title="Drives"
        description={`Connect your ${providerNames(configuredProviders, "account")} account once and browse its files from this workspace.`}
      />

      {errorFromOAuth && (
        <div className="mb-6 rounded-lg border border-destructive/25 bg-destructive/8 px-4 py-3 text-[12px] text-destructive-text">
          {decodeURIComponent(errorFromOAuth)}
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[1.5px] text-faint">
          Drive accounts in this workspace
        </div>
        <DriveDialog
          connectHref={connectHref}
          attachable={attachable}
          policyNotice={attachPolicyNotice(workspacePolicy, "drive")}
          workspaceSlug={scope.workspaceSlug}
          onAttach={attach}
        >
          <Button variant="outline" size="sm">
            <Plus className="h-3.5 w-3.5" />
            Add drive
          </Button>
        </DriveDialog>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
        </div>
      ) : !data && loadError ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-[13px] text-destructive-text">{loadError}</p>
        </div>
      ) : !data || data.drives.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-[13px] text-faint">
            No drives here yet. Use Add drive to pick an account you&rsquo;ve already connected, or
            connect a new one.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {data.drives.map((item) => {
            const meta = RESOURCE_PROVIDER_META.drive[item.provider];
            const open = expanded === item.linkId;
            const canEdit = isAdmin || item.ownedByMe;
            const aiOverride = overrideLabel(item.aiEnabled, item.policy.ai);
            return (
              <div key={item.linkId} className="rounded-xl border border-border bg-surface">
                <div className="flex flex-wrap items-center gap-3 p-3">
                  {item.image ? (
                    // oxlint-disable-next-line nextjs/no-img-element --avatars are data URLs / external CDN; next/image adds no value here
                    <img
                      src={item.image}
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
                    email={item.email}
                    label={meta.label}
                    server={item.server}
                    detail={`/${item.slug} · ${
                      item.visibleRootIds.length === 0
                        ? "whole drive"
                        : `${item.visibleRootIds.length} folder${item.visibleRootIds.length === 1 ? "" : "s"}`
                    }`}
                  />

                  {aiOverride && <PolicyBadge label={aiOverride} on={item.policy.ai} />}

                  {platform.ai &&
                    (item.ownedByMe ? (
                      <AiToggle
                        disabled={busy === item.linkId}
                        label={
                          item.aiEnabled
                            ? "AI is on for this drive here"
                            : "AI is off for this drive here"
                        }
                        on={item.aiEnabled}
                        onToggle={(next) => toggleAi(item.linkId, item.email, next)}
                      />
                    ) : (
                      <AiMark
                        label={
                          item.policy.ai
                            ? "AI is on for this drive here"
                            : "AI is off for this drive here"
                        }
                        on={item.policy.ai}
                      />
                    ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmRemove(item)}
                    disabled={busy === item.linkId}
                  >
                    {busy === item.linkId ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Remove
                  </Button>

                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={open ? "Hide folders" : "Choose folders"}
                      aria-expanded={open}
                      onClick={() => setExpanded(open ? null : item.linkId)}
                    >
                      <ChevronDown
                        className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
                      />
                    </Button>
                  )}
                </div>

                {open && (
                  <DriveVisibility
                    linkId={item.linkId}
                    visibleRootIds={item.visibleRootIds}
                    onSaved={() => {
                      setExpanded(null);
                      refresh().catch((err: unknown) => {
                        toast.error(
                          err instanceof Error
                            ? err.message
                            : "Could not reload this workspace's drives",
                        );
                      });
                    }}
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
              The drive keeps working in your other workspaces and nothing is deleted at the
              provider. Folder choices made here are lost.
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
        body={`AI will be able to read ${confirmAi?.email ?? "this drive"} in this workspace — the assistants and any enabled MCP client. Other workspaces are unaffected.`}
        confirmLabel="Turn AI on"
        onConfirm={async (code) => {
          if (!confirmAi) return;
          await setPolicy(confirmAi.linkId, true, code);
        }}
        onOpenChange={(open) => {
          if (!open) setConfirmAi(null);
        }}
        open={confirmAi !== null}
        title="Turn AI on for this drive here?"
      />
    </TooltipProvider>
  );
}
