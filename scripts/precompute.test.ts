import { describe, expect, it } from "vitest";
import { buildCuratedCache, buildDailySigns } from "./precompute";
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

describe("precompute", () => {
  it("builds deterministic daily signs", () => {
    const days = buildDailySigns(book, 3);
    expect(days).toHaveLength(3);
    expect(days[0].sign.entry_id).toBe("1-1");
    expect(days[0].sign.citation).toBe("第 1 节第 1 条（把家里的食盐换成低钠盐）");
  });
  it("builds a curated cache keyed by the normalized question", () => {
    const cache = buildCuratedCache(book, ["吃盐怎么选？"]);
    expect(cache["吃盐怎么选"].entry_id).toBe("1-1");
  });
});
