import "server-only";
import {
  deleteTheme,
  deleteThemes,
  listThemes,
  saveTheme,
  themeUsage,
  type StoredTheme,
} from "@/theme/store";
import type { ThemePalette } from "@/theme/tokens";

export async function listInstanceThemes(): Promise<(StoredTheme & { usedBy: number })[]> {
  const [themes, usage] = await Promise.all([listThemes(null), themeUsage()]);
  return themes.map((theme) => ({ ...theme, usedBy: usage.get(theme.id) ?? 0 }));
}

export async function saveInstanceTheme(input: {
  id?: string;
  name: string;
  palette: ThemePalette;
}): Promise<{ theme: StoredTheme } | { error: string; notFound?: true }> {
  return saveTheme({ kind: "instance" }, input);
}

export async function deleteInstanceTheme(themeId: string): Promise<boolean> {
  return deleteTheme({ kind: "instance" }, themeId);
}

export async function deleteInstanceThemes(themeIds: string[]): Promise<number> {
  return deleteThemes({ kind: "instance" }, themeIds);
}
