"use client";

import { Checkbox } from "@metis/ui/components/checkbox";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

import { TotpConfirmDialog } from "@/components/totp-confirm-dialog";
import type { DashboardConfigReset, DashboardConfigValue, DashboardSecret } from "@/server/schema";

import { Mono, ToneBadge } from "./system-ui";

type Side = DashboardConfigReset["current"];

interface FlatField {
  label: string;
  secret: boolean;
  set: boolean;
  value: string | null;
}

interface Change {
  key: string;
  label: string;
  secret: boolean;
  from: string | null;
  to: string | null;
}

function shown(value: DashboardConfigValue | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function flatten(view: DashboardConfigReset, side: Side): Map<string, FlatField> {
  const out = new Map<string, FlatField>();
  const add = (
    values: Record<string, DashboardConfigValue>,
    secrets: Record<string, DashboardSecret>,
    prefix: string,
    labelPrefix: string,
  ) => {
    for (const field of view.fields) {
      const secret = field.kind === "secret";
      out.set(`${prefix}${field.key}`, {
        label: `${labelPrefix}${field.label}`,
        secret,
        set: secret ? (secrets[field.key]?.set ?? false) : false,
        value: secret ? null : shown(values[field.key]),
      });
    }
  };
  if (!view.list) {
    add(side.values, side.secrets, "", "");
    return out;
  }
  for (const entry of side.entries) {
    const name = typeof entry.values.name === "string" ? entry.values.name : entry.id;
    add(entry.values, entry.secrets, `${entry.id}.`, `${name} · `);
  }
  return out;
}

function sectionChanges(view: DashboardConfigReset): Change[] {
  const before = flatten(view, view.current);
  const after = flatten(view, view.environment);
  const secrets = new Set(view.changedSecrets);
  const keys = [...new Set([...before.keys(), ...after.keys()])];
  return keys.flatMap((key): Change[] => {
    const a = before.get(key);
    const b = after.get(key);
    // oxlint-disable-next-line typescript/no-non-null-assertion --the key came from one of the maps
    const meta = (b ?? a)!;
    if (meta.secret) {
      const changed = a && b ? secrets.has(key) : (a ?? b)?.set === true;
      return changed ? [{ key, label: meta.label, secret: true, from: null, to: null }] : [];
    }
    const from = a?.value ?? null;
    const to = b?.value ?? null;
    return from === to ? [] : [{ key, label: meta.label, secret: false, from, to }];
  });
}

export function ResetSectionDialog({
  label,
  view,
  onOpenChange,
  onConfirm,
}: {
  label: string;
  view: DashboardConfigReset | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (code: string, force: boolean) => Promise<void>;
}) {
  const [force, setForce] = useState(false);
  const changes = view ? sectionChanges(view) : [];
  const inUse = view?.inUse ?? [];

  return (
    <TotpConfirmDialog
      open={view !== null}
      title={`Reset ${label} to environment`}
      body="Replace this section's settings with the values from the environment and config file?"
      confirmLabel="Reset"
      confirmDisabled={inUse.length > 0 && !force}
      onOpenChange={(open) => {
        if (!open) setForce(false);
        onOpenChange(open);
      }}
      onConfirm={(code) => onConfirm(code, force)}
    >
      <div className="flex flex-col gap-3 text-left">
        {view?.warnings.map((warning) => (
          <p key={warning} className="text-[12px] text-brand-text">
            {warning}
          </p>
        ))}

        {inUse.length > 0 && (
          <div className="rounded-lg border border-destructive/40 px-3 py-2.5">
            <p className="text-[12px] font-medium text-destructive-text">
              These connections would be quarantined:
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {inUse.map((entry) => (
                <li
                  key={`${entry.provider}:${entry.server ?? ""}`}
                  className="flex items-center justify-between gap-3 text-[13px]"
                >
                  <span className="min-w-0 truncate text-foreground">
                    {entry.server ? `${entry.label} · ${entry.server}` : entry.label}
                  </span>
                  <span className="shrink-0 text-faint">
                    {entry.connections} {entry.connections === 1 ? "connection" : "connections"}
                  </span>
                </li>
              ))}
            </ul>
            <label className="mt-2.5 flex cursor-pointer items-center gap-2.5">
              <Checkbox checked={force} onCheckedChange={(checked) => setForce(checked)} />
              <span className="text-[13px] text-foreground">
                Reset anyway and quarantine these connections
              </span>
            </label>
          </div>
        )}

        <div className="max-h-64 divide-y divide-border overflow-y-auto">
          {changes.map((change) => (
            <div key={change.key} className="flex items-center justify-between gap-4 py-1.5">
              <span className="min-w-0 truncate text-[13px] text-muted-foreground">
                {change.label}
              </span>
              {change.secret ? (
                <ToneBadge tone="warning">Changed</ToneBadge>
              ) : (
                <span className="flex min-w-0 items-center gap-2 text-[13px]">
                  <Mono>{change.from ?? "—"}</Mono>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-faint" strokeWidth={1.75} />
                  <Mono>{change.to ?? "—"}</Mono>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </TotpConfirmDialog>
  );
}
