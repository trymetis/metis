"use client";

import { Button } from "@metis/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DeleteThemeDialog } from "@/components/theme-builder/delete-theme-dialog";
import {
  type ThemeDraft,
  ThemeBuilderDialog,
} from "@/components/theme-builder/theme-builder-dialog";
import { ThemeCard } from "@/components/theme-builder/theme-preview";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQueries } from "@/lib/query-client";
import { defaultSystemTheme } from "@/theme/system";
import type { ThemePalette } from "@/theme/tokens";

type ThemeSource = "system" | "instance" | "workspace";

interface ListedTheme {
  id: string;
  name: string;
  source: ThemeSource;
  palette: ThemePalette;
}

const GROUPS: { source: ThemeSource; title: string }[] = [
  { source: "system", title: "Built in" },
  { source: "instance", title: "From your instance" },
  { source: "workspace", title: "Custom" },
];

type Editing = { mode: "create" } | { mode: "edit"; theme: ListedTheme };

function refreshThemes() {
  return refreshQueries(rpc.workspaceThemes.list.key());
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function ThemeSection() {
  const router = useRouter();
  const scope = useWorkspaceScope();
  const query = useQuery(rpc.workspaceThemes.list.queryOptions({ input: scope }));
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<ListedTheme | null>(null);

  if (!query.data) {
    return (
      <div className="mt-6 flex items-center gap-2 text-[13px] text-faint">
        <Loader2 className="size-3.5 animate-spin" />
        Loading themes…
      </div>
    );
  }

  const { themes, selectedId, canEdit } = query.data;
  const selected = themes.find((t) => t.id === selectedId) ?? themes[0];
  if (!selected) return null;

  async function select(themeId: string) {
    if (!canEdit || themeId === selectedId || saving) return;
    setSaving(themeId);
    setError(null);
    try {
      await orpc.workspaceThemes.select({ ...scope, themeId });
      await refreshThemes();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not change the theme"));
    } finally {
      setSaving(null);
    }
  }

  async function save(draft: ThemeDraft): Promise<string | null> {
    try {
      await orpc.workspaceThemes.save({
        ...scope,
        id: editing?.mode === "edit" ? editing.theme.id : undefined,
        name: draft.name,
        palette: draft.palette,
        select: editing?.mode === "create",
      });
      await refreshThemes();
      setEditing(null);
      router.refresh();
      return null;
    } catch (err) {
      return errorMessage(err, "Could not save the theme");
    }
  }

  async function remove(): Promise<string | null> {
    if (!deleting) return null;
    try {
      await orpc.workspaceThemes.delete({ ...scope, themeId: deleting.id });
      await refreshThemes();
      setDeleting(null);
      router.refresh();
      return null;
    } catch (err) {
      return errorMessage(err, "Could not delete the theme");
    }
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-medium text-foreground">Theme</h3>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setEditing({ mode: "create" })}>
            <Plus data-icon="inline-start" />
            Create theme
          </Button>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-[13px] text-destructive-text">
          {error}
        </div>
      )}

      {GROUPS.map(({ source, title }) => {
        const group = themes.filter((t) => t.source === source);
        if (group.length === 0) return null;
        return (
          <div key={source} className="mt-4">
            <h4 className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
              {title}
            </h4>
            <div className="mt-2 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {group.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  name={theme.name}
                  palette={theme.palette}
                  selected={theme.id === selectedId}
                  disabled={saving !== null || !canEdit}
                  onSelect={() => void select(theme.id)}
                  onEdit={
                    canEdit && source === "workspace"
                      ? () => setEditing({ mode: "edit", theme })
                      : undefined
                  }
                  onDelete={
                    canEdit && source === "workspace" ? () => setDeleting(theme) : undefined
                  }
                />
              ))}
            </div>
          </div>
        );
      })}

      <ThemeBuilderDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing?.mode === "edit" ? `Edit ${editing.theme.name}` : "Create a theme"}
        description="Everyone in this workspace sees the theme it uses."
        initial={
          editing?.mode === "edit"
            ? { name: editing.theme.name, palette: editing.theme.palette }
            : { name: "", palette: selected.palette }
        }
        startFrom={themes.map(({ id, name, palette }) => ({ id, name, palette }))}
        saveLabel={editing?.mode === "edit" ? "Save theme" : "Create and use"}
        onSave={save}
      />

      <DeleteThemeDialog
        name={deleting?.name ?? null}
        description={
          deleting?.id === selectedId
            ? `This workspace uses it now, so it switches to ${defaultSystemTheme().name}.`
            : "It is removed from this workspace's custom themes."
        }
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </div>
  );
}
