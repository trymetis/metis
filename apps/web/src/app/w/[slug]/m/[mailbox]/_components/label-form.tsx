"use client";

import { cn } from "@metis/ui/lib/utils";
import { Check, Pipette } from "lucide-react";
import { useState } from "react";

import { customLabelMark } from "@/mail/label-meta";
import { contrastRatio } from "@/theme/color";
import {
  CUSTOM_LABEL_COLORS,
  HEX_COLOR_PATTERN,
  isLabelColor,
  type LabelColor,
} from "@/types/mail";

const DEFAULT_CUSTOM = "#6d28d9";

const DARK_CHECK_PRESETS = new Set<string>(["amber", "yellow", "gray"]);

function checkClass(color: string): string {
  if (!color.startsWith("#")) return DARK_CHECK_PRESETS.has(color) ? "text-black" : "text-white";
  const white = contrastRatio("#ffffff", color) ?? 0;
  const black = contrastRatio("#000000", color) ?? 0;
  return white >= black ? "text-white" : "text-black";
}

export function LabelForm({
  initialName = "",
  initialColor = CUSTOM_LABEL_COLORS[0],
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialName?: string;
  initialColor?: LabelColor;
  submitLabel: string;
  onSubmit: (label: { name: string; color: LabelColor }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<LabelColor>(initialColor);
  const [hex, setHex] = useState(
    HEX_COLOR_PATTERN.test(initialColor) ? initialColor : DEFAULT_CUSTOM,
  );
  const [busy, setBusy] = useState(false);
  const isCustom = !CUSTOM_LABEL_COLORS.some((c) => c === color);

  function pickHex(value: string) {
    const next = value.trim().toLowerCase();
    setHex(next);
    if (isLabelColor(next)) setColor(next);
  }

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), color });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-border bg-surface p-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Label name"
        aria-label="Label name"
        maxLength={40}
        autoFocus
        className="w-full rounded border border-border bg-panel px-2 py-1 text-[12px] text-foreground outline-none"
      />
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Label color">
        {CUSTOM_LABEL_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={color === c}
            aria-label={c}
            onClick={() => setColor(c)}
            className="flex size-5 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            style={{ background: customLabelMark(c) }}
          >
            {color === c && <Check className={cn("size-3", checkClass(c))} strokeWidth={3} />}
          </button>
        ))}
        <label
          className="relative flex size-5 cursor-pointer items-center justify-center rounded-full has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-surface"
          style={{
            background: isCustom
              ? color
              : "conic-gradient(#ef4444, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)",
          }}
          title="Custom color"
        >
          {isCustom ? (
            <Check className={cn("size-3", checkClass(color))} strokeWidth={3} />
          ) : (
            <Pipette className="size-2.5 text-white drop-shadow" />
          )}
          <input
            type="color"
            aria-label="Custom color"
            value={hex}
            onChange={(e) => pickHex(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
      {isCustom && (
        <input
          value={hex}
          onChange={(e) => pickHex(e.target.value)}
          aria-label="Hex color"
          placeholder="#rrggbb"
          maxLength={7}
          className={cn(
            "w-full rounded border bg-panel px-2 py-1 font-mono text-[12px] text-foreground outline-none",
            HEX_COLOR_PATTERN.test(hex) ? "border-border" : "border-destructive",
          )}
        />
      )}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md border border-border py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-hover"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!name.trim() || busy}
          className="flex-1 rounded-md bg-primary py-1 text-[11px] font-medium text-primary-foreground transition-opacity disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
