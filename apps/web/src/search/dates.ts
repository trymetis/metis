const DAY_MS = 86_400_000;

const RELATIVE = /^(\d{1,4})([dwmy])$/i;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;
const ISO_YEAR = /^(\d{4})$/;

export interface DateSpan {
  start: number;
  end: number;
}

export function isValidTimeZone(zone: string): boolean {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone !== "";
  } catch {
    return false;
  }
}

function zoneOffset(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(at / 1000) * 1000;
}

function zonedMidnight(year: number, month: number, day: number, timeZone: string): number {
  const guess = Date.UTC(year, month, day);
  const first = guess - zoneOffset(guess, timeZone);
  return guess - zoneOffset(first, timeZone);
}

function zonedDate(at: number, timeZone: string) {
  const local = new Date(at + zoneOffset(at, timeZone));
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    day: local.getUTCDate(),
  };
}

function dayOf(at: number, timeZone: string): DateSpan {
  const { year, month, day } = zonedDate(at, timeZone);
  return {
    start: zonedMidnight(year, month, day, timeZone),
    end: zonedMidnight(year, month, day + 1, timeZone),
  };
}

function shift(now: number, amount: number, unit: string): number {
  const date = new Date(now);
  switch (unit) {
    case "d":
      return now - amount * DAY_MS;
    case "w":
      return now - amount * 7 * DAY_MS;
    case "m":
      date.setUTCMonth(date.getUTCMonth() - amount);
      return date.getTime();
    default:
      date.setUTCFullYear(date.getUTCFullYear() - amount);
      return date.getTime();
  }
}

export function parseSearchDate(
  raw: string,
  timeZone: string,
  now: number = Date.now(),
): DateSpan | null {
  const value = raw.trim().toLowerCase();
  if (value === "today") return dayOf(now, timeZone);
  if (value === "yesterday") return dayOf(now - DAY_MS, timeZone);
  if (value === "tomorrow") return dayOf(now + DAY_MS, timeZone);

  const relative = RELATIVE.exec(value);
  if (relative) {
    const at = shift(now, Number(relative[1]), relative[2]?.toLowerCase() ?? "d");
    return { start: at, end: at };
  }

  const day = ISO_DAY.exec(value);
  if (day) {
    const [y, m, d] = [Number(day[1]), Number(day[2]) - 1, Number(day[3])];
    if (m < 0 || m > 11 || d < 1 || d > 31) return null;
    return {
      start: zonedMidnight(y, m, d, timeZone),
      end: zonedMidnight(y, m, d + 1, timeZone),
    };
  }

  const month = ISO_MONTH.exec(value);
  if (month) {
    const [y, m] = [Number(month[1]), Number(month[2]) - 1];
    if (m < 0 || m > 11) return null;
    return {
      start: zonedMidnight(y, m, 1, timeZone),
      end: zonedMidnight(y, m + 1, 1, timeZone),
    };
  }

  const year = ISO_YEAR.exec(value);
  if (year) {
    const y = Number(year[1]);
    return {
      start: zonedMidnight(y, 0, 1, timeZone),
      end: zonedMidnight(y + 1, 0, 1, timeZone),
    };
  }

  return null;
}

export function instantDay(at: number, timeZone: string): DateSpan {
  return dayOf(at, timeZone);
}
