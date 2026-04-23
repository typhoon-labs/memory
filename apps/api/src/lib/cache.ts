/** Simple in-memory TTL cache for dashboard API responses. */
class MemoryCache {
  private store = new Map<string, { data: unknown; expiresAt: number }>();

  /** Get a cached value. Returns `undefined` on miss or expiry. */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  /** Set a value with a TTL in milliseconds (default 60s). */
  set(key: string, data: unknown, ttlMs = 60_000): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  /** Delete all keys matching a prefix. */
  invalidate(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  /** Number of entries currently in the cache (includes expired but not yet evicted). */
  get size(): number {
    return this.store.size;
  }
}

export const dashboardCache = new MemoryCache();
