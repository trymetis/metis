const PREFIX = "metis:search:recent:";

function recentKey(workspaceSlug: string): string {
  return `${PREFIX}${workspaceSlug}`;
}

export function readRecentSearches(workspaceSlug: string): string[] {
  try {
    const raw = window.localStorage.getItem(recentKey(workspaceSlug));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === "string") : [];
  } catch {
    return [];
  }
}

export function writeRecentSearches(workspaceSlug: string, list: string[]): void {
  try {
    window.localStorage.setItem(recentKey(workspaceSlug), JSON.stringify(list));
  } catch {}
}

export function clearRecentSearches(): void {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {}
}
