"use client";

import { Button } from "@metis/ui/components/button";
import { cn } from "@metis/ui/lib/utils";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { History, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { TotpConfirmDialog } from "@/components/totp-confirm-dialog";
import { useHydrated } from "@/hooks/use-stored-item";
import { isOneOf } from "@/lib/guards";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import type {
  DashboardConfigField,
  DashboardConfigReset,
  DashboardConfigState,
  DashboardConfigValue,
  DashboardSystemCheck,
} from "@/server/schema";
import { useUnsavedChangesStore } from "@/store/unsaved-changes-store";
import { CONFIG_SECTIONS, type ConfigSection } from "@/types/instance-config";

import { ConfigFieldRows, fieldDirty, type Secrets, type Values } from "./config-fields";
import { useDashboardRole } from "./dashboard-role";
import { GuardedLink } from "./guarded-link";
import { ResetSectionDialog } from "./reset-section-dialog";
import { CheckResults, Loading } from "./system-client";
import { SAVE_BAR_SLOT_ID, SYSTEM_HISTORY_HREF } from "./system-nav";
import { Section } from "./system-ui";

interface EntryDraft {
  key: string;
  id: string | null;
  values: Values;
  secrets: Secrets;
}

interface SectionDraft {
  section: ConfigSection;
  label: string;
  list: boolean;
  fields: DashboardConfigField[];
  values: Values;
  secrets: Secrets;
  blank: Values;
  matchesEnvironment: boolean;
  entries: EntryDraft[];
}

export interface ConfigCard {
  title?: string;
  description?: string;
  badge?: React.ReactNode;
  children?: React.ReactNode;
  renderEntryBadge?: (values: Values | null) => React.ReactNode;
}

const TOTP_ERRORS = new Set(["UNAUTHORIZED", "TOO_MANY_REQUESTS"]);

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function setValue(values: Values, key: string, value: DashboardConfigValue | undefined): Values {
  const next = { ...values };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

function countFields(fields: DashboardConfigField[], values: Values, initial: Values): number {
  return fields.filter((field) => fieldDirty(field, values[field.key], initial[field.key])).length;
}

function countChanges(draft: SectionDraft, initial: SectionDraft | undefined): number {
  if (!initial) return 0;
  if (!draft.list) {
    return countFields(draft.fields, draft.values, initial.values);
  }
  const before = new Map(initial.entries.map((entry) => [entry.key, entry]));
  const kept = new Set(draft.entries.map((entry) => entry.key));
  const removed = initial.entries.filter((entry) => !kept.has(entry.key));
  return (
    removed.length +
    draft.entries.reduce((total, entry) => {
      const previous = before.get(entry.key);
      if (!previous) return total + 1;
      return total + countFields(draft.fields, entry.values, previous.values);
    }, 0)
  );
}

async function loadDrafts(sections: ConfigSection[]) {
  const forms = await Promise.all(
    sections.map((section) => orpc.dashboard.system.form({ section })),
  );
  return {
    version: forms[0]?.version ?? 0,
    drafts: forms.map((form): SectionDraft => ({
      section: form.state.section,
      label: form.state.label,
      list: form.list,
      fields: form.fields,
      values: form.values,
      secrets: form.secrets,
      blank: form.blank,
      matchesEnvironment: form.matchesEnvironment,
      entries: form.entries.map((entry) => ({
        key: entry.id,
        id: entry.id,
        values: entry.values,
        secrets: entry.secrets,
      })),
    })),
  };
}

const SHAKE: Keyframe[] = [
  { transform: "translateX(0)" },
  { transform: "translateX(-10px)" },
  { transform: "translateX(10px)" },
  { transform: "translateX(-6px)" },
  { transform: "translateX(6px)" },
  { transform: "translateX(0)" },
];

function SaveBar({
  changes,
  error,
  onReset,
  onSave,
}: {
  changes: number;
  error: string | null;
  onReset: () => void;
  onSave: () => void;
}) {
  const nudges = useUnsavedChangesStore((state) => state.nudges);
  const seen = useRef(nudges);
  const bar = useRef<HTMLDivElement>(null);
  const [warning, setWarning] = useState(false);

  useEffect(() => {
    if (nudges === seen.current) return;
    seen.current = nudges;
    setWarning(true);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) bar.current?.animate(SHAKE, { duration: 400 });
    const timer = window.setTimeout(() => setWarning(false), 2000);
    return () => window.clearTimeout(timer);
  }, [nudges]);

  return (
    <div className="pt-2">
      <div
        ref={bar}
        role="status"
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border bg-popover px-4 py-2.5 shadow-lg transition-colors",
          warning ? "border-destructive" : "border-border",
        )}
      >
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-[13px] font-medium",
              warning ? "text-destructive-text" : "text-foreground",
            )}
          >
            {warning
              ? "Careful — you have unsaved changes!"
              : `${changes} unsaved ${changes === 1 ? "change" : "changes"}`}
          </p>
          {error && <p className="truncate text-[11px] text-destructive-text">{error}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={onReset}>
          Reset
        </Button>
        <Button size="sm" onClick={onSave}>
          Save changes
        </Button>
      </div>
    </div>
  );
}

const NO_CARDS: Partial<Record<ConfigSection, ConfigCard>> = {};

export function ConfigForm({
  config,
  cards = NO_CARDS,
  onSaved,
}: {
  config: DashboardConfigState;
  cards?: Partial<Record<ConfigSection, ConfigCard>>;
  onSaved: () => void;
}) {
  const sectionKey = config.sections.map((state) => state.section).join(",");
  const sections = useMemo(
    () => sectionKey.split(",").filter((key) => isOneOf(CONFIG_SECTIONS, key)),
    [sectionKey],
  );
  const draftsOptions = queryOptions({
    queryKey: [...rpc.dashboard.system.form.key(), "drafts", sectionKey],
    queryFn: () => loadDrafts(sections),
  });
  const query = useQuery(draftsOptions);
  const version = query.data?.version ?? 0;
  const initial = query.data?.drafts ?? null;
  const [drafts, setDrafts] = useState<SectionDraft[] | null>(null);
  const [syncedFrom, setSyncedFrom] = useState<typeof query.data>(undefined);
  if (query.data && syncedFrom !== query.data) {
    setSyncedFrom(query.data);
    setDrafts(query.data.drafts);
  }
  const [confirming, setConfirming] = useState(false);
  const [forcing, setForcing] = useState(false);
  const [check, setCheck] = useState<DashboardSystemCheck | null>(null);
  const [checkedReset, setCheckedReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState<{
    section: ConfigSection;
    label: string;
    view: DashboardConfigReset;
  } | null>(null);
  const [opening, setOpening] = useState<ConfigSection | null>(null);
  const { canOperate } = useDashboardRole();
  const hydrated = useHydrated();
  const slot = hydrated ? document.getElementById(SAVE_BAR_SLOT_ID) : null;
  const added = useRef(0);
  const setDirty = useUnsavedChangesStore((state) => state.setDirty);

  const loadError = query.error;
  useEffect(() => {
    if (loadError) toast.error(errorMessage(loadError, "Could not load the configuration"));
  }, [loadError]);

  async function load() {
    const result = await refreshQuery(draftsOptions.queryKey);
    if (result?.data) setDrafts(result.data.drafts);
  }

  const changes = useMemo(() => {
    if (!drafts || !initial) return 0;
    return drafts.reduce((total, draft, index) => total + countChanges(draft, initial[index]), 0);
  }, [drafts, initial]);
  const dirty = changes > 0;

  useEffect(() => {
    setDirty(dirty);
  }, [dirty, setDirty]);

  useEffect(() => () => setDirty(false), [setDirty]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update(section: ConfigSection, change: (draft: SectionDraft) => SectionDraft) {
    setDrafts((current) =>
      current
        ? current.map((draft) => (draft.section === section ? change(draft) : draft))
        : current,
    );
  }

  function reset() {
    setDrafts(initial);
    setError(null);
    setCheck(null);
  }

  async function openReset(draft: SectionDraft) {
    setCheck(null);
    setOpening(draft.section);
    try {
      const view = await orpc.dashboard.system.reset({
        section: draft.section,
        expectedVersion: version,
      });
      setResetting({ section: draft.section, label: draft.label, view });
    } catch (err) {
      toast.error(errorMessage(err, "Could not load the environment values"));
    } finally {
      setOpening(null);
    }
  }

  async function confirmReset(code: string, force: boolean) {
    if (!resetting) return;
    const result = await orpc.dashboard.system.reset({
      section: resetting.section,
      expectedVersion: version,
      code,
      force,
    });
    for (const warning of result.warnings) toast.warning(warning);
    if (result.updated) {
      toast.success(`${resetting.label} reset to environment as version ${result.version}`);
      await load();
      onSaved();
      return;
    }
    if (result.check) {
      setCheck(result.check);
      setCheckedReset(true);
      return;
    }
    toast.message("Nothing changed");
    await load();
  }

  async function save(code: string, force = false) {
    if (!drafts || !initial) return;
    setError(null);
    setCheck(null);
    setCheckedReset(false);
    const changed = drafts.filter((draft, index) => countChanges(draft, initial[index]) > 0);
    try {
      const result = await orpc.dashboard.system.update({
        expectedVersion: version,
        sections: changed.map((draft) => ({
          section: draft.section,
          values: draft.values,
          entries: draft.list
            ? draft.entries.map((entry) => ({
                id: entry.id,
                values: entry.values,
              }))
            : null,
        })),
        code,
        force,
      });
      for (const warning of result.warnings) toast.warning(warning);
      if (result.saved) {
        toast.success(`Saved as version ${result.version}`);
        await load();
        onSaved();
        return;
      }
      if (result.check) {
        setCheck(result.check);
        setError("The check failed, so nothing was saved.");
        return;
      }
      toast.message("Nothing changed");
      await load();
    } catch (err) {
      const errorCode =
        typeof err === "object" && err !== null && "code" in err ? err.code : undefined;
      if (typeof errorCode === "string" && TOTP_ERRORS.has(errorCode)) {
        throw err;
      }
      setError(errorMessage(err, "Could not save"));
    }
  }

  if (!drafts || !initial) return <Loading />;

  return (
    <>
      <div className="flex items-center justify-between gap-4 px-1 pt-2">
        <p className="text-[11px] text-faint">
          {version > 0
            ? `Configuration version ${version}. Every process picks up a change within 30 seconds.`
            : "Not stored yet: running on the defaults until preflight seeds it or the first save."}
        </p>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<GuardedLink href={SYSTEM_HISTORY_HREF} />}
        >
          <History strokeWidth={1.75} />
          History
        </Button>
      </div>

      {check && (
        <Section
          title="Check failed"
          description={
            checkedReset
              ? "Nothing was reset. The environment values failed this check."
              : "Nothing was saved. Fix the fields below and save again, or save anyway."
          }
        >
          <CheckResults check={check} />
          {!checkedReset && (
            <div className="mt-3 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setForcing(true)}>
                Save anyway
              </Button>
            </div>
          )}
        </Section>
      )}

      {drafts.map((draft, index) => {
        const before = initial[index];
        if (!before) return null;
        const card = cards[draft.section] ?? {};
        const previous = new Map(before.entries.map((entry) => [entry.key, entry]));
        return (
          <Section
            key={draft.section}
            title={card.title ?? draft.label}
            description={card.description}
            badge={card.badge}
          >
            {draft.list ? (
              <div className="flex flex-col gap-2">
                {draft.entries.length === 0 && (
                  <p className="py-1 text-[13px] text-faint">No servers.</p>
                )}
                {draft.entries.map((entry, position) => {
                  const original = previous.get(entry.key);
                  const name =
                    typeof entry.values.name === "string" && entry.values.name
                      ? entry.values.name
                      : `Server ${position + 1}`;
                  return (
                    <div key={entry.key} className="rounded-lg border border-border px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-foreground">
                          <span className="truncate">{name}</span>
                          {!original && (
                            <span className="text-[11px] font-normal text-brand-text">new</span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {card.renderEntryBadge?.(original?.values ?? null)}
                          {canOperate && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove ${name}`}
                              onClick={() =>
                                update(draft.section, (current) => ({
                                  ...current,
                                  entries: current.entries.filter((item) => item.key !== entry.key),
                                }))
                              }
                            >
                              <Trash2 strokeWidth={1.75} />
                            </Button>
                          )}
                        </span>
                      </div>
                      <fieldset disabled={!canOperate} className="min-w-0">
                        <ConfigFieldRows
                          idPrefix={`${draft.section}-${entry.key}`}
                          fields={draft.fields}
                          values={entry.values}
                          initial={original?.values ?? {}}
                          secrets={entry.secrets}
                          onChange={(key, value) =>
                            update(draft.section, (current) => ({
                              ...current,
                              entries: current.entries.map((item) =>
                                item.key === entry.key
                                  ? {
                                      ...item,
                                      values: setValue(item.values, key, value),
                                    }
                                  : item,
                              ),
                            }))
                          }
                        />
                      </fieldset>
                    </div>
                  );
                })}
                {canOperate && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => {
                      added.current += 1;
                      const key = `new-${added.current}`;
                      update(draft.section, (current) => ({
                        ...current,
                        entries: [
                          ...current.entries,
                          { key, id: null, values: current.blank, secrets: {} },
                        ],
                      }));
                    }}
                  >
                    <Plus strokeWidth={1.75} />
                    Add server
                  </Button>
                )}
              </div>
            ) : (
              <fieldset disabled={!canOperate} className="min-w-0">
                <ConfigFieldRows
                  idPrefix={draft.section}
                  fields={draft.fields}
                  values={draft.values}
                  initial={before.values}
                  secrets={draft.secrets}
                  onChange={(key, value) =>
                    update(draft.section, (current) => ({
                      ...current,
                      values: setValue(current.values, key, value),
                    }))
                  }
                />
              </fieldset>
            )}
            {card.children}
            {canOperate && (
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={dirty || draft.matchesEnvironment || opening !== null}
                  onClick={() => openReset(draft)}
                >
                  <RotateCcw strokeWidth={1.75} />
                  Reset to environment
                </Button>
              </div>
            )}
          </Section>
        );
      })}

      {dirty &&
        slot &&
        createPortal(
          <SaveBar
            changes={changes}
            error={error}
            onReset={reset}
            onSave={() => setConfirming(true)}
          />,
          slot,
        )}

      <TotpConfirmDialog
        open={confirming}
        title="Save changes"
        body="Enter your authenticator code to change the instance configuration."
        confirmLabel="Save"
        onOpenChange={setConfirming}
        onConfirm={(code) => save(code)}
      />

      <TotpConfirmDialog
        open={forcing}
        title="Save anyway"
        body="The check above failed. Saving anyway stores these changes as they are, so whatever failed the check may not work until it is fixed."
        confirmLabel="Save anyway"
        onOpenChange={setForcing}
        onConfirm={(code) => save(code, true)}
      />

      <ResetSectionDialog
        label={resetting?.label ?? ""}
        view={resetting?.view ?? null}
        onOpenChange={(open) => {
          if (!open) setResetting(null);
        }}
        onConfirm={confirmReset}
      />
    </>
  );
}
