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
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/auth/client";
import { AccountIdentity } from "@/components/account-identity";
import { useConnectServers } from "@/components/connect-servers-context";
import { MailboxDialog } from "@/components/mailbox-dialog";
import { PageHeader } from "@/components/page-header";
import { usePlatformPolicy } from "@/components/platform-policy-context";
import { attachPolicyNotice, overrideLabel, PolicyBadge } from "@/components/policy-badge";
import { AiMark, AiToggle, PhishingMark, PhishingToggle } from "@/components/policy-icons";
import {
  providerNames,
  RESOURCE_PROVIDER_META,
  serverProviders,
  serversForResource,
} from "@/components/provider-meta";
import { TotpConfirmDialog } from "@/components/totp-confirm-dialog";
import type { MailProvider } from "@/connections/types";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import type { WorkspaceMailbox } from "@/server/schema";
import { workspaceSettingsPath } from "@/workspace/path";

export function WorkspaceMailboxesInner() {
  const platform = usePlatformPolicy();
  const configuredProviders = serverProviders(serversForResource(useConnectServers(), "mailbox"));
  const router = useRouter();
  const searchParams = useSearchParams();
  const scope = useWorkspaceScope();
  const errorFromOAuth = searchParams.get("error");
  const isOnboarding = searchParams.get("onboarding") === "1";

  const { data: session, isPending } = useSession();
  const enabled = Boolean(session);
  const listQuery = useQuery(rpc.workspaceMailboxes.list.queryOptions({ input: scope, enabled }));
  const attachableQuery = useQuery(
    rpc.workspaceMailboxes.attachable.queryOptions({ input: scope, enabled }),
  );
  const policyQuery = useQuery(rpc.workspaces.getPolicy.queryOptions({ input: scope, enabled }));
  const data = listQuery.data ?? null;
  const attachable = attachableQuery.data?.mailboxes ?? [];
  const workspacePolicy = policyQuery.data ?? null;
  const loading = listQuery.isPending || attachableQuery.isPending || policyQuery.isPending;
  const failed = listQuery.error ?? attachableQuery.error ?? policyQuery.error;
  const loadError = failed ? failed.message || "Could not load this workspace's mailboxes" : null;
  async function refresh() {
    await Promise.all([
      refreshQuery(rpc.workspaceMailboxes.list.queryKey({ input: scope })),
      refreshQuery(rpc.workspaceMailboxes.attachable.queryKey({ input: scope })),
      refreshQuery(rpc.workspaces.getPolicy.queryKey({ input: scope })),
    ]);
  }
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmOn, setConfirmOn] = useState<{
    linkId: string;
    email: string;
    patch: { aiEnabled?: boolean; phishingDetectionEnabled?: boolean };
    axis: "ai" | "phishing";
  } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<WorkspaceMailbox | null>(null);

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/");
    }
  }, [session, isPending, router]);

  const connectHref = useCallback(
    (provider: MailProvider) => {
      const back = encodeURIComponent(workspaceSettingsPath(scope.workspaceSlug, "mailboxes"));
      return `/api/connections/start/${provider}/mailbox?attachTo=${encodeURIComponent(scope.workspaceSlug)}&callbackURL=${back}`;
    },
    [scope.workspaceSlug],
  );

  async function setPolicy(
    linkId: string,
    patch: { aiEnabled?: boolean; phishingDetectionEnabled?: boolean },
    code?: string,
  ) {
    setBusy(linkId);
    try {
      await orpc.mailboxes.setPolicy({ linkId, ...patch, code });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  function togglePolicy(
    linkId: string,
    email: string,
    patch: { aiEnabled?: boolean; phishingDetectionEnabled?: boolean },
  ) {
    if (patch.aiEnabled === true) {
      setConfirmOn({ linkId, email, patch, axis: "ai" });
      return;
    }
    if (patch.phishingDetectionEnabled === true) {
      setConfirmOn({ linkId, email, patch, axis: "phishing" });
      return;
    }
    setPolicy(linkId, patch).catch((err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Could not change these settings");
    });
  }

  async function attach(mailboxId: string) {
    await orpc.workspaceMailboxes.attach({ ...scope, mailboxId });
    await refresh();
  }

  async function remove(target: WorkspaceMailbox) {
    setBusy(target.linkId);
    setConfirmRemove(null);
    try {
      await orpc.workspaceMailboxes.detach({ ...scope, linkId: target.linkId });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the mailbox");
    } finally {
      setBusy(null);
    }
  }

  if (isPending || !session) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin opacity-50" />
      </div>
    );
  }

  const attachNotice = attachPolicyNotice(workspacePolicy, "mailbox");

  return (
    <TooltipProvider delay={200}>
      <PageHeader
        className="mb-4"
        title={isOnboarding ? "Nothing in this workspace yet" : "Mailboxes"}
        description={
          isOnboarding
            ? "Add a mailbox here, or a calendar, drive or address book from the settings menu. If you already use another workspace, switch to it instead."
            : `Sign in once with your email, add any ${providerNames(configuredProviders, "mail")} mailbox, and switch between them without re-authenticating.`
        }
      />

      {errorFromOAuth && (
        <div className="mb-6 rounded-lg border border-destructive/25 bg-destructive/8 px-4 py-3 text-[12px] text-destructive-text">
          {decodeURIComponent(errorFromOAuth)}
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[1.5px] text-faint">
          Mailboxes in this workspace
        </div>
        <MailboxDialog
          connectHref={connectHref}
          attachable={attachable}
          policyNotice={attachNotice}
          workspaceSlug={scope.workspaceSlug}
          onAttach={attach}
        >
          <Button variant="outline" size="sm">
            <Plus className="h-3.5 w-3.5" />
            Add mailbox
          </Button>
        </MailboxDialog>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center text-[13px] text-faint">
          <Loader2 className="mx-auto h-4 w-4 animate-spin" />
        </div>
      ) : !data && loadError ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-[13px] text-destructive-text">{loadError}</p>
        </div>
      ) : !data || data.mailboxes.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-[13px] text-faint">
            No mailboxes here yet. Use Add mailbox to pick one you've already connected, or connect
            a new one.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {data.mailboxes.map((acc) => {
            const meta = RESOURCE_PROVIDER_META.mailbox[acc.provider];
            const aiOverride = overrideLabel(acc.aiEnabled, acc.policy.ai);
            const phishingOverride = overrideLabel(
              acc.phishingDetectionEnabled,
              acc.policy.phishingDetection,
            );
            return (
              <div
                key={acc.linkId}
                className="flex flex-wrap items-center gap-3 rounded-xl border p-3 transition-colors border-border bg-surface"
              >
                {acc.image ? (
                  // oxlint-disable-next-line nextjs/no-img-element --avatars are data URLs / external CDN; next/image adds no value here
                  <img
                    src={acc.image}
                    alt={meta.label}
                    referrerPolicy="no-referrer"
                    className="h-9 w-9 shrink-0 rounded-lg border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface border border-border">
                    <meta.Mark className="h-5 w-5" />
                  </div>
                )}
                <AccountIdentity
                  className="min-w-40"
                  email={acc.email}
                  label={meta.label}
                  server={acc.server}
                  detail={`/${acc.slug}`}
                />
                {aiOverride && <PolicyBadge label={aiOverride} on={acc.policy.ai} />}
                {phishingOverride && (
                  <PolicyBadge label={phishingOverride} on={acc.policy.phishingDetection} />
                )}

                {platform.ai &&
                  (acc.ownedByMe ? (
                    <AiToggle
                      disabled={busy === acc.linkId}
                      label={
                        acc.aiEnabled
                          ? "AI is on for this mailbox here"
                          : "AI is off for this mailbox here"
                      }
                      on={acc.aiEnabled}
                      onToggle={(next) => togglePolicy(acc.linkId, acc.email, { aiEnabled: next })}
                    />
                  ) : (
                    <AiMark
                      label={
                        acc.policy.ai
                          ? "AI is on for this mailbox here"
                          : "AI is off for this mailbox here"
                      }
                      on={acc.policy.ai}
                    />
                  ))}

                {platform.phishingDetection &&
                  (acc.ownedByMe ? (
                    <PhishingToggle
                      disabled={busy === acc.linkId}
                      label={
                        acc.phishingDetectionEnabled
                          ? "Phishing detection is on for this mailbox here"
                          : "Phishing detection is off for this mailbox here"
                      }
                      on={acc.phishingDetectionEnabled}
                      onToggle={(next) =>
                        togglePolicy(acc.linkId, acc.email, {
                          phishingDetectionEnabled: next,
                        })
                      }
                    />
                  ) : (
                    <PhishingMark
                      label={
                        acc.policy.phishingDetection
                          ? "Phishing detection is on for this mailbox here"
                          : "Phishing detection is off for this mailbox here"
                      }
                      on={acc.policy.phishingDetection}
                    />
                  ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmRemove(acc)}
                  disabled={busy === acc.linkId}
                >
                  {busy === acc.linkId ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Remove
                </Button>
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
              Everyone in this workspace loses the mailbox and its workflows.
              {confirmRemove?.ownedByMe
                ? " The mailbox stays on your account and nothing is disconnected at the provider — manage that under Settings → Mailboxes."
                : " The mailbox belongs to whoever connected it and stays on their account; nothing is disconnected at the provider. Only they can remove it entirely."}
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
        body={
          confirmOn?.axis === "phishing"
            ? `Every message in ${confirmOn.email} will be sent to the phishing-detection service to be scanned while it is in this workspace. Other workspaces are unaffected.`
            : `AI will be able to read ${confirmOn?.email ?? "this mailbox"} in this workspace — the assistants and any enabled MCP client. Other workspaces are unaffected.`
        }
        confirmLabel={confirmOn?.axis === "phishing" ? "Turn detection on" : "Turn AI on"}
        onConfirm={async (code) => {
          if (!confirmOn) return;
          await setPolicy(confirmOn.linkId, confirmOn.patch, code);
        }}
        onOpenChange={(open) => {
          if (!open) setConfirmOn(null);
        }}
        open={confirmOn !== null}
        title={
          confirmOn?.axis === "phishing"
            ? "Turn phishing detection on for this mailbox here?"
            : "Turn AI on for this mailbox here?"
        }
      />
    </TooltipProvider>
  );
}
