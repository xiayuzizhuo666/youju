const DAY = 24 * 60 * 60 * 1000;
const SHANGHAI_OFFSET = 8 * 60 * 60 * 1000;

export interface LimiterOptions {
  now?: () => number;
  maxPerIp?: number;
  maxGlobal?: number;
}

export interface Limiter {
  allow(ip: string): boolean;
  remaining(ip: string): number;
  /** Milliseconds until the next Beijing-midnight reset, when known. */
  retryAfterMs?(): number;
}

/** Count quota against the Beijing calendar day, not the UTC day. */
function dayIndex(now: number): number {
  return Math.floor((now + SHANGHAI_OFFSET) / DAY);
}

export function createLimiter(options: LimiterOptions = {}): Limiter {
  const now = options.now ?? Date.now;
  const maxPerIp = options.maxPerIp ?? 30;
  const maxGlobal = options.maxGlobal ?? 500;
  let day = dayIndex(now());
  let global = 0;
  const perIp = new Map<string, number>();

  function resetIfNeeded(current: number) {
    const nextDay = dayIndex(current);
    if (nextDay !== day) {
      day = nextDay;
      global = 0;
      perIp.clear();
    }
  }

  return {
    allow(ip: string): boolean {
      const current = now();
      resetIfNeeded(current);
      if (global >= maxGlobal) return false;
      const count = perIp.get(ip) ?? 0;
      if (count >= maxPerIp) return false;
      perIp.set(ip, count + 1);
      global += 1;
      return true;
    },
    remaining(ip: string): number {
      resetIfNeeded(now());
      return Math.max(0, maxPerIp - (perIp.get(ip) ?? 0));
    },
    retryAfterMs(): number {
      const current = now();
      resetIfNeeded(current);
      const nextReset = (dayIndex(current) + 1) * DAY - SHANGHAI_OFFSET;
      return Math.max(0, nextReset - current);
    },
  };
}
