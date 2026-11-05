import "server-only";
import { Redis } from "@upstash/redis";

import type { UpstashCacheConfig } from "@/config/schema";

import { HSET_EXPIRE, INCR_EXPIRE } from "../lua-scripts";
import type { CacheDriver } from "../types";

const PREFIX = "metis:";

function prefixed(key: string) {
  return `${PREFIX}${key}`;
}

export function createUpstashDriver(cfg: UpstashCacheConfig): CacheDriver {
  const { url, token } = cfg;

  const redis = new Redis({
    url,
    token,
    automaticDeserialization: false,
  });

  return {
    async warmup() {
      await redis.ping();
    },
    async close() {},
    async get(key) {
      return redis.get<string>(prefixed(key));
    },
    async getAndDelete(key) {
      return redis.getdel<string>(prefixed(key));
    },
    async set(key, value, ttlSec) {
      if (ttlSec !== undefined) {
        await redis.set(prefixed(key), value, { ex: ttlSec });
      } else {
        await redis.set(prefixed(key), value);
      }
    },
    async del(key) {
      await redis.del(prefixed(key));
    },
    async incr(key, ttlSec) {
      return Number(await redis.eval(INCR_EXPIRE, [prefixed(key)], [String(ttlSec)]));
    },
    async hget(key, field) {
      return redis.hget<string>(prefixed(key), field);
    },
    async hmget(key, fields) {
      if (fields.length === 0) return [];
      const found = await redis.hmget<Record<string, string | null>>(prefixed(key), ...fields);
      return fields.map((field) => found?.[field] ?? null);
    },
    async hsetExpiring(key, field, value, ttlSec) {
      await redis.eval(HSET_EXPIRE, [prefixed(key)], [field, value, String(ttlSec)]);
    },
  };
}
