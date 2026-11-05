export type CacheDriverKind = "memory" | "redis" | "upstash";

export interface CacheDriver {
  warmup(): Promise<void>;
  close(): Promise<void>;
  get(key: string): Promise<string | null>;
  getAndDelete(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string, ttlSec: number): Promise<number>;
  hget(key: string, field: string): Promise<string | null>;
  hmget(key: string, fields: string[]): Promise<(string | null)[]>;
  hsetExpiring(key: string, field: string, value: string, ttlSec: number): Promise<void>;
}
