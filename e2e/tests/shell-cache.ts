import type { Locator, Page, Route } from "@playwright/test";
import { z } from "zod";

import type { Rpc } from "./fixtures";

const RPC = "**/rpc/**";
const DB = "metis-shell-cache";

export const SHELL_KEYS = [
  ...[
    "user.getPreferences",
    "workspaces.list",
    "workspaceMailboxes.list",
    "workspaceCalendars.list",
    "workspaceDrives.list",
    "workspaceAddressBooks.list",
    "mail.customLabels.list",
    "calendarEvents.calendars",
    "drive.pins",
    "drive.quotas",
    "contacts.books",
    "assistant.listThreads",
    "workflows.list",
    "search.saved.list",
  ].map((path) => `${path} (query)`),
  "drive.list (top folder, first page)",
];

const rowSchema = z.object({
  hash: z.string(),
  queryKey: z.tuple([
    z.array(z.string()),
    z.object({ type: z.string().optional(), input: z.unknown().optional() }),
  ]),
  data: z.unknown(),
});

const cacheSchema = z
  .object({
    owner: z.object({ userId: z.string(), version: z.string() }).nullable(),
    queries: z.array(rowSchema),
  })
  .nullable();

export type ShellCache = NonNullable<z.infer<typeof cacheSchema>>;
type ShellRow = z.infer<typeof rowSchema>;

const READ = `(async () => {
  if (!(await indexedDB.databases()).some((d) => d.name === ${JSON.stringify(DB)})) return null;
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(${JSON.stringify(DB)});
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const all = (store) =>
    new Promise((resolve, reject) => {
      const req = db.transaction(store).objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  try {
    return { owner: (await all("owner"))[0] ?? null, queries: await all("queries") };
  } finally {
    db.close();
  }
})()`;

export async function readShellCache(page: Page): Promise<ShellCache | null> {
  return cacheSchema.parse(await page.evaluate(READ));
}

export async function writeShellCache(
  page: Page,
  owner: { userId: string; version: string },
  extra: { hash: string; queryKey: unknown; data: unknown },
): Promise<void> {
  await page.evaluate(`(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(${JSON.stringify(DB)});
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(["owner", "queries"], "readwrite");
        tx.objectStore("owner").put(${JSON.stringify({ id: "owner", ...owner })});
        tx.objectStore("queries").put(${JSON.stringify({ ...extra, updatedAt: Date.now() })});
        tx.oncomplete = () => resolve(undefined);
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  })()`);
}

export async function hasShellCache(page: Page): Promise<boolean> {
  return z
    .boolean()
    .parse(
      await page.evaluate(
        `indexedDB.databases().then((dbs) => dbs.some((d) => d.name === ${JSON.stringify(DB)}))`,
      ),
    );
}

function pageCount(data: unknown): number | null {
  const parsed = z.object({ pages: z.array(z.unknown()) }).safeParse(data);
  return parsed.success ? parsed.data.pages.length : null;
}

function describeRow(row: ShellRow): string {
  const [path, { type, input }] = row.queryKey;
  const name = path.join(".");
  const parent = z.object({ parentId: z.null() }).safeParse(input).success;
  if (name === "drive.list" && type === "infinite" && parent && pageCount(row.data) === 1) {
    return "drive.list (top folder, first page)";
  }
  return `${name} (${type ?? "none"})`;
}

export function shellKeys(cache: ShellCache | null): string[] {
  return [...new Set((cache?.queries ?? []).map(describeRow))].toSorted();
}

export function cachedData(cache: ShellCache | null, path: string): unknown[] {
  return (cache?.queries ?? [])
    .filter((row) => row.queryKey[0].join(".") === path)
    .map((row) => row.data);
}

export async function sessionUserId(page: Page): Promise<string> {
  const res = await page.request.get("/api/auth/get-session");
  return z.object({ user: z.object({ id: z.string() }) }).parse(await res.json()).user.id;
}

export async function holdRpc(page: Page): Promise<() => Promise<void>> {
  const held: Route[] = [];
  let open = false;
  const handler = async (route: Route) => {
    if (open) await route.continue();
    else held.push(route);
  };
  await page.route(RPC, handler);
  return async () => {
    open = true;
    await Promise.all(held.splice(0).map((route) => route.continue()));
    await page.unroute(RPC, handler);
  };
}

export async function workspaceName(rpc: Rpc, slug: string): Promise<string> {
  const { workspaces } = await rpc<{ workspaces: { name: string; slug: string }[] }>(
    "workspaces.list",
  );
  const found = workspaces.find((w) => w.slug === slug);
  if (!found) throw new Error(`no workspace ${slug}`);
  return found.name;
}

export function workspaceTile(page: Page, name: string): Locator {
  return page
    .getByRole("navigation", { name: "App navigation" })
    .getByRole("link", { name: `Switch to ${name}`, exact: true });
}
