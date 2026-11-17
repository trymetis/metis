"use client";

import { Button } from "@metis/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";

import { useDashboardRole } from "@/components/dashboard/dashboard-role";
import { DeleteThemeDialog } from "@/components/theme-builder/delete-theme-dialog";
import {
  type ThemeDraft,
  ThemeBuilderDialog,
} from "@/components/theme-builder/theme-builder-dialog";
import { ThemeCard } from "@/components/theme-builder/theme-preview";
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

function usage(n: number): string {
  if (n === 0) return "No workspace uses it";
  return n === 1 ? "Used by 1 workspace" : `Used by ${n} workspaces`;
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
  const [deleting, setDeleting] = useState<ListedTheme | null>(null);

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
  const system = themes.filter((t) => t.source === "system");
  const instance = themes.filter((t) => t.source === "instance");
  const first = themes[0];

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

  async function remove(): Promise<string | null> {
    if (!deleting) return null;
    try {
      await orpc.dashboard.themes.delete({ themeId: deleting.id });
      await refreshThemes();
      setDeleting(null);
      return null;
    } catch (err) {
      return errorMessage(err, "Could not delete the theme");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-medium text-foreground">Instance themes</h2>
            <p className="mt-0.5 text-[12px] text-faint">
              Workspace owners and admins can pick these in their workspace&rsquo;s settings.
              Editing one changes every workspace that uses it.
            </p>
          </div>
          {canOperate && (
            <Button size="sm" variant="outline" onClick={() => setEditing({ mode: "create" })}>
              <Plus data-icon="inline-start" />
              Create theme
            </Button>
          )}
        </div>
        {instance.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center text-[13px] text-faint">
            No instance themes yet.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {instance.map((theme) => (
              <ThemeCard
                key={theme.id}
                name={theme.name}
                palette={theme.palette}
                note={usage(theme.usedBy)}
                onEdit={canOperate ? () => setEditing({ mode: "edit", theme }) : undefined}
                onDelete={canOperate ? () => setDeleting(theme) : undefined}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-[13px] font-medium text-foreground">Built in</h2>
        <p className="mt-0.5 text-[12px] text-faint">
          Ship with Metis Suite and update with each release. Start a new theme from one of them.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {system.map((theme) => (
            <ThemeCard
              key={theme.id}
              name={theme.name}
              palette={theme.palette}
              note={usage(theme.usedBy)}
            />
          ))}
        </div>
      </section>

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
        name={deleting?.name ?? null}
        description={
          deleting && deleting.usedBy > 0
            ? `${usage(deleting.usedBy)}. Those workspaces switch to ${defaultSystemTheme().name}.`
            : "No workspace uses it."
        }
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </div>
  );
}
