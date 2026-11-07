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
import { CalendarDialog } from "@/components/calendar-dialog";
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
import type { CalendarProvider } from "@/connections/types";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import type { WorkspaceCalendar } from "@/server/schema";
import { workspaceSettingsPath } from "@/workspace/path";

import { CalendarVisibility } from "./calendar-visibility";

export function WorkspaceCalendarsInner() {
  const platform = usePlatformPolicy();
  const configuredProviders = serverProviders(serversForResource(useConnectServers(), "calendar"));
  const scope = useWorkspaceScope();
  const searchParams = useSearchParams();
  const errorFromOAuth = searchParams.get("error");

  const listQuery = useQuery(rpc.workspaceCalendars.list.queryOptions({ input: scope }));
  const attachableQuery = useQuery(
    rpc.workspaceCalendars.attachable.queryOptions({ input: scope }),
  );
  const policyQuery = useQuery(rpc.workspaces.getPolicy.queryOptions({ input: scope }));
  const data = listQuery.data ?? null;
  const attachable = attachableQuery.data?.calendars ?? [];
  const workspacePolicy = policyQuery.data ?? null;
  const loading = listQuery.isPending || attachableQuery.isPending || policyQuery.isPending;
  const failed = listQuery.error ?? attachableQuery.error ?? policyQuery.error;
  const loadError = failed ? failed.message || "Could not load this workspace's calendars" : null;
  async function refresh() {
    await Promise.all([
      refreshQuery(rpc.workspaceCalendars.list.queryKey({ input: scope })),
      refreshQuery(rpc.workspaceCalendars.attachable.queryKey({ input: scope })),
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
  const [confirmRemove, setConfirmRemove] = useState<WorkspaceCalendar | null>(null);

  const deepLinked = searchParams.get("calendar");
  const linkDeps = [deepLinked, data] as const;
  const [linkedDeps, setLinkedDeps] = useState<typeof linkDeps | null>(null);
  if (linkedDeps === null || linkDeps.some((dep, i) => dep !== linkedDeps[i])) {
    setLinkedDeps(linkDeps);
    const linked = deepLinked
      ? data?.calendars.find((c) => c.calendarId === deepLinked)
      : undefined;
    if (linked) {
      setExpanded(linked.linkId);
      setFlashing(linked.linkId);
    }
  }

  useEffect(() => {
    if (!deepLinked || !data) return;
    const target = data.calendars.find((c) => c.calendarId === deepLinked);
    if (!target) return;

    const row = document.getElementById(`calendar-${target.linkId}`);
    row?.scrollIntoView({ block: "center", behavior: "smooth" });

    const url = new URL(window.location.href);
    url.searchParams.delete("calendar");
    window.history.replaceState(null, "", url.toString());

    const timer = setTimeout(() => setFlashing(null), 2000);
    return () => clearTimeout(timer);
  }, [deepLinked, data]);

  const connectHref = useCallback(
    (provider: CalendarProvider) => {
      const back = encodeURIComponent(workspaceSettingsPath(scope.workspaceSlug, "calendars"));
      return `/api/connections/start/${provider}/calendar?attachTo=${encodeURIComponent(scope.workspaceSlug)}&callbackURL=${back}`;
    },
    [scope.workspaceSlug],
  );

  async function setPolicy(linkId: string, aiEnabled: boolean, code?: string) {
    setBusy(linkId);
    try {
      await orpc.calendars.setPolicy({ linkId, aiEnabled, code });
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

  async function attach(calendarId: string) {
    await orpc.workspaceCalendars.attach({ ...scope, calendarId });
    await refresh();
  }

  async function remove(target: WorkspaceCalendar) {
    setBusy(target.linkId);
    setConfirmRemove(null);
    try {
      await orpc.workspaceCalendars.detach({
        ...scope,
        linkId: target.linkId,
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the calendar");
    } finally {
      setBusy(null);
    }
  }

  const isAdmin = data?.viewerRole === "owner" || data?.viewerRole === "admin";

  return (
    <TooltipProvider delay={200}>
      <PageHeader
        className="mb-6"
        title="Calendars"
        description={`Connect your ${providerNames(configuredProviders, "account")} account once and pick which of its calendars this workspace can see.`}
      />

      {errorFromOAuth && (
        <div className="mb-6 rounded-lg border border-destructive/25 bg-destructive/8 px-4 py-3 text-[12px] text-destructive-text">
          {decodeURIComponent(errorFromOAuth)}
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[1.5px] text-faint">
          Calendar accounts in this workspace
        </div>
        <CalendarDialog
          connectHref={connectHref}
          attachable={attachable}
          policyNotice={attachPolicyNotice(workspacePolicy, "calendar")}
          workspaceSlug={scope.workspaceSlug}
          onAttach={attach}
        >
          <Button variant="outline" size="sm">
            <Plus className="h-3.5 w-3.5" />
            Add calendar
          </Button>
        </CalendarDialog>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
        </div>
      ) : !data && loadError ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-[13px] text-destructive-text">{loadError}</p>
        </div>
      ) : !data || data.calendars.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-[13px] text-faint">
            No calendars here yet. Use Add calendar to pick an account you&rsquo;ve already
            connected, or connect a new one.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {data.calendars.map((cal) => {
            const meta = RESOURCE_PROVIDER_META.calendar[cal.provider];
            const open = expanded === cal.linkId;
            const canEdit = isAdmin || cal.ownedByMe;
            const aiOverride = overrideLabel(cal.aiEnabled, cal.policy.ai);
            const selected = listed[cal.linkId] ?? cal.visibleCalendarIds.length;
            return (
              <div
                key={cal.linkId}
                id={`calendar-${cal.linkId}`}
                className={cn(
                  "rounded-xl border border-border bg-surface",
                  flashing === cal.linkId && "metis-flash",
                )}
              >
                <div className="flex flex-wrap items-center gap-3 p-3">
                  {cal.image ? (
                    // oxlint-disable-next-line nextjs/no-img-element --avatars are data URLs / external CDN; next/image adds no value here
                    <img
                      src={cal.image}
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
                    email={cal.email}
                    label={meta.label}
                    server={cal.server}
                    detail={`/${cal.slug} · ${
                      selected === 0 ? "none selected" : `${selected} selected`
                    }`}
                  />

                  {aiOverride && <PolicyBadge label={aiOverride} on={cal.policy.ai} />}

                  {platform.ai &&
                    (cal.ownedByMe ? (
                      <AiToggle
                        disabled={busy === cal.linkId}
                        label={
                          cal.aiEnabled
                            ? "AI is on for this calendar here"
                            : "AI is off for this calendar here"
                        }
                        on={cal.aiEnabled}
                        onToggle={(next) => toggleAi(cal.linkId, cal.email, next)}
                      />
                    ) : (
                      <AiMark
                        label={
                          cal.policy.ai
                            ? "AI is on for this calendar here"
                            : "AI is off for this calendar here"
                        }
                        on={cal.policy.ai}
                      />
                    ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmRemove(cal)}
                    disabled={busy === cal.linkId}
                  >
                    {busy === cal.linkId ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Remove
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={open ? "Hide calendars" : "Show calendars"}
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : cal.linkId)}
                  >
                    <ChevronDown
                      className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
                    />
                  </Button>
                </div>

                {open && (
                  <CalendarVisibility
                    linkId={cal.linkId}
                    visibleCalendarIds={cal.visibleCalendarIds}
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
              This workspace loses the calendar and the visibility choices made for it.
              {confirmRemove?.ownedByMe
                ? " The account stays connected and nothing is disconnected at the provider — manage that under Settings → Calendars."
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
        body={`AI will be able to read ${confirmAi?.email ?? "this calendar"} in this workspace — the assistants and any enabled MCP client. Other workspaces are unaffected.`}
        confirmLabel="Turn AI on"
        onConfirm={async (code) => {
          if (!confirmAi) return;
          await setPolicy(confirmAi.linkId, true, code);
        }}
        onOpenChange={(open) => {
          if (!open) setConfirmAi(null);
        }}
        open={confirmAi !== null}
        title="Turn AI on for this calendar here?"
      />
    </TooltipProvider>
  );
}
