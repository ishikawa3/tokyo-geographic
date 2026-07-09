import { LRUCache } from "lru-cache";

const cache = new LRUCache<string, object>({
  max: 2000,
  ttl: 24 * 60 * 60 * 1000, // デフォルト24時間。setCached で個別指定可
});

export function getCached<T extends object>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

export function setCached(key: string, value: object, ttlMs?: number): void {
  cache.set(key, value, ttlMs !== undefined ? { ttl: ttlMs } : undefined);
}

export function clearCache(): void {
  cache.clear();
}
