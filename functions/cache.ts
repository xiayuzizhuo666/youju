export interface CacheOptions {
  ttlMs: number;
  max: number;
  now?: () => number;
}

export interface ResultCache<T> {
  get(key: string): T | null;
  set(key: string, value: T): void;
  clear(): void;
  size(): number;
}

/** Small in-memory TTL cache. Entries are dropped at capacity in insertion order. */
export function createCache<T>(options: CacheOptions): ResultCache<T> {
  const now = options.now ?? Date.now;
  const entries = new Map<string, { value: T; expires: number }>();

  return {
    get(key: string): T | null {
      const hit = entries.get(key);
      if (!hit) return null;
      if (hit.expires <= now()) {
        entries.delete(key);
        return null;
      }
      return hit.value;
    },
    set(key: string, value: T): void {
      if (entries.size >= options.max) {
        const oldest = entries.keys().next().value;
        if (oldest) entries.delete(oldest);
      }
      entries.set(key, { value, expires: now() + options.ttlMs });
    },
    clear(): void {
      entries.clear();
    },
    size(): number {
      return entries.size;
    },
  };
}

/**
 * Cache keys are digests, not question text: the process keeps no plaintext
 * questions beyond the request that created them.
 */
export async function cacheKey(parts: string[]): Promise<string> {
  const data = new TextEncoder().encode(parts.join("\u0000"));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
