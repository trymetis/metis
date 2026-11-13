"use client";

import { Button } from "@metis/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@metis/ui/components/collapsible";
import { cn } from "@metis/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Circle, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

import { useDashboardRole } from "@/components/dashboard/dashboard-role";
import { Loading } from "@/components/dashboard/system-client";
import {
  Mono,
  Note,
  Row,
  Rows,
  Section,
  Sections,
  ToneBadge,
} from "@/components/dashboard/system-ui";
import { TotpConfirmDialog } from "@/components/totp-confirm-dialog";
import { orpc, rpc } from "@/lib/orpc";
import type { DashboardUpdates, DashboardUpgrade, SystemTone } from "@/server/schema";

const POLL_MS = 2_000;
const RELEASES_SHOWN = 10;

type ProgressStep = { step: NonNullable<DashboardUpgrade["step"]>; label: string };

const UPGRADE_STEPS: ProgressStep[] = [
  { step: "pull", label: "Pull the release" },
  { step: "snapshot", label: "Put the app in maintenance and snapshot the database" },
  { step: "preflight", label: "Run preflight and migrate the database" },
  { step: "switch", label: "Switch the app" },
  { step: "ready", label: "Wait until it is ready" },
];

const UNDO_STEPS: ProgressStep[] = [
  { step: "pull", label: "Pull the previous release" },
  { step: "restore", label: "Put the app in maintenance and restore the database snapshot" },
  { step: "switch", label: "Switch the app" },
  { step: "ready", label: "Wait until it is ready" },
];

function progressSteps(upgrade: DashboardUpgrade, snapshots: boolean): ProgressStep[] {
  if (upgrade.kind === "rollback") return UNDO_STEPS;
  return snapshots ? UPGRADE_STEPS : UPGRADE_STEPS.filter(({ step }) => step !== "snapshot");
}

const STATE_BADGE: Record<DashboardUpgrade["state"], { tone: SystemTone; label: string }> = {
  running: { tone: "warning", label: "Running" },
  succeeded: { tone: "ok", label: "Succeeded" },
  failed: { tone: "danger", label: "Failed" },
  "rollback-failed": { tone: "danger", label: "Needs attention" },
};

type Pending = { kind: "upgrade"; version: string } | { kind: "rollback" };

function when(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function Progress({ upgrade, snapshots }: { upgrade: DashboardUpgrade; snapshots: boolean }) {
  const steps = progressSteps(upgrade, snapshots);
  const current = steps.findIndex(({ step }) => step === upgrade.step);
  return (
    <ol className="flex flex-col gap-1.5 py-1.5">
      {steps.map(({ step, label }, index) => {
        const done = current > index;
        const active = current === index;
        return (
          <li
            key={step}
            className={cn(
              "flex items-center gap-2 text-[13px]",
              done || active ? "text-foreground" : "text-faint",
            )}
          >
            {done ? (
              <Check className="h-3.5 w-3.5 text-status-success" />
            ) : active ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Circle className="h-3.5 w-3.5" />
            )}
            {label}
          </li>
        );
      })}
      {upgrade.kind === "upgrade" && upgrade.step === "restore" && (
        <li className="flex items-center gap-2 text-[13px] text-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Switching back to {upgrade.fromVersion ?? "the previous images"}
        </li>
      )}
    </ol>
  );
}

function failureNote(upgrade: DashboardUpgrade, from: string, snapshots: boolean): string {
  if (upgrade.kind === "rollback") {
    return upgrade.state === "failed"
      ? `The undo did not start; ${from} kept running.`
      : `Undoing the upgrade failed partway. On the server, check sudo metis status (the release it runs, and that sqld and the app are running) and sudo metis logs app.`;
  }
  if (upgrade.state === "failed") {
    if (!upgrade.restored) return `${upgrade.toVersion} was not installed; ${from} kept running.`;
    return snapshots
      ? `${upgrade.toVersion} failed, so the updater restored the database snapshot and switched back to ${from}.`
      : `${upgrade.toVersion} failed, so the updater switched back to ${from}.`;
  }
  return `Switching back to ${from} failed too. On the server, check sudo metis status and sudo metis logs app.`;
}

function UpgradeSection({
  upgrade,
  offline,
  snapshots,
}: {
  upgrade: DashboardUpgrade;
  offline: boolean;
  snapshots: boolean;
}) {
  const badge = STATE_BADGE[upgrade.state];
  const from = upgrade.fromVersion ?? "unpinned images";
  return (
    <Section
      title={upgrade.kind === "rollback" ? "Last undo" : "Last upgrade"}
      description={`${from} → ${upgrade.toVersion}`}
      badge={<ToneBadge tone={badge.tone}>{badge.label}</ToneBadge>}
    >
      {upgrade.state === "running" && <Progress upgrade={upgrade} snapshots={snapshots} />}
      <Rows>
        <Row label="Started">{when(upgrade.startedAt)}</Row>
        {upgrade.state !== "running" && <Row label="Finished">{when(upgrade.finishedAt)}</Row>}
      </Rows>
      {upgrade.state === "running" && offline && (
        <Note>
          The app is restarting. This page reconnects on its own once the new release answers.
        </Note>
      )}
      {upgrade.state === "succeeded" && <Note>Reload the page to use {upgrade.toVersion}.</Note>}
      {(upgrade.state === "failed" || upgrade.state === "rollback-failed") && (
        <Note>{failureNote(upgrade, from, snapshots)}</Note>
      )}
      {upgrade.error && (
        <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">
          {upgrade.error}
        </pre>
      )}
    </Section>
  );
}

function ReleaseRow({
  release,
  latest,
  disabled,
  onUpgrade,
}: {
  release: DashboardUpdates["releases"][number];
  latest: boolean;
  disabled: boolean;
  onUpgrade: (() => void) | null;
}) {
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[13px] text-muted-foreground">{release.version}</span>
        <span className="inline-flex items-center gap-2">
          {latest && <ToneBadge tone="neutral">Latest</ToneBadge>}
          {onUpgrade && (
            <Button size="sm" disabled={disabled} onClick={onUpgrade}>
              Upgrade
            </Button>
          )}
        </span>
      </div>
      {release.notes && (
        <Collapsible>
          <CollapsibleTrigger className="group mt-1 flex cursor-pointer items-center gap-1 text-[11px] text-faint hover:text-foreground">
            <ChevronRight className="h-3 w-3 transition-transform group-data-[panel-open]:rotate-90" />
            Release notes
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 rounded-md bg-muted p-3 text-[13px]">
              <Streamdown mode="static" className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                {release.notes}
              </Streamdown>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

export function UpdatesView() {
  const queryClient = useQueryClient();
  const updates = rpc.dashboard.system.updates;
  const query = useQuery(
    updates.queryOptions({
      refetchInterval: (q) => (q.state.data?.upgrade?.state === "running" ? POLL_MS : false),
      refetchIntervalInBackground: true,
    }),
  );
  const data: DashboardUpdates | null = query.data ?? null;
  const offline = query.isError && query.data !== undefined;
  const loadError = query.isError && query.data === undefined ? query.error : null;
  const [pending, setPending] = useState<Pending | null>(null);
  const { canOperate } = useDashboardRole();
  const lastState = useRef<DashboardUpgrade["state"] | null>(null);

  useEffect(() => {
    if (loadError) toast.error(errorMessage(loadError, "Could not load updates"));
  }, [loadError]);

  const upgrade = data?.upgrade ?? null;
  const running = upgrade?.state === "running";

  useEffect(() => {
    const state = upgrade?.state ?? null;
    if (lastState.current === "running" && upgrade && state !== "running") {
      if (state === "succeeded") {
        toast.success(`Now running ${upgrade.toVersion}`);
      } else {
        toast.error(upgrade.kind === "rollback" ? "The undo failed" : "The upgrade failed");
      }
    }
    lastState.current = state;
  }, [upgrade]);

  const confirm = useCallback(
    async (code: string) => {
      if (!pending) return;
      const started =
        pending.kind === "upgrade"
          ? await orpc.dashboard.system.upgrade({
              version: pending.version,
              code,
            })
          : await orpc.dashboard.system.rollback({ code });
      queryClient.setQueryData(updates.queryKey(), (current) =>
        current ? { ...current, upgrade: started } : current,
      );
    },
    [pending, queryClient, updates],
  );

  if (!data) return <Loading />;

  if (!data.reachable) {
    return (
      <Section
        title="The updater is not answering"
        description="The app reaches it over its Unix socket; check that the updater service is running."
        badge={<ToneBadge tone="danger">Unreachable</ToneBadge>}
      >
        {data.error && <Mono>{data.error}</Mono>}
      </Section>
    );
  }

  const latest = data.releases[0]?.version ?? null;
  const { rollbackVersion } = data;
  const installable = data.releases.filter(
    (release) => release.newer || data.currentVersion === null,
  );

  return (
    <Sections>
      <Section
        title="Running release"
        description="The release every service of this instance runs."
        badge={
          data.currentVersion && data.currentVersion === latest ? (
            <ToneBadge tone="ok">Up to date</ToneBadge>
          ) : data.releases.some((release) => release.newer) ? (
            <ToneBadge tone="warning">Update available</ToneBadge>
          ) : undefined
        }
      >
        <Rows>
          <Row label="Version">
            {data.currentVersion ? (
              <Mono>{data.currentVersion}</Mono>
            ) : (
              <ToneBadge tone="warning">Not a pinned release</ToneBadge>
            )}
          </Row>
          <Row label="Undo">
            {rollbackVersion && !canOperate ? (
              <Mono>{rollbackVersion}</Mono>
            ) : rollbackVersion ? (
              <Button
                variant="outline"
                size="sm"
                disabled={running}
                onClick={() => setPending({ kind: "rollback" })}
              >
                Undo last upgrade
              </Button>
            ) : (
              <span className="text-faint">{data.snapshots ? "None" : "Not available"}</span>
            )}
          </Row>
        </Rows>
        {rollbackVersion && (
          <Note>
            Undo returns to {rollbackVersion} and restores the database as it was at{" "}
            {when(data.rollbackSnapshotAt)}. Everything written since then is lost.
          </Note>
        )}
        {!data.snapshots && (
          <Note>
            The database is not this stack&apos;s sqld, so the updater cannot snapshot it and an
            upgrade cannot be undone. Back up the database before upgrading.
          </Note>
        )}
        {!data.currentVersion && (
          <Note>
            The images are not pinned to a release, so the version is unknown. Upgrading pins them.
          </Note>
        )}
      </Section>

      <Section
        title="Releases"
        description={
          data.snapshots
            ? "Upgrading pulls the release, stops the app, snapshots the database, runs preflight, which migrates the database, then switches the app and waits until it is ready. If a step fails, the updater restores the snapshot and switches back on its own."
            : "Upgrading pulls the release, runs preflight, which migrates the database, then switches the app and waits until it is ready. If a step fails, the updater switches back on its own."
        }
      >
        {data.error && <Note>{data.error}</Note>}
        {installable.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            {data.releases.length === 0
              ? "No releases are listed."
              : "No newer release is published."}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {installable.slice(0, RELEASES_SHOWN).map((release) => (
              <ReleaseRow
                key={release.version}
                release={release}
                latest={release.version === latest}
                disabled={running}
                onUpgrade={
                  canOperate
                    ? () => setPending({ kind: "upgrade", version: release.version })
                    : null
                }
              />
            ))}
          </div>
        )}
      </Section>

      {upgrade && <UpgradeSection upgrade={upgrade} offline={offline} snapshots={data.snapshots} />}

      <TotpConfirmDialog
        open={pending !== null}
        title={pending?.kind === "upgrade" ? `Upgrade to ${pending.version}` : "Undo last upgrade"}
        body={
          pending?.kind === "upgrade"
            ? "The app restarts on that release. Open pages reconnect once it is ready."
            : `The app restarts on ${rollbackVersion ?? "the previous release"} with the database as it was at ${when(data.rollbackSnapshotAt)}. Everything written since then is lost, and the upgrade cannot be undone again.`
        }
        confirmLabel={pending?.kind === "upgrade" ? "Upgrade" : "Undo"}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        onConfirm={confirm}
      />
    </Sections>
  );
}
