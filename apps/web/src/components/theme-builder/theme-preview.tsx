"use client";

import { cn } from "@metis/ui/lib/utils";
import { Check, Pencil, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";

import { themeStyle } from "@/theme/css";
import type { ThemeMode, ThemePalette, ThemeTokens } from "@/theme/tokens";

export function useThemeMode(): ThemeMode {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "light" ? "light" : "dark";
}

export function ThemePreview({ tokens, className }: { tokens: ThemeTokens; className?: string }) {
  return (
    <div
      style={themeStyle(tokens)}
      className={cn("overflow-hidden rounded-lg border border-border bg-panel", className)}
    >
      <div className="flex items-center gap-1.5 border-border border-b bg-surface px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-(--red-dot)" />
        <span className="h-2 w-2 rounded-full bg-brand" />
        <span className="h-2 w-2 rounded-full bg-(--green-dot)" />
        <span className="ml-auto h-2 w-14 rounded-full bg-brand-soft" />
      </div>
      <div className="grid grid-cols-[72px_1fr] gap-3 p-3">
        <div className="space-y-2">
          <div className="h-5 rounded bg-brand" />
          <div className="h-3 rounded bg-hover" />
          <div className="h-3 rounded bg-hover" />
          <div className="h-3 rounded bg-brand-soft" />
        </div>
        <div className="space-y-2">
          <div className="h-10 rounded-md bg-brand-soft" />
          <div className="h-3 w-3/4 rounded bg-hover" />
          <div className="h-3 w-1/2 rounded bg-hover" />
          <div className="mt-3 h-1.5 rounded-full bg-brand" />
        </div>
      </div>
    </div>
  );
}

interface ThemeCardProps {
  name: string;
  palette: ThemePalette;
  selected?: boolean;
  disabled?: boolean;
  note?: string;
  onSelect?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function ThemeCard({
  name,
  palette,
  selected = false,
  disabled,
  note,
  onSelect,
  onEdit,
  onDelete,
}: ThemeCardProps) {
  const mode = useThemeMode();
  const body = (
    <>
      <ThemePreview tokens={palette[mode]} />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-foreground">{name}</span>
          {note && <span className="block truncate text-[11px] text-faint">{note}</span>}
        </span>
        {onSelect && (
          <span
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
              selected
                ? "border-primary bg-brand text-primary-foreground"
                : "border-border text-transparent group-hover:border-primary/60",
            )}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.2} />
          </span>
        )}
      </div>
    </>
  );

  return (
    <div
      className={cn(
        "relative rounded-xl border bg-surface transition-all",
        selected
          ? "border-primary shadow-[0_0_0_1px_var(--brand)]"
          : "border-border hover:border-primary/60",
      )}
    >
      {onSelect ? (
        <button
          type="button"
          aria-pressed={selected}
          aria-label={name}
          disabled={disabled}
          onClick={onSelect}
          className="group block w-full rounded-xl p-3 text-left disabled:pointer-events-none disabled:opacity-60"
        >
          {body}
        </button>
      ) : (
        <div className="p-3">{body}</div>
      )}
      {(onEdit || onDelete) && (
        <div className="absolute top-4 right-4 flex gap-1">
          {onEdit && (
            <button
              type="button"
              aria-label={`Edit ${name}`}
              onClick={onEdit}
              className="flex size-6 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground"
            >
              <Pencil className="size-3" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              aria-label={`Delete ${name}`}
              onClick={onDelete}
              className="flex size-6 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground hover:text-destructive-text"
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
