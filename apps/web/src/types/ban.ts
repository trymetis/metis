export const BAN_DURATIONS = ["1d", "7d", "30d", "permanent"] as const;
export type BanDuration = (typeof BAN_DURATIONS)[number];

export const BAN_DURATION_LABELS: Record<BanDuration, string> = {
  "1d": "1 day",
  "7d": "7 days",
  "30d": "30 days",
  permanent: "Until unbanned",
};

const DAY_MS = 24 * 60 * 60 * 1000;

const BAN_DURATION_DAYS: Record<Exclude<BanDuration, "permanent">, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
};

export function banExpiresAt(duration: BanDuration, now: Date): Date | null {
  if (duration === "permanent") return null;
  return new Date(now.getTime() + BAN_DURATION_DAYS[duration] * DAY_MS);
}

export const BAN_REASON_MAX = 500;
