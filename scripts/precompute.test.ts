import { describe, expect, it } from "vitest";
import { buildCuratedCacheFromMap, buildDailySigns } from "./precompute";
import type { BookData, BookEntry } from "../shared/types";

const entry: BookEntry = {
  id: "1-1", section_no: 1, section_title: "不要早死", item_no: 1,
  title: "把家里的食盐换成低钠盐", cost: { money: "少", time: "少", will: "否" },
  benefit: { level: "大", metric: "死亡率" }, evidence: "A",
  cost_text: "每袋贵几元。", plain: "死亡概率低约 12%。", gain_text: "脑卒中降 14%。",
  source_text: "Neal B, et al. (2021). NEJM. <https://doi.org/10.1056/NEJMoa2105675>",
  source_links: ["https://doi.org/10.1056/NEJMoa2105675"], notes: "",
  population: [], ratio: "极高", dispute: false, todo: false,
};
const book: BookData = {
  meta: { commit: "test", synced_at: "2026-11-07", total: 1, evidence: { A: 1, B: 0, C: 0 }, license: "CC BY 4.0" },
  sections: [{ no: 1, title: "不要早死", intro: "", entries: [entry] }],
  entries: [entry],
};

function bookWith(...entries: BookEntry[]): BookData {
  return {
    meta: { commit: "test", synced_at: "2026-11-07", total: entries.length, evidence: { A: 1, B: 0, C: 0 }, license: "CC BY 4.0" },
    sections: [{ no: 1, title: "不要早死", intro: "", entries }],
    entries,
  };
}

describe("precompute", () => {
  it("builds deterministic daily signs", () => {
    const days = buildDailySigns(book, 3);
    expect(days).toHaveLength(3);
    expect(days[0].sign.entry_id).toBe("1-1");
    expect(days[0].sign.citation).toBe("第 1 节第 1 条（把家里的食盐换成低钠盐）");
  });
  it("builds a curated cache from an explicit question to entry map", () => {
    const cache = buildCuratedCacheFromMap(book, [{ question: "吃盐怎么选？", entryId: "1-1" }]);
    expect(cache["吃盐怎么选"].entry_id).toBe("1-1");
    expect(cache["吃盐怎么选"].citation).toBe("第 1 节第 1 条（把家里的食盐换成低钠盐）");
  });
  it("throws when a curated entry id is missing", () => {
    expect(() => buildCuratedCacheFromMap(book, [{ question: "吃盐怎么选？", entryId: "9-9" }]))
      .toThrow("curated entry not found: 9-9");
  });
  it("keeps a 24-char prefix for a long safe title", () => {
    const longEntry: BookEntry = {
      ...entry,
      id: "2-1",
      title: "把家里的食盐换成低钠盐并且做菜时少放酱油和腌制品多吃新鲜蔬菜",
    };
    const cache = buildCuratedCacheFromMap(bookWith(longEntry), [{ question: "长标题", entryId: "2-1" }]);
    expect(cache["长标题"].text).toBe(longEntry.title.slice(0, 24));
    expect(cache["长标题"].text).not.toBe("先看第 1 节第 1 条");
  });
  it.each([
    ["verdict", "体检发现结节最好先做手术，别拖"],
    ["absolute", "吃了这个方子保证治愈不再复发"],
  ])("uses the neutral pointer for a %s title", (_kind, title) => {
    const flaggedEntry: BookEntry = { ...entry, id: "2-2", title };
    const cache = buildCuratedCacheFromMap(bookWith(flaggedEntry), [{ question: "敏感标题", entryId: "2-2" }]);
    expect(cache["敏感标题"].text).toBe("先看第 1 节第 1 条");
  });
  it("excludes disputed entries from the daily candidate pool", () => {
    const disputed: BookEntry = { ...entry, id: "1-2", dispute: true };
    const days = buildDailySigns(bookWith(entry, disputed), 4);
    expect(days).toHaveLength(4);
    for (const day of days) expect(day.sign.entry_id).toBe("1-1");
  });
});
