import "server-only";
import type { CacheDriver } from "../types";

interface Entry {
  value: string;
  fields?: Map<string, string>;
  expiresAt: number | null;
}

declare global {
  var $metisMemoryCache: Map<string, Entry> | undefined;
}

function processStore(): Map<string, Entry> {
  const existing = globalThis.$metisMemoryCache;
  if (existing) return existing;

  const created = new Map<string, Entry>();
  globalThis.$metisMemoryCache = created;

  if (typeof setInterval !== "undefined") {
    setInterval(
      () => {
        const now = Date.now();
        for (const [key, entry] of created) {
          if (entry.expiresAt !== null && entry.expiresAt <= now) created.delete(key);
        }
      },
      5 * 60 * 1000,
    ).unref?.();
  }
  return created;
}

const STORE = processStore();

function read(key: string) {
  const entry = STORE.get(key);
  if (!entry) return;
  if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
    STORE.delete(key);
    return;
  }
  return entry;
}

export function createMemoryDriver(): CacheDriver {
  return {
    async warmup() {},
    async close() {},
    async get(key) {
      return read(key)?.value ?? null;
    },
    async getAndDelete(key) {
      const value = read(key)?.value ?? null;
      STORE.delete(key);
      return value;
    },
    async set(key, value, ttlSec) {
      STORE.set(key, {
        value,
        expiresAt: ttlSec !== undefined ? Date.now() + ttlSec * 1000 : null,
      });
    },
    async del(key) {
      STORE.delete(key);
    },
    async incr(key, ttlSec) {
      const existing = read(key);
      if (!existing) {
        STORE.set(key, {
          value: "1",
          expiresAt: Date.now() + ttlSec * 1000,
        });
        return 1;
      }
      const next = Number(existing.value) + 1;
      existing.value = String(next);
      return next;
    },
    async hget(key, field) {
      return read(key)?.fields?.get(field) ?? null;
    },
    async hmget(key, fields) {
      const stored = read(key)?.fields;
      return fields.map((field) => stored?.get(field) ?? null);
    },
    async hsetExpiring(key, field, value, ttlSec) {
      const existing = read(key);
      if (existing?.fields) {
        existing.fields.set(field, value);
        existing.expiresAt ??= Date.now() + ttlSec * 1000;
        return;
      }
      STORE.set(key, {
        value: "",
        fields: new Map([[field, value]]),
        expiresAt: Date.now() + ttlSec * 1000,
      });
    },
  };
}
