import { describe, expect, it } from "vitest";
import { expandAnswer, routeQuestion, selectSign, type ChatFn } from "./generate";
import type { BookEntry, BookSection, SignPayload } from "../shared/types";

const entry: BookEntry = {
  id: "15-1", section_no: 15, section_title: "租房与买房", item_no: 1,
  title: "房东不退押金", cost: { money: "0", time: "少", will: "否" },
  benefit: { level: "中", metric: "金钱" }, evidence: "A",
  cost_text: "不花钱。", plain: "押金应当退还，先看合同。", gain_text: "可以要求返还。",
  source_text: "民法典. <https://example.com>", source_links: ["https://example.com"],
  notes: "", population: [], ratio: "一般", dispute: false, todo: false,
};
const section: BookSection = { no: 15, title: "租房与买房", intro: "", entries: [entry] };

const routeChat: ChatFn = async () => JSON.stringify({ sections: [15], confidence: 0.9 });
const signChat: ChatFn = async () => JSON.stringify({
  mode: "sign",
  sign: { entry_id: "15-1", text: "先看合同里的押金条款" },
  candidates: ["15-1"],
});
const expandChat: ChatFn = async () => JSON.stringify({
  actions: [{ entry_id: "15-1", action: "先看合同", cost: "不花钱", benefit: "中", evidence: "A" }],
  avoid: [],
  not_covered: "书里没写诉讼时效。",
  refer: "协商不成找律师。",
  recheck: "一个月后还没退再看一次。",
});

describe("generate", () => {
  it("parses section routing", async () => {
    await expect(routeQuestion(routeChat, "房东不退押金", [section])).resolves.toEqual({ sections: [15], confidence: 0.9 });
  });

  it("builds a sign with a real citation", async () => {
    const result = await selectSign(signChat, "房东不退押金", [entry]);
    expect(result.mode).toBe("sign");
    expect(result.sign?.entry_id).toBe("15-1");
    expect(result.sign?.citation).toBe("第 15 节第 1 条（房东不退押金）");
    expect(result.sign?.source_links).toEqual(["https://example.com"]);
  });

  it("falls back to the top candidate when the model invents an id", async () => {
    const badChat: ChatFn = async () => JSON.stringify({
      mode: "sign", sign: { entry_id: "99-9", text: "随便" }, candidates: [],
    });
    const result = await selectSign(badChat, "房东不退押金", [entry]);
    expect(result.sign?.entry_id).toBe("15-1");
  });

  it("carries a short guarded summary from the sign call", async () => {
    const summaryChat: ChatFn = async () => JSON.stringify({
      mode: "sign",
      summary: "先看检查报告的分级，再找专科医生",
      sign: { entry_id: "15-1", text: "房东不退押金" },
      candidates: ["15-1"],
    });
    const result = await selectSign(summaryChat, "房东不退押金", [entry]);
    expect(result.summary).toBe("先看检查报告的分级，再找专科医生");
  });

  it("drops numeric or absolute summaries", async () => {
    const make = (summary: string): ChatFn => async () => JSON.stringify({
      mode: "sign",
      summary,
      sign: { entry_id: "15-1", text: "房东不退押金" },
      candidates: ["15-1"],
    });
    await expect(selectSign(make("先准备 5000 元"), "房东不退押金", [entry])).resolves.toMatchObject({ summary: undefined });
    await expect(selectSign(make("一定能拿回押金"), "房东不退押金", [entry])).resolves.toMatchObject({ summary: undefined });
  });

  it("filters invalid expand actions", async () => {
    const badChat: ChatFn = async () => JSON.stringify({
      actions: [{ entry_id: "99-9", action: "编的", cost: "", benefit: "", evidence: "A" }],
      avoid: [], not_covered: "", refer: "", recheck: "",
    });
    const sign: SignPayload = {
      entry_id: "15-1", text: "先看合同", plain: "押金应当退还。",
      cost: entry.cost, benefit: entry.benefit, evidence: "A",
      citation: "第 15 节第 1 条（房东不退押金）", source_text: entry.source_text, source_links: entry.source_links,
    };
    const result = await expandAnswer(badChat, "房东不退押金", sign, [entry]);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].entry_id).toBe("15-1");
    expect(result.degraded).toBe(true);
  });
});
