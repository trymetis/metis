import "server-only";
import { createClient } from "redis";

import type { RedisCacheConfig } from "@/config/schema";

import { HSET_EXPIRE, INCR_EXPIRE } from "../lua-scripts";
import type { CacheDriver } from "../types";

function supportsIncrex(info: string) {
  if (
    /^valkey_version:/m.test(info) ||
    /^server_name:valkey/m.test(info) ||
    /^dragonfly_version:/m.test(info)
  ) {
    return false;
  }
  const match = /^redis_version:(\d+)\.(\d+)/m.exec(info);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 8 || (major === 8 && minor >= 8);
}

const PREFIX = "metis:";

function prefixed(key: string) {
  return `${PREFIX}${key}`;
}

export function createRedisDriver(cfg: RedisCacheConfig): CacheDriver {
  const redis = createClient({ url: cfg.url });
  redis.on("error", (err) => {
    console.error("[cache/redis]", err);
  });
  let connecting: Promise<void> | undefined;
  let useIncrex = false;

  async function connected() {
    if (redis.isOpen) return redis;
    connecting ??= redis.connect().then(
      () => undefined,
      (err: unknown) => {
        connecting = undefined;
        throw err;
      },
    );
    await connecting;
    return redis;
  }

  return {
    async warmup() {
      const c = await connected();
      useIncrex = supportsIncrex(await c.info("SERVER"));
    },
    async close() {
      if (redis.isOpen) await redis.close();
    },
    async get(key) {
      const c = await connected();
      return c.get(prefixed(key));
    },
    async getAndDelete(key) {
      const c = await connected();
      return c.getDel(prefixed(key));
    },
    async set(key, value, ttlSec) {
      const c = await connected();
      const k = prefixed(key);
      if (ttlSec !== undefined) {
        await c.set(k, value, { expiration: { type: "EX", value: ttlSec } });
      } else {
        await c.set(k, value);
      }
    },
    async del(key) {
      const c = await connected();
      await c.del(prefixed(key));
    },
    async incr(key, ttlSec) {
      const c = await connected();
      const k = prefixed(key);
      if (useIncrex) {
        const [n] = await c.increx(k, {
          expiration: { type: "EX", value: ttlSec, ENX: true },
        });
        return Number(n);
      }
      return Number(
        await c.eval(INCR_EXPIRE, {
          keys: [k],
          arguments: [String(ttlSec)],
        }),
      );
    },
    async hget(key, field) {
      const c = await connected();
      return (await c.hGet(prefixed(key), field)) ?? null;
    },
    async hmget(key, fields) {
      if (fields.length === 0) return [];
      const c = await connected();
      return c.hmGet(prefixed(key), fields);
    },
    async hsetExpiring(key, field, value, ttlSec) {
      const c = await connected();
      await c.eval(HSET_EXPIRE, {
        keys: [prefixed(key)],
        arguments: [field, value, String(ttlSec)],
      });
    },
  };
}
