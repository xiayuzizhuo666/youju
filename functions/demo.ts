const DAY = 24 * 60 * 60 * 1000;

export interface LimiterOptions {
  now?: () => number;
  maxPerIp?: number;
  maxGlobal?: number;
}

export function createLimiter(options: LimiterOptions = {}) {
  const now = options.now ?? Date.now;
  const maxPerIp = options.maxPerIp ?? 30;
  const maxGlobal = options.maxGlobal ?? 500;
  let day = Math.floor(now() / DAY);
  let global = 0;
  const perIp = new Map<string, number>();

  function resetIfNeeded(current: number) {
    const nextDay = Math.floor(current / DAY);
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
  };
}
