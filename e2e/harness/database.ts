import { readdir } from "node:fs/promises";

import { type Client, createClient } from "@libsql/client";

import { env } from "../lib/env";

const SEED_SQL = new URL("./seed.sql", import.meta.url);
const RECORD_FRAGMENTS = new URL("./record/", import.meta.url);
const MASTRA_FRAGMENTS = new URL("./mastra/", import.meta.url);

async function fragments(dir: URL): Promise<URL[]> {
  try {
    return (await readdir(dir))
      .filter((file) => file.endsWith(".sql"))
      .toSorted()
      .map((file) => new URL(file, dir));
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

async function loadFragments(client: Client, dir: URL): Promise<number> {
  const files = await fragments(dir);
  for (const file of files) {
    await client.executeMultiple(await Bun.file(file).text());
  }
  return files.length;
}

export async function loadSeedSql(): Promise<void> {
  const client = createClient(env.database);
  try {
    const existing = await client.execute('SELECT count(*) AS n FROM "user"');
    if (Number(existing.rows[0]?.n ?? 0) > 0) {
      console.log("[harness] database already seeded, seed.sql skipped");
      return;
    }
    await client.executeMultiple(await Bun.file(SEED_SQL).text());
    console.log("[harness] inserted seed.sql");
    const loaded = await loadFragments(client, RECORD_FRAGMENTS);
    console.log(`[harness] inserted ${loaded} file(s) from record/`);
    await rebaseOpenWaits(client);
  } finally {
    client.close();
  }
}

async function rebaseOpenWaits(client: Client): Promise<void> {
  const recorded = await client.execute('SELECT max("created_at") AS at FROM "workflow_run"');
  const recordedAt = Number(recorded.rows[0]?.at ?? 0);
  if (!recordedAt) return;
  const offset = Date.now() - recordedAt;
  await client.batch(
    [
      {
        sql: `UPDATE "workflow_wait" SET "wake_at" = "wake_at" + ? WHERE "status" = 'open' AND "wake_at" IS NOT NULL`,
        args: [offset],
      },
      {
        sql: `UPDATE "workflow_step_run" SET "wake_at" = "wake_at" + ? WHERE "status" = 'waiting' AND "wake_at" IS NOT NULL`,
        args: [offset],
      },
      {
        sql: `UPDATE "workflow_run" SET "due_at" = "due_at" + ? WHERE "status" IN ('waiting', 'pending')`,
        args: [offset],
      },
    ],
    "write",
  );
  console.log(`[harness] moved open workflow waits forward by ${Math.round(offset / 60_000)} min`);
}

export async function loadMastraSeedSql(): Promise<void> {
  const client = createClient(env.mastraDatabase);
  try {
    const existing = await client.execute(
      "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'mastra_threads'",
    );
    if (Number(existing.rows[0]?.n ?? 0) > 0) {
      console.log("[harness] mastra database already seeded, mastra/ skipped");
      return;
    }
    const loaded = await loadFragments(client, MASTRA_FRAGMENTS);
    console.log(`[harness] inserted ${loaded} file(s) from mastra/`);
  } finally {
    client.close();
  }
}
