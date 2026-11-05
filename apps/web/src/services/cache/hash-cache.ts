import "server-only";
import type { z } from "zod";

import { getCache } from "./registry";

const inflight = new Map<string, Promise<unknown>>();

function cacheFailed(tag: string, err: unknown): void {
  console.warn(`${tag} cache: ${err instanceof Error ? err.message : String(err)}`);
}

function parseStored<T>(schema: z.ZodType<T>, raw: string): T | null {
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function readOrLoad<T>(opts: CachedFieldOptions<T>): Promise<T> {
  const raw = await getCache()
    .hget(opts.key, opts.field)
    .catch((err: unknown) => {
      cacheFailed(opts.tag, err);
      return null;
    });
  const hit = raw === null ? null : parseStored(opts.schema, raw);
  if (hit !== null) return hit;
  const value = await opts.load();
  if (opts.keep?.(value) ?? true) {
    await getCache()
      .hsetExpiring(opts.key, opts.field, JSON.stringify(value), opts.ttlSec)
      .catch((err: unknown) => cacheFailed(opts.tag, err));
  }
  return value;
}

export interface CachedFieldOptions<T> {
  key: string;
  field: string;
  ttlSec: number;
  schema: z.ZodType<T>;
  tag: string;
  load: () => Promise<T>;
  keep?: (value: T) => boolean;
}

export function cachedField<T>(opts: CachedFieldOptions<T>): Promise<T> {
  const id = JSON.stringify([opts.key, opts.field]);
  const pending = inflight.get(id);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the id embeds key and field, so a pending entry was created by a caller with the same schema
  if (pending) return pending as Promise<T>;
  const run = readOrLoad(opts).finally(() => inflight.delete(id));
  inflight.set(id, run);
  return run;
}

export async function forgetHash(key: string, tag: string): Promise<void> {
  await getCache()
    .del(key)
    .catch((err: unknown) => cacheFailed(tag, err));
}
