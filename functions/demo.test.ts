import { describe, expect, it } from "vitest";
import { createLimiter } from "./demo";

describe("createLimiter", () => {
  it("limits per ip and globally", () => {
    let now = 0;
    const limiter = createLimiter({ now: () => now, maxPerIp: 2, maxGlobal: 3 });
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
    expect(limiter.allow("b")).toBe(true);
    expect(limiter.allow("c")).toBe(false);
    now += 24 * 60 * 60 * 1000;
    expect(limiter.allow("a")).toBe(true);
  });

  it("resets at Beijing midnight and reports the wait", () => {
    let now = Date.UTC(2026, 10, 7, 15, 59, 0);
    const limiter = createLimiter({ now: () => now, maxPerIp: 1, maxGlobal: 10 });
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
    expect(limiter.retryAfterMs?.()).toBe(60_000);
    now = Date.UTC(2026, 10, 7, 16, 0, 0);
    expect(limiter.allow("a")).toBe(true);
  });
});
