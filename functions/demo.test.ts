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
});
