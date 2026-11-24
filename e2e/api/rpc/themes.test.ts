import { afterAll, expect, test } from "vitest";

import { type Rpc, RpcError } from "../../clients/rpc";
import { withTotp } from "../../clients/totp";
import { uniqueName } from "../support/poll";
import { ana, scope } from "../support/session";

type Tokens = Record<string, string>;

interface Theme {
  id: string;
  name: string;
  source: "system" | "instance" | "workspace";
  palette: { light: Tokens; dark: Tokens };
}

interface WorkspaceThemes {
  themes: Theme[];
  selectedId: string;
  canEdit: boolean;
}

const SYSTEM_NAMES = ["Amber", "Blue", "Violet", "Emerald", "Rose", "Slate", "Graphite"];

async function rejection(call: Promise<unknown>): Promise<RpcError> {
  const err = await call.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof RpcError)) throw new Error("expected an RpcError");
  return err;
}

let throwaway: Promise<{ workspaceSlug: string }> | undefined;

async function withWorkspace(
  rpc: Rpc,
  run: (ws: { workspaceSlug: string }) => Promise<void>,
): Promise<void> {
  throwaway ??= rpc<{ slug: string }>("workspaces.create", { name: uniqueName() }).then((c) => ({
    workspaceSlug: c.slug,
  }));
  await run(await throwaway);
}

afterAll(async () => {
  if (!throwaway) return;
  const ws = await throwaway;
  const { rpc } = await ana();
  await withTotp((code) => rpc("workspaces.delete", { ...ws, code }));
});

function paletteOf(themes: Theme[], name: string): Theme["palette"] {
  const theme = themes.find((t) => t.name === name);
  if (!theme) throw new Error(`no ${name} theme`);
  return theme.palette;
}

test("the built-in themes are listed in order, and a new workspace uses Graphite", async () => {
  const { rpc, account } = await ana();
  const seeded = await rpc<WorkspaceThemes>("workspaceThemes.list", scope(account));
  const system = seeded.themes.filter((t) => t.source === "system");
  expect(system.map((t) => t.name)).toEqual(SYSTEM_NAMES);
  expect(seeded.canEdit).toBe(true);
  expect(seeded.themes.map((t) => t.id)).toContain(seeded.selectedId);
  expect(Object.keys(system[0]?.palette.light ?? {})).toHaveLength(18);

  await withWorkspace(rpc, async (ws) => {
    const fresh = await rpc<WorkspaceThemes>("workspaceThemes.list", ws);
    expect(fresh.themes.find((t) => t.id === fresh.selectedId)?.name).toBe("Graphite");
  });
});

test("a palette with a value that is not a color is refused", async () => {
  const { rpc, account } = await ana();
  const { themes } = await rpc<WorkspaceThemes>("workspaceThemes.list", scope(account));
  const palette = paletteOf(themes, "Slate");
  for (const bad of ["url(https://example.com/x.png)", "red", "#12345", "#fff;}html{color:red"]) {
    const refused = await rejection(
      rpc("workspaceThemes.save", {
        ...scope(account),
        name: uniqueName(),
        palette: { ...palette, light: { ...palette.light, brand: bad } },
      }),
    );
    expect(refused.code).toBe("BAD_REQUEST");
  }
  const missing = await rejection(
    rpc("workspaceThemes.save", {
      ...scope(account),
      name: uniqueName(),
      palette: { light: { brand: "#123456" }, dark: palette.dark },
    }),
  );
  expect(missing.code).toBe("BAD_REQUEST");
});

test("a workspace's custom theme is its own: names are unique in it and another workspace cannot use it", async () => {
  const { rpc, account } = await ana();
  const { themes } = await rpc<WorkspaceThemes>("workspaceThemes.list", scope(account));
  const palette = paletteOf(themes, "Emerald");
  await withWorkspace(rpc, async (ws) => {
    const name = uniqueName();
    const { theme } = await rpc<{ theme: Theme }>("workspaceThemes.save", {
      ...ws,
      name,
      palette,
      select: true,
    });
    expect(theme).toMatchObject({ name, source: "workspace" });
    const listed = await rpc<WorkspaceThemes>("workspaceThemes.list", ws);
    expect(listed.selectedId).toBe(theme.id);

    const duplicate = await rejection(
      rpc("workspaceThemes.save", { ...ws, name: name.toUpperCase(), palette }),
    );
    expect(duplicate.message).toBe("A theme with that name already exists");

    const elsewhere = await rpc<WorkspaceThemes>("workspaceThemes.list", scope(account));
    expect(elsewhere.themes.map((t) => t.id)).not.toContain(theme.id);
    const foreign = await rejection(
      rpc("workspaceThemes.select", { ...scope(account), themeId: theme.id }),
    );
    expect(foreign.message).toBe("That theme is not available to this workspace");
    const foreignDelete = await rejection(
      rpc("workspaceThemes.delete", { ...scope(account), themeId: theme.id }),
    );
    expect(foreignDelete.message).toBe("That theme is gone");

    await rpc("workspaceThemes.delete", { ...ws, themeId: theme.id });
    const after = await rpc<WorkspaceThemes>("workspaceThemes.list", ws);
    expect(after.themes.find((t) => t.id === after.selectedId)?.name).toBe("Graphite");
  });
});

test("an instance theme is offered to every workspace and cannot reuse a built-in name", async () => {
  const { rpc } = await ana();
  const { themes } = await rpc<{ themes: (Theme & { usedBy: number })[] }>("dashboard.themes.list");
  expect(themes.filter((t) => t.source === "system").map((t) => t.name)).toEqual(SYSTEM_NAMES);
  const palette = paletteOf(themes, "Rose");

  const builtIn = await rejection(rpc("dashboard.themes.save", { name: "amber", palette }));
  expect(builtIn.message).toBe("A theme with that name already exists");
  const system = themes.find((t) => t.name === "Graphite");
  const locked = await rejection(
    rpc("dashboard.themes.save", { id: system?.id, name: "Graphite", palette }),
  );
  expect(locked.code).toBe("NOT_FOUND");
  const undeletable = await rejection(rpc("dashboard.themes.delete", { themeId: system?.id }));
  expect(undeletable.code).toBe("NOT_FOUND");

  const name = uniqueName();
  const { theme } = await rpc<{ theme: Theme }>("dashboard.themes.save", { name, palette });
  try {
    expect(theme.source).toBe("instance");
    await withWorkspace(rpc, async (ws) => {
      const offered = await rpc<WorkspaceThemes>("workspaceThemes.list", ws);
      expect(offered.themes.find((t) => t.id === theme.id)?.source).toBe("instance");
      await rpc("workspaceThemes.select", { ...ws, themeId: theme.id });
      const used = await rpc<{ themes: (Theme & { usedBy: number })[] }>("dashboard.themes.list");
      expect(used.themes.find((t) => t.id === theme.id)?.usedBy).toBe(1);

      const renamed = `${name} renamed`;
      await rpc("dashboard.themes.save", { id: theme.id, name: renamed, palette });
      const seen = await rpc<WorkspaceThemes>("workspaceThemes.list", ws);
      expect(seen.themes.find((t) => t.id === seen.selectedId)?.name).toBe(renamed);

      await rpc("dashboard.themes.delete", { themeId: theme.id });
      const fallback = await rpc<WorkspaceThemes>("workspaceThemes.list", ws);
      expect(fallback.themes.find((t) => t.id === fallback.selectedId)?.name).toBe("Graphite");
    });
  } finally {
    await rpc("dashboard.themes.delete", { themeId: theme.id }).catch(() => undefined);
  }
});
