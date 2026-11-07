import { describe, expect, it } from "vitest";
import { cacheKey, createCache } from "./cache";

describe("cache", () => {
  it("stores, expires, and clears values", () => {
    let now = 1_000;
    const cache = createCache<string>({ ttlMs: 100, max: 2, now: () => now });
    cache.set("a", "A");
    expect(cache.get("a")).toBe("A");
    now = 1_101;
    expect(cache.get("a")).toBeNull();
    cache.set("b", "B");
    cache.clear();
    expect(cache.get("b")).toBeNull();
  });

  it("drops the oldest entry at capacity", () => {
    const cache = createCache<number>({ ttlMs: 1_000, max: 2, now: () => 0 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
    expect(cache.size()).toBe(2);
  });

  it("hashes keys deterministically without storing the question text", async () => {
    const first = await cacheKey(["房东不退押金怎么办"]);
    const second = await cacheKey(["房东不退押金怎么办"]);
    const other = await cacheKey(["被裁了第一步做什么"]);
    expect(first).toBe(second);
    expect(first).not.toBe(other);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain("押金");
  });
});
