"use client";

import { Button } from "@metis/ui/components/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@metis/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useDashboardRole } from "@/components/dashboard/dashboard-role";
import { ScrollTable } from "@/components/dashboard/scroll-table";
import { CheckResults, Loading, useSystemResource } from "@/components/dashboard/system-client";
import { Mono, Section, Sections, ToneBadge } from "@/components/dashboard/system-ui";
import { TotpConfirmDialog } from "@/components/totp-confirm-dialog";
import { isOneOf } from "@/lib/guards";
import { orpc, rpc } from "@/lib/orpc";
import type {
  DashboardConfigDiff,
  DashboardConfigHistory,
  DashboardSystemCheck,
  SystemTone,
} from "@/server/schema";
import {
  CONFIG_SECTION_LABELS,
  CONFIG_SECTIONS,
  type InstanceConfigKind,
} from "@/types/instance-config";

const load = rpc.dashboard.system.history.queryOptions();

const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const KIND_BADGE: Record<InstanceConfigKind, { label: string; tone: SystemTone }> = {
  seed: { label: "Seed", tone: "neutral" },
  edit: { label: "Edit", tone: "warning" },
  revert: { label: "Restore", tone: "warning" },
  reset: { label: "Reset", tone: "warning" },
};

type Version = DashboardConfigHistory["versions"][number];

function sectionLabel(key: string): string {
  return isOneOf(CONFIG_SECTIONS, key) ? CONFIG_SECTION_LABELS[key] : key;
}

function VersionSelect({
  label,
  versions,
  value,
  onChange,
}: {
  label: string;
  versions: Version[];
  value: number;
  onChange: (version: number) => void;
}) {
  const items = versions.map((entry) => ({
    value: String(entry.version),
    label: `Version ${entry.version}`,
  }));
  return (
    <Select
      items={items}
      value={String(value)}
      onValueChange={(next) => {
        if (next) onChange(Number(next));
      }}
    >
      <SelectTrigger aria-label={label} className="w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function DiffSection({
  versions,
  from,
  to,
  onFrom,
  onTo,
}: {
  versions: Version[];
  from: number;
  to: number;
  onFrom: (version: number) => void;
  onTo: (version: number) => void;
}) {
  const query = useQuery(rpc.dashboard.system.diff.queryOptions({ input: { from, to } }));
  const diff: DashboardConfigDiff | null = query.data ?? null;
  const diffError = query.error;

  useEffect(() => {
    if (diffError) toast.error(diffError.message || "Could not compare");
  }, [diffError]);

  return (
    <Section
      title="Compare"
      description="What changed between two versions. Secrets show only whether they changed."
      badge={
        <span className="flex shrink-0 items-center gap-2">
          <VersionSelect label="From" versions={versions} value={from} onChange={onFrom} />
          <ArrowRight className="h-4 w-4 text-faint" strokeWidth={1.75} />
          <VersionSelect label="To" versions={versions} value={to} onChange={onTo} />
        </span>
      }
    >
      {diff === null ? (
        <div className="py-4 text-center">
          <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
        </div>
      ) : diff.sections.length === 0 ? (
        <p className="py-1 text-[13px] text-faint">No differences.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {diff.sections.map((section) => (
            <div key={section.section}>
              <p className="text-[11px] font-medium tracking-wide text-faint uppercase">
                {section.label}
              </p>
              <div className="mt-1 divide-y divide-border">
                {section.changes.map((change) => (
                  <div key={change.key} className="flex items-center justify-between gap-4 py-1.5">
                    <span className="min-w-0 truncate text-[13px] text-muted-foreground">
                      {change.label}
                    </span>
                    {change.secret ? (
                      <ToneBadge tone="warning">Changed</ToneBadge>
                    ) : (
                      <span className="flex min-w-0 items-center gap-2 text-[13px]">
                        <Mono>{change.from ?? "—"}</Mono>
                        <ArrowRight
                          className="h-3.5 w-3.5 shrink-0 text-faint"
                          strokeWidth={1.75}
                        />
                        <Mono>{change.to ?? "—"}</Mono>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

export function HistoryView() {
  const { canOperate } = useDashboardRole();
  const [history, reload] = useSystemResource(load);
  const [pair, setPair] = useState<{ from: number; to: number } | null>(null);
  const [restoring, setRestoring] = useState<Version | null>(null);
  const [check, setCheck] = useState<DashboardSystemCheck | null>(null);
  const [refused, setRefused] = useState<Version | null>(null);
  const [forcing, setForcing] = useState(false);

  const current = history?.current ?? 0;
  const versions = history?.versions ?? [];
  const previous = versions.find((entry) => entry.version < current)?.version;
  const from = pair?.from ?? previous ?? current;
  const to = pair?.to ?? current;

  const restore = useCallback(
    async (target: Version | null, code: string, force: boolean) => {
      if (!target) return;
      setCheck(null);
      setRefused(null);
      const result = await orpc.dashboard.system.revert({
        version: target.version,
        expectedVersion: current,
        code,
        force,
      });
      for (const warning of result.warnings) toast.warning(warning);
      if (result.saved) {
        toast.success(`Version ${target.version} restored as version ${result.version}`);
        setPair(null);
        await reload();
        return;
      }
      if (result.check) {
        setCheck(result.check);
        setRefused(target);
        toast.error("The check failed, so nothing was restored");
        return;
      }
      toast.message("That version matches the current one");
    },
    [current, reload],
  );

  if (!history) return <Loading />;

  if (versions.length === 0) {
    return (
      <Section
        title="No versions yet"
        description="Preflight stores the first version from the environment and its defaults."
      >
        <p className="text-[13px] text-muted-foreground">
          Run preflight, or save a section from any System page.
        </p>
      </Section>
    );
  }

  return (
    <Sections>
      {versions.length > 1 && (
        <DiffSection
          versions={versions}
          from={from}
          to={to}
          onFrom={(version) => setPair({ from: version, to })}
          onTo={(version) => setPair({ from, to: version })}
        />
      )}

      {check && (
        <Section
          title="Restore refused"
          description="A section's check failed against the restored values."
        >
          <CheckResults check={check} />
          {refused && (
            <div className="mt-3 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setForcing(true)}>
                Restore anyway
              </Button>
            </div>
          )}
        </Section>
      )}

      <Section
        title="Versions"
        description="Every stored version, newest first. Restoring copies a version forward; it never rewrites history."
      >
        <ScrollTable className="text-[13px]">
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Changed</TableHead>
              <TableHead>By</TableHead>
              <TableHead>When</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {versions.map((entry) => {
              const kind = KIND_BADGE[entry.kind];
              return (
                <TableRow key={entry.version}>
                  <TableCell className="tabular-nums">
                    {entry.version}
                    {entry.isCurrent && (
                      <span className="ml-2">
                        <ToneBadge tone="ok">Current</ToneBadge>
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <ToneBadge tone={kind.tone}>{kind.label}</ToneBadge>
                    {entry.revertedFromVersion !== null && (
                      <span className="ml-2 text-[11px] text-faint">
                        from {entry.revertedFromVersion}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground">
                    {entry.changedKeys.length === 0
                      ? "Nothing"
                      : entry.changedKeys.map(sectionLabel).join(", ")}
                  </TableCell>
                  <TableCell className="text-faint">{entry.author?.email ?? "Preflight"}</TableCell>
                  <TableCell className="text-faint">
                    {dateTime.format(new Date(entry.createdAt))}
                  </TableCell>
                  <TableCell className="text-right">
                    {!entry.isCurrent && (
                      <span className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPair({ from: entry.version, to: current })}
                        >
                          Compare
                        </Button>
                        {canOperate && (
                          <Button variant="outline" size="sm" onClick={() => setRestoring(entry)}>
                            <RotateCcw strokeWidth={1.75} />
                            Restore
                          </Button>
                        )}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </ScrollTable>
      </Section>

      <TotpConfirmDialog
        open={restoring !== null}
        title={`Restore version ${restoring?.version ?? ""}`}
        body="Every section that differs is checked against the real service first, then stored as a new version."
        confirmLabel="Restore"
        onOpenChange={(open) => {
          if (!open) setRestoring(null);
        }}
        onConfirm={(code) => restore(restoring, code, false)}
      />

      <TotpConfirmDialog
        open={forcing}
        title={`Restore version ${refused?.version ?? ""} anyway`}
        body="The check above failed. Restoring anyway stores this version as it is, so whatever failed the check may not work until it is fixed."
        confirmLabel="Restore anyway"
        onOpenChange={setForcing}
        onConfirm={(code) => restore(refused, code, true)}
      />
    </Sections>
  );
}
