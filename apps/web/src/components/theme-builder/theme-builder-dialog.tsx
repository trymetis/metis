"use client";

import { Button } from "@metis/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@metis/ui/components/dialog";
import { Input } from "@metis/ui/components/input";
import { cn } from "@metis/ui/lib/utils";
import { ChevronDown, Loader2, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { parseColor, toHex } from "@/theme/color";
import { contrastIssues, generatePalette } from "@/theme/generate";
import {
  isThemeColor,
  normalizeThemeColor,
  THEME_MODES,
  THEME_NAME_MAX,
  THEME_TINTS,
  THEME_TOKENS,
  type ThemeMode,
  type ThemePalette,
  type ThemeTint,
  type ThemeToken,
} from "@/theme/tokens";

import { ThemePreview } from "./theme-preview";

const TOKEN_LABELS: Record<ThemeToken, string> = {
  "bg-base": "Page background",
  "bg-panel": "Panels",
  "bg-surface": "Cards and inputs",
  "bg-hover": "Hover",
  "bg-active": "Pressed",
  "bg-selected": "Selected",
  border: "Borders",
  "border-soft": "Soft borders",
  "text-primary": "Text",
  "text-secondary": "Secondary text",
  "text-muted": "Muted text",
  "text-faint": "Faint text",
  brand: "Accent",
  "brand-text": "Accent text",
  "brand-on-tint": "Accent text on a tint",
  "brand-mark": "Logo mark",
  "brand-soft": "Accent tint",
  "brand-glow": "Accent glow",
};

const TINT_LABELS: Record<ThemeTint, string> = {
  none: "None",
  light: "Light",
  strong: "Strong",
};

const MODE_LABELS: Record<ThemeMode, string> = { light: "Light", dark: "Dark" };

export interface ThemeDraft {
  name: string;
  palette: ThemePalette;
}

export interface ThemeStart {
  id: string;
  name: string;
  palette: ThemePalette;
}

function accentOf(palette: ThemePalette): string {
  const parsed = parseColor(palette.light.brand);
  return parsed ? toHex(parsed) : "#b07d1f";
}

function sectionLabel(text: string) {
  return (
    <span className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">{text}</span>
  );
}

interface ThemeBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  initial: ThemeDraft;
  startFrom: ThemeStart[];
  saveLabel: string;
  onSave: (draft: ThemeDraft) => Promise<string | null>;
}

export function ThemeBuilderDialog({
  open,
  onOpenChange,
  title,
  description,
  initial,
  startFrom,
  saveLabel,
  onSave,
}: ThemeBuilderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {open && (
          <ThemeBuilder
            initial={initial}
            startFrom={startFrom}
            saveLabel={saveLabel}
            onSave={onSave}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ThemeBuilder({
  initial,
  startFrom,
  saveLabel,
  onSave,
  onCancel,
}: {
  initial: ThemeDraft;
  startFrom: ThemeStart[];
  saveLabel: string;
  onSave: (draft: ThemeDraft) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [palette, setPalette] = useState<ThemePalette>(initial.palette);
  const [accent, setAccent] = useState(() => accentOf(initial.palette));
  const [tint, setTint] = useState<ThemeTint>("light");
  const [advanced, setAdvanced] = useState(false);
  const [editMode, setEditMode] = useState<ThemeMode>("light");
  const [drafts, setDrafts] = useState<Partial<Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const issues = useMemo(() => contrastIssues(palette), [palette]);

  function regenerate(next: { accent?: string; tint?: ThemeTint }) {
    const nextAccent = next.accent ?? accent;
    const nextTint = next.tint ?? tint;
    setAccent(nextAccent);
    setTint(nextTint);
    setPalette(generatePalette({ accent: nextAccent, tint: nextTint }));
    setDrafts({});
  }

  function startWith(id: string) {
    const start = startFrom.find((t) => t.id === id);
    if (!start) return;
    setPalette(start.palette);
    setAccent(accentOf(start.palette));
    setDrafts({});
  }

  function editToken(mode: ThemeMode, token: ThemeToken, raw: string) {
    const key = `${mode}:${token}`;
    setDrafts((d) => ({ ...d, [key]: raw }));
    const value = normalizeThemeColor(raw);
    if (!isThemeColor(value)) return;
    setPalette((p) => ({ ...p, [mode]: { ...p[mode], [token]: value } }));
  }

  const invalidTokens = Object.entries(drafts).filter(
    ([, raw]) => raw !== undefined && !isThemeColor(normalizeThemeColor(raw)),
  );
  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0 && invalidTokens.length === 0 && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const failure = await onSave({ name: trimmedName, palette });
    setBusy(false);
    if (failure) setError(failure);
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          {sectionLabel("Name")}
          <Input
            value={name}
            maxLength={THEME_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            placeholder="Theme name"
            className="text-[13px]"
          />
        </label>
        {startFrom.length > 0 && (
          <label className="flex flex-col gap-1.5">
            {sectionLabel("Start from")}
            <select
              defaultValue=""
              onChange={(e) => startWith(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-[13px] text-foreground"
            >
              <option value="" disabled>
                Pick a theme to copy
              </option>
              {startFrom.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          {sectionLabel("Accent color")}
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Accent color"
              value={accent}
              onChange={(e) => regenerate({ accent: e.target.value })}
              className="h-8 w-10 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
            />
            <span className="font-mono text-[12px] text-muted-foreground">{accent}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          {sectionLabel("Background tint")}
          <div className="flex gap-1" role="radiogroup" aria-label="Background tint">
            {THEME_TINTS.map((t) => (
              <Button
                key={t}
                type="button"
                size="sm"
                role="radio"
                aria-checked={tint === t}
                variant={tint === t ? "secondary" : "ghost"}
                onClick={() => regenerate({ tint: t })}
              >
                {TINT_LABELS[t]}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <p className="-mt-3 text-[12px] text-faint">
        Changing the accent or the tint generates both palettes again and replaces any color you set
        by hand.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {THEME_MODES.map((mode) => (
          <div key={mode} className="flex flex-col gap-1.5">
            {sectionLabel(`${MODE_LABELS[mode]} mode`)}
            <ThemePreview tokens={palette[mode]} />
          </div>
        ))}
      </div>

      {issues.length > 0 && (
        <div className="rounded-lg border border-border bg-panel px-3 py-2 text-[12px] text-muted-foreground">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <TriangleAlert className="size-3.5" />
            Some text may be hard to read
          </div>
          <ul className="mt-1 space-y-0.5">
            {issues.map((issue) => (
              <li key={`${issue.mode}-${issue.label}`}>
                {MODE_LABELS[issue.mode]} mode: {issue.label} has a contrast of {issue.ratio}:1 (aim
                for {issue.min}:1)
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <button
          type="button"
          aria-expanded={advanced}
          onClick={() => setAdvanced((a) => !a)}
          className="flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", !advanced && "-rotate-90")} />
          Advanced: set each color
        </button>
        {advanced && (
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex gap-1" role="tablist" aria-label="Mode">
              {THEME_MODES.map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  role="tab"
                  aria-selected={editMode === mode}
                  variant={editMode === mode ? "secondary" : "ghost"}
                  onClick={() => setEditMode(mode)}
                >
                  {MODE_LABELS[mode]}
                </Button>
              ))}
            </div>
            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {THEME_TOKENS.map((token) => {
                const key = `${editMode}:${token}`;
                const raw = drafts[key] ?? palette[editMode][token];
                const invalid = !isThemeColor(normalizeThemeColor(raw));
                return (
                  <label key={key} className="flex items-center gap-2">
                    <span
                      className="size-5 shrink-0 rounded border border-border"
                      style={{ background: palette[editMode][token] }}
                    />
                    <span className="w-36 shrink-0 truncate text-[12px] text-muted-foreground">
                      {TOKEN_LABELS[token]}
                    </span>
                    <Input
                      value={raw}
                      aria-label={`${MODE_LABELS[editMode]} ${TOKEN_LABELS[token]}`}
                      aria-invalid={invalid}
                      onChange={(e) => editToken(editMode, token, e.target.value)}
                      className="h-7 font-mono text-[12px]"
                    />
                  </label>
                );
              })}
            </div>
            {invalidTokens.length > 0 && (
              <p className="text-[12px] text-destructive-text">
                Use a color like #1a2b3c or rgba(26, 43, 60, 0.5).
              </p>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-[12px] text-destructive-text">{error}</p>}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSave}>
          {busy && <Loader2 data-icon="inline-start" className="animate-spin" />}
          {saveLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
