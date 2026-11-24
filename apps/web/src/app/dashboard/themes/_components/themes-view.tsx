"use client";

import { Button } from "@metis/ui/components/button";
import { Checkbox } from "@metis/ui/components/checkbox";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@metis/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { useDashboardRole } from "@/components/dashboard/dashboard-role";
import { ScrollTable } from "@/components/dashboard/scroll-table";
import { IconButton } from "@/components/icon-button";
import { DeleteThemeDialog } from "@/components/theme-builder/delete-theme-dialog";
import {
  type ThemeDraft,
  ThemeBuilderDialog,
} from "@/components/theme-builder/theme-builder-dialog";
import { ThemeSwatches } from "@/components/theme-builder/theme-preview";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQueries } from "@/lib/query-client";
import { defaultSystemTheme } from "@/theme/system";
import type { ThemePalette } from "@/theme/tokens";

interface ListedTheme {
  id: string;
  name: string;
  source: "system" | "instance" | "workspace";
  palette: ThemePalette;
  usedBy: number;
}

type Editing = { mode: "create" } | { mode: "edit"; theme: ListedTheme };

type Deleting = { kind: "one"; theme: ListedTheme } | { kind: "many"; themes: ListedTheme[] };

const SOURCE_LABEL: Record<ListedTheme["source"], string> = {
  system: "System",
  instance: "Instance",
  workspace: "Workspace",
};

function usage(n: number): string {
  if (n === 0) return "No workspace uses it";
  return n === 1 ? "Used by 1 workspace" : `Used by ${n} workspaces`;
}

function workspaces(n: number): string {
  if (n === 0) return "None";
  return n === 1 ? "1 workspace" : `${n} workspaces`;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function refreshThemes() {
  return refreshQueries(rpc.dashboard.themes.list.key());
}

export function ThemesView() {
  const { canOperate } = useDashboardRole();
  const query = useQuery(rpc.dashboard.themes.list.queryOptions());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  if (query.error) {
    return (
      <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-[13px] text-destructive-text">
        {query.error.message || "Could not load the themes"}
      </p>
    );
  }
  if (!query.data) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-faint">
        <Loader2 className="size-3.5 animate-spin" />
        Loading themes…
      </div>
    );
  }

  const themes = query.data.themes;
  const instance = themes.filter((t) => t.source === "instance");
  const ordered = [...instance, ...themes.filter((t) => t.source !== "instance")];
  const picked = instance.filter((t) => selected.has(t.id));
  const allPicked = instance.length > 0 && picked.length === instance.length;
  const first = themes[0];

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function save(draft: ThemeDraft): Promise<string | null> {
    try {
      await orpc.dashboard.themes.save({
        id: editing?.mode === "edit" ? editing.theme.id : undefined,
        name: draft.name,
        palette: draft.palette,
      });
      await refreshThemes();
      setEditing(null);
      return null;
    } catch (err) {
      return errorMessage(err, "Could not save the theme");
    }
  }

  const deletingThemes = deleting
    ? deleting.kind === "one"
      ? [deleting.theme]
      : deleting.themes
    : [];
  const deletingUse = deletingThemes.reduce((sum, t) => sum + t.usedBy, 0);

  async function remove(): Promise<string | null> {
    if (!deleting) return null;
    try {
      if (deleting.kind === "one") {
        await orpc.dashboard.themes.delete({ themeId: deleting.theme.id });
      } else {
        await orpc.dashboard.themes.deleteMany({ themeIds: deleting.themes.map((t) => t.id) });
      }
      await refreshThemes();
      const gone = new Set(deletingThemes.map((t) => t.id));
      setSelected((current) => new Set([...current].filter((id) => !gone.has(id))));
      setDeleting(null);
      return null;
    } catch (err) {
      return errorMessage(
        err,
        deleting.kind === "one" ? "Could not delete the theme" : "Could not delete the themes",
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <p className="text-[12px] text-faint">
          {picked.length > 0
            ? `${picked.length} selected`
            : "Workspace owners and admins pick a theme in their workspace\u2019s settings. Editing an instance theme changes every workspace that uses it."}
        </p>
        {canOperate && (
          <div className="flex shrink-0 items-center gap-2">
            {picked.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setDeleting(
                    picked.length === 1 && picked[0]
                      ? { kind: "one", theme: picked[0] }
                      : { kind: "many", themes: picked },
                  )
                }
              >
                <Trash2 data-icon="inline-start" />
                Delete
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setEditing({ mode: "create" })}>
              <Plus data-icon="inline-start" />
              Create theme
            </Button>
          </div>
        )}
      </div>

      <ScrollTable className="text-[13px]">
        <TableHeader>
          <TableRow>
            {canOperate && (
              <TableHead className="w-8">
                <Checkbox
                  aria-label="Select all instance themes"
                  title="Select all instance themes"
                  disabled={instance.length === 0}
                  checked={allPicked}
                  indeterminate={picked.length > 0 && !allPicked}
                  onCheckedChange={(on) =>
                    setSelected(new Set(on ? instance.map((t) => t.id) : []))
                  }
                />
              </TableHead>
            )}
            <TableHead className="w-28">Palette</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Used by</TableHead>
            {canOperate && <TableHead className="w-20" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordered.map((theme) => {
            const editable = canOperate && theme.source === "instance";
            return (
              <TableRow key={theme.id}>
                {canOperate && (
                  <TableCell>
                    {editable && (
                      <Checkbox
                        aria-label={`Select ${theme.name}`}
                        title={`Select ${theme.name}`}
                        checked={selected.has(theme.id)}
                        onCheckedChange={(on) => toggle(theme.id, on)}
                      />
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <ThemeSwatches palette={theme.palette} />
                </TableCell>
                <TableCell className="text-foreground">{theme.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {SOURCE_LABEL[theme.source]}
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {workspaces(theme.usedBy)}
                </TableCell>
                {canOperate && (
                  <TableCell>
                    {editable && (
                      <div className="flex justify-end gap-0.5">
                        <IconButton
                          label={`Edit ${theme.name}`}
                          onClick={() => setEditing({ mode: "edit", theme })}
                        >
                          <Pencil />
                        </IconButton>
                        <IconButton
                          label={`Delete ${theme.name}`}
                          onClick={() => setDeleting({ kind: "one", theme })}
                        >
                          <Trash2 />
                        </IconButton>
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </ScrollTable>

      {first && (
        <ThemeBuilderDialog
          open={editing !== null}
          onOpenChange={(open) => !open && setEditing(null)}
          title={editing?.mode === "edit" ? `Edit ${editing.theme.name}` : "Create a theme"}
          description="Every workspace on this instance can pick it."
          initial={
            editing?.mode === "edit"
              ? { name: editing.theme.name, palette: editing.theme.palette }
              : { name: "", palette: first.palette }
          }
          startFrom={themes.map(({ id, name, palette }) => ({ id, name, palette }))}
          saveLabel={editing?.mode === "edit" ? "Save theme" : "Create theme"}
          onSave={save}
        />
      )}

      <DeleteThemeDialog
        name={
          deleting
            ? deleting.kind === "one"
              ? deleting.theme.name
              : `${deleting.themes.length} themes`
            : null
        }
        description={
          deletingUse > 0
            ? `${deleting?.kind === "one" ? usage(deletingUse) : `Used by ${workspaces(deletingUse)} in all`}. Those workspaces switch to ${defaultSystemTheme().name}.`
            : deleting?.kind === "many"
              ? "No workspace uses them."
              : "No workspace uses it."
        }
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </div>
  );
}
