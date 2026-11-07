import { afterEach, describe, expect, it, vi } from "vitest";
import { expand } from "./api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe("api timeouts", () => {
  it("gives expand 20 seconds instead of the default 12", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    }) as unknown as typeof fetch;

    const pending = expand("token").catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(8_000);
    expect(signal?.aborted).toBe(true);
    const error = await pending;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("这次等太久了，再试一次。");
  });
});
