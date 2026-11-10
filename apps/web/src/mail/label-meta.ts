import { isOneOf } from "@/lib/guards";
import { BUILT_IN_LABELS, type BuiltInLabel } from "@/server/schema";
import { CUSTOM_LABEL_COLORS, isLabelColor, type LabelColor } from "@/types/mail";

export type LabelKey = BuiltInLabel | "scheduled";

export type CustomLabel = {
  key: string;
  name: string;
  color: LabelColor;
};

export type LabelMeta = {
  key: LabelKey;
  name: string;
  chipLabel: string;
  color: string;
  mark: string;
  chipBg: string;
};

export type LabelChipStyle = {
  label: string;
  bg: string;
  fg: string;
};

const LABEL_META: readonly LabelMeta[] = [
  {
    key: "action_required",
    name: "Action Required",
    chipLabel: "Action Required",
    color: "var(--label-action-required)",
    mark: "var(--label-action-required-mark)",
    chipBg: "rgba(192,57,43,0.15)",
  },
  {
    key: "work",
    name: "Work",
    chipLabel: "Work",
    color: "var(--label-work)",
    mark: "var(--label-work-mark)",
    chipBg: "rgba(91,163,212,0.18)",
  },
  {
    key: "personal",
    name: "Personal",
    chipLabel: "Personal",
    color: "var(--brand-on-tint)",
    mark: "var(--brand-mark)",
    chipBg: "color-mix(in srgb, var(--brand) 18%, transparent)",
  },
  {
    key: "transactions",
    name: "Transactions",
    chipLabel: "Transactions",
    color: "var(--label-transactions)",
    mark: "var(--label-transactions-mark)",
    chipBg: "rgba(39,174,96,0.15)",
  },
  {
    key: "updates",
    name: "Updates",
    chipLabel: "Updates",
    color: "var(--label-updates)",
    mark: "var(--label-updates-mark)",
    chipBg: "rgba(108,127,216,0.16)",
  },
  {
    key: "newsletter",
    name: "Newsletter",
    chipLabel: "Newsletter",
    color: "var(--label-newsletter)",
    mark: "var(--label-newsletter-mark)",
    chipBg: "rgba(154,148,132,0.18)",
  },
  {
    key: "promotional",
    name: "Promotional",
    chipLabel: "Promo",
    color: "var(--label-promotional)",
    mark: "var(--label-promotional-mark)",
    chipBg: "rgba(142,68,173,0.18)",
  },
  {
    key: "social",
    name: "Social",
    chipLabel: "Social",
    color: "var(--label-social)",
    mark: "var(--label-social-mark)",
    chipBg: "rgba(58,166,166,0.16)",
  },
  {
    key: "scheduled",
    name: "Scheduled",
    chipLabel: "Scheduled",
    color: "var(--brand-on-tint)",
    mark: "var(--brand-mark)",
    chipBg: "color-mix(in srgb, var(--brand) 15%, transparent)",
  },
] as const;

export const LABEL_DESCRIPTIONS: Record<BuiltInLabel, string> = {
  action_required:
    "urgent, deadlines, interview invites, account verification, things needing a response",
  work: "recruiters, work platforms (LinkedIn, GitHub, Slack), professional correspondence",
  transactions: "orders, receipts, shipping, invoices, billing, banking",
  updates: "automated notifications, alerts, reminders, account activity",
  newsletter: "digests, marketing content from subscribed services",
  personal: "from individual people you know",
  promotional: "marketing, sales, ads, deals",
  social: "social network notifications and activity (Facebook, Instagram, X, Reddit)",
};

const ASSIGNABLE = new Set<string>(BUILT_IN_LABELS);

const ASSIGNABLE_LABEL_META: readonly LabelMeta[] = LABEL_META.filter((meta) =>
  ASSIGNABLE.has(meta.key),
);

const LABEL_META_BY_KEY: Record<string, LabelMeta> = Object.fromEntries(
  LABEL_META.map((meta) => [meta.key, meta]),
);

export const LABEL_OPTIONS: { key: string; name: string; mark: string }[] =
  ASSIGNABLE_LABEL_META.map(({ key, name, mark }) => ({ key, name, mark }));

export const LABEL_SELECT_OPTIONS: { value: string; label: string }[] = ASSIGNABLE_LABEL_META.map(
  ({ key, name }) => ({ value: key, label: name }),
);

export function customLabelColor(color: LabelColor): string {
  if (isOneOf(CUSTOM_LABEL_COLORS, color)) return `var(--label-custom-${color})`;
  if (!isLabelColor(color)) return "var(--label-custom-gray)";
  return `oklch(from ${color} var(--label-custom-text-l) min(c, 0.2) h)`;
}

export function customLabelMark(color: LabelColor): string {
  if (isOneOf(CUSTOM_LABEL_COLORS, color)) return `var(--label-custom-${color}-mark)`;
  return isLabelColor(color) ? color : "var(--label-custom-gray-mark)";
}

export function resolveLabelName(key: string, custom: readonly CustomLabel[]): string {
  return LABEL_META_BY_KEY[key]?.name ?? custom.find((label) => label.key === key)?.name ?? key;
}

export function resolveChipStyle(
  key: string,
  custom: readonly CustomLabel[],
): LabelChipStyle | undefined {
  const meta = LABEL_META_BY_KEY[key];
  if (meta) return { label: meta.chipLabel, bg: meta.chipBg, fg: meta.color };

  const found = custom.find((label) => label.key === key);
  if (!found) return undefined;
  const color = customLabelColor(found.color);
  return {
    label: found.name,
    bg: `color-mix(in srgb, ${color} 15%, transparent)`,
    fg: color,
  };
}
