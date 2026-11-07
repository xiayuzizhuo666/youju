import { describe, expect, it } from "vitest";
import { HISTORY_KEY, createHistoryStore, localDate, type HistoryStorage } from "./history";
import type { SignPayload } from "../shared/types";

const sign: SignPayload = {
  entry_id: "15-1",
  text: "先看合同",
  plain: "押金应当退还。",
  cost: { money: "0", time: "少", will: "否" },
  benefit: { level: "中", metric: "金钱" },
  evidence: "A",
  citation: "第 15 节第 1 条（房东不退押金）",
  source_text: "民法典. <https://example.com>",
  source_links: ["https://example.com"],
};

function memoryStorage(options: { failWrite?: boolean } = {}): HistoryStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      if (options.failWrite) throw new Error("quota");
      map.set(key, value);
    },
    removeItem: (key) => { map.delete(key); },
  };
}

const atNoon = (year: number, month: number, day: number) => new Date(year, month - 1, day, 12).getTime();

describe("history", () => {
  it("records a sign and lists it newest first", () => {
    const store = createHistoryStore(memoryStorage());
    store.record("房东不退押金怎么办", sign, atNoon(2026, 11, 7));
    store.record("被裁了第一步做什么", { ...sign, entry_id: "19-4" }, atNoon(2026, 11, 8));
    expect(store.list().map((item) => item.entryId)).toEqual(["19-4", "15-1"]);
  });

  it("deduplicates the same entry and question", () => {
    const store = createHistoryStore(memoryStorage());
    store.record("房东不退押金怎么办", sign, atNoon(2026, 11, 7));
    store.record("房东不退押金怎么办", sign, atNoon(2026, 11, 8));
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].savedAt).toBe(atNoon(2026, 11, 8));
  });

  it("keeps at most 20 items", () => {
    const store = createHistoryStore(memoryStorage());
    for (let index = 0; index < 25; index += 1) {
      store.record(`问题 ${index}`, { ...sign, entry_id: `15-${index}` }, atNoon(2026, 11, 7) + index);
    }
    expect(store.list()).toHaveLength(20);
    expect(store.list()[0].entryId).toBe("15-24");
  });

  it("counts consecutive local days, including a streak that ended yesterday", () => {
    const store = createHistoryStore(memoryStorage());
    store.record("今天", sign, atNoon(2026, 11, 8));
    store.record("昨天", { ...sign, entry_id: "15-2" }, atNoon(2026, 11, 7));
    store.record("前天", { ...sign, entry_id: "15-3" }, atNoon(2026, 11, 6));
    expect(store.streak(atNoon(2026, 11, 8))).toBe(3);
    expect(store.streak(atNoon(2026, 11, 9))).toBe(3);
  });

  it("returns zero when neither today nor yesterday was recorded", () => {
    const store = createHistoryStore(memoryStorage());
    store.record("很久以前", sign, atNoon(2026, 10, 1));
    expect(store.streak(atNoon(2026, 11, 8))).toBe(0);
  });

  it("ignores corrupt storage and can clear it", () => {
    const storage = memoryStorage();
    storage.map.set(HISTORY_KEY, "{not json");
    const store = createHistoryStore(storage);
    expect(store.list()).toEqual([]);
    store.record("房东不退押金怎么办", sign, atNoon(2026, 11, 8));
    expect(store.list()).toHaveLength(1);
    store.clear();
    expect(store.list()).toEqual([]);
  });

  it("does not throw when storage refuses writes", () => {
    const store = createHistoryStore(memoryStorage({ failWrite: true }));
    expect(() => store.record("房东不退押金怎么办", sign, atNoon(2026, 11, 8))).not.toThrow();
  });

  it("formats a local date without shifting the day", () => {
    expect(localDate(atNoon(2026, 1, 2))).toBe("2026-01-02");
  });
});
