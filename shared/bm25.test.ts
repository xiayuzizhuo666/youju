import { describe, expect, it } from "vitest";
import { buildIndex, indexFor, retrieve, search } from "./bm25";
import type { BookEntry } from "./types";

function entry(partial: Partial<BookEntry> & Pick<BookEntry, "id" | "title">): BookEntry {
  return {
    section_no: 15, section_title: "租房与买房", item_no: 1,
    cost: { money: "0", time: "少", will: "否" },
    benefit: { level: "中", metric: "金钱" },
    evidence: "A", cost_text: "", plain: "", gain_text: "", source_text: "",
    source_links: [], notes: "", population: [], ratio: "一般", dispute: false, todo: false,
    ...partial,
  };
}

describe("bm25", () => {
  it("ranks the matching entry first", () => {
    const entries = [
      entry({ id: "15-1", title: "房东不退押金怎么办", plain: "押金应当退还，先看合同。" }),
      entry({ id: "10-1", title: "怎么判断这段关系好不好", plain: "看自己的感受。" }),
    ];
    const index = buildIndex(entries);
    const results = search(index, "押金不退", 5);
    expect(results[0].id).toBe("15-1");
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("retrieves candidates with a top score", () => {
    const entries = [entry({ id: "15-1", title: "房东不退押金怎么办", plain: "押金应当退还。" })];
    const result = retrieve(entries, "押金不退");
    expect(result.candidates[0].id).toBe("15-1");
    expect(result.topScore).toBeGreaterThan(0);
  });

  it("memoizes the index by entries array identity", () => {
    const entries = [
      entry({ id: "15-1", title: "房东不退押金怎么办", plain: "押金应当退还。" }),
      entry({ id: "10-1", title: "怎么判断这段关系好不好", plain: "看自己的感受。" }),
    ];
    expect(indexFor(entries)).toBe(indexFor(entries));
    expect(indexFor(entries)).not.toBe(buildIndex(entries));

    const first = retrieve(entries, "押金不退");
    const second = retrieve(entries, "押金不退");
    expect(second.candidates.map((candidate) => candidate.id)).toEqual(first.candidates.map((candidate) => candidate.id));
    expect(second.topScore).toBe(first.topScore);
  });
});
