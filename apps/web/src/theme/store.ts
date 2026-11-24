import "server-only";
import { and, count, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { isUniqueViolation } from "@/db/errors";
import { theme, workspace } from "@/db/schema";
import { themePaletteSchema } from "@/server/schema";

import { SYSTEM_THEMES } from "./system";
import { THEMES_PER_OWNER_MAX, type ThemePalette } from "./tokens";

export type ThemeSource = "system" | "instance" | "workspace";

export type ThemeOwner = { kind: "instance" } | { kind: "workspace"; workspaceId: string };

export interface StoredTheme {
  id: string;
  name: string;
  source: ThemeSource;
  palette: ThemePalette;
  updatedAt: Date;
}

type ThemeRow = typeof theme.$inferSelect;

const SYSTEM_ORDER = new Map(SYSTEM_THEMES.map((t, i) => [t.key, i]));

export function themeSource(row: Pick<ThemeRow, "systemKey" | "workspaceId">): ThemeSource {
  if (row.systemKey) return "system";
  return row.workspaceId ? "workspace" : "instance";
}

export function storedTheme(row: ThemeRow): StoredTheme | null {
  const palette = themePaletteSchema.safeParse(row.tokens);
  if (!palette.success) {
    console.error(`[theme] ${row.id} has an invalid palette`);
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    source: themeSource(row),
    palette: palette.data,
    updatedAt: row.updatedAt,
  };
}

export function themeJson(stored: StoredTheme) {
  return { ...stored, updatedAt: stored.updatedAt.toISOString() };
}

function sortThemes(rows: ThemeRow[]): ThemeRow[] {
  const rank = (row: ThemeRow) => (row.systemKey ? 0 : row.workspaceId ? 2 : 1);
  return rows.toSorted((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    if (a.systemKey && b.systemKey) {
      return (SYSTEM_ORDER.get(a.systemKey) ?? 99) - (SYSTEM_ORDER.get(b.systemKey) ?? 99);
    }
    return a.name.localeCompare(b.name);
  });
}

function ownerFilter(owner: ThemeOwner) {
  return owner.kind === "instance"
    ? and(isNull(theme.workspaceId), isNull(theme.systemKey))
    : eq(theme.workspaceId, owner.workspaceId);
}

export async function listThemes(workspaceId: string | null): Promise<StoredTheme[]> {
  const rows = await db
    .select()
    .from(theme)
    .where(
      workspaceId
        ? or(isNull(theme.workspaceId), eq(theme.workspaceId, workspaceId))
        : isNull(theme.workspaceId),
    );
  return sortThemes(rows).flatMap((row) => storedTheme(row) ?? []);
}

export async function findVisibleTheme(
  workspaceId: string,
  themeId: string,
): Promise<StoredTheme | null> {
  const [row] = await db
    .select()
    .from(theme)
    .where(
      and(eq(theme.id, themeId), or(isNull(theme.workspaceId), eq(theme.workspaceId, workspaceId))),
    )
    .limit(1);
  return row ? storedTheme(row) : null;
}

export async function themeUsage(): Promise<Map<string, number>> {
  const rows = await db
    .select({ themeId: workspace.themeId, n: count() })
    .from(workspace)
    .groupBy(workspace.themeId);
  return new Map(rows.map((row) => [row.themeId, row.n]));
}

export type SaveThemeResult = { theme: StoredTheme } | { error: string; notFound?: true };

const NAME_TAKEN = "A theme with that name already exists";

export async function saveTheme(
  owner: ThemeOwner,
  input: { id?: string; name: string; palette: ThemePalette },
): Promise<SaveThemeResult> {
  try {
    return await writeTheme(owner, input);
  } catch (err) {
    if (isUniqueViolation(err)) return { error: NAME_TAKEN };
    throw err;
  }
}

async function writeTheme(
  owner: ThemeOwner,
  input: { id?: string; name: string; palette: ThemePalette },
): Promise<SaveThemeResult> {
  const name = input.name.trim();
  const sameName = await db
    .select({ id: theme.id })
    .from(theme)
    .where(
      and(
        owner.kind === "instance" ? isNull(theme.workspaceId) : ownerFilter(owner),
        sql`lower(${theme.name}) = lower(${name})`,
        input.id ? ne(theme.id, input.id) : undefined,
      ),
    )
    .limit(1);
  if (sameName.length > 0) return { error: NAME_TAKEN };

  if (input.id) {
    const [updated] = await db
      .update(theme)
      .set({ name, tokens: input.palette })
      .where(and(eq(theme.id, input.id), ownerFilter(owner)))
      .returning();
    const saved = updated ? storedTheme(updated) : null;
    return saved ? { theme: saved } : { error: "That theme is gone", notFound: true };
  }

  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(theme).where(ownerFilter(owner));
  if (n >= THEMES_PER_OWNER_MAX) {
    return { error: `You can keep up to ${THEMES_PER_OWNER_MAX} themes` };
  }

  const now = new Date();
  const [created] = await db
    .insert(theme)
    .values({
      id: crypto.randomUUID(),
      workspaceId: owner.kind === "workspace" ? owner.workspaceId : null,
      systemKey: null,
      name,
      tokens: input.palette,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const saved = created ? storedTheme(created) : null;
  return saved ? { theme: saved } : { error: "Could not save the theme" };
}

export async function deleteTheme(owner: ThemeOwner, themeId: string): Promise<boolean> {
  const deleted = await db
    .delete(theme)
    .where(and(eq(theme.id, themeId), ownerFilter(owner)))
    .returning({ id: theme.id });
  return deleted.length > 0;
}

export async function deleteThemes(owner: ThemeOwner, themeIds: string[]): Promise<number> {
  const deleted = await db
    .delete(theme)
    .where(and(inArray(theme.id, themeIds), ownerFilter(owner)))
    .returning({ id: theme.id });
  return deleted.length;
}

export async function setWorkspaceThemeId(workspaceId: string, themeId: string): Promise<void> {
  await db.update(workspace).set({ themeId }).where(eq(workspace.id, workspaceId));
}

export async function ensureSystemThemes(): Promise<{
  added: string[];
  updated: string[];
  removed: string[];
}> {
  const rows = await db.select().from(theme).where(isNotNull(theme.systemKey));
  const byKey = new Map(rows.map((row) => [row.systemKey, row]));
  const added: string[] = [];
  const updated: string[] = [];
  const now = new Date();

  const writes: (() => Promise<unknown>)[] = [];
  for (const system of SYSTEM_THEMES) {
    const row = byKey.get(system.key);
    if (!row) {
      writes.push(() =>
        db.insert(theme).values({
          id: system.id,
          workspaceId: null,
          systemKey: system.key,
          name: system.name,
          tokens: system.palette,
          createdAt: now,
          updatedAt: now,
        }),
      );
      added.push(system.key);
    } else if (
      row.name !== system.name ||
      JSON.stringify(row.tokens) !== JSON.stringify(system.palette)
    ) {
      writes.push(() =>
        db
          .update(theme)
          .set({ name: system.name, tokens: system.palette })
          .where(eq(theme.id, row.id)),
      );
      updated.push(system.key);
    }
  }

  const keep = new Set(SYSTEM_THEMES.map((t) => t.key));
  const removed = rows.flatMap((row) =>
    row.systemKey && !keep.has(row.systemKey) ? [row.systemKey] : [],
  );
  if (removed.length > 0)
    writes.push(() => db.delete(theme).where(inArray(theme.systemKey, removed)));
  await writes.reduce<Promise<unknown>>((done, write) => done.then(write), Promise.resolve());

  return { added, updated, removed };
}
