import type { Json } from "@/workflow/values";

export function jsonOf(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return value;
  if (Array.isArray(value)) return value.map(jsonOf);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) =>
        entry === undefined ? [] : [[key, jsonOf(entry)]],
      ),
    );
  }
  return null;
}

export function nextKey(prefix: string, taken: readonly string[]): string {
  for (let index = 1; ; index += 1) {
    const key = `${prefix}${index}`;
    if (!taken.includes(key)) return key;
  }
}
