import { describe, expect, it, vi } from "vitest";
import { expandAnswer, routeQuestion, selectSign, type ChatFn } from "./generate";
import { expandUser, signUser } from "./prompts";
import { hasAbsoluteClaim, hasVerdict, unsupportedClaims } from "./guard";
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
const verdictTitled: BookEntry = { ...entry, title: "不要签这一条" };

const sign: SignPayload = {
  entry_id: "15-1", text: "先看合同", plain: entry.plain,
  cost: entry.cost, benefit: entry.benefit, evidence: "A",
  citation: "第 15 节第 1 条（房东不退押金）", source_text: entry.source_text, source_links: entry.source_links,
};

describe("generate regression: absolute claims", () => {
  it("rejects an absolute model sign text and keeps the entry citation", async () => {
    const chat: ChatFn = async () => JSON.stringify({
      mode: "sign", sign: { entry_id: "15-1", text: "一定能拿回押金" }, candidates: ["15-1"],
    });
    const result = await selectSign(chat, "房东不退押金", [entry]);
    expect(result.mode).toBe("sign");
    expect(result.sign?.entry_id).toBe("15-1");
    expect(hasAbsoluteClaim(result.sign!.text)).toBe(false);
    expect(result.sign?.citation).toBe("第 15 节第 1 条（房东不退押金）");
    expect(result.sign?.source_links).toEqual(["https://example.com"]);
  });

  it("filters an absolute expansion action and keeps it out of the fallback", async () => {
    const chat: ChatFn = async () => JSON.stringify({
      actions: [{ entry_id: "15-1", action: "一定要先体检", cost: "不花钱", benefit: "中", evidence: "A" }],
      avoid: [], not_covered: "", refer: "", recheck: "",
    });
    const result = await expandAnswer(chat, "房东不退押金", sign, [entry]);
    expect(result.actions.some((action) => action.action.includes("一定要"))).toBe(false);
    expect(result.actions[0].action).toBe("房东不退押金");
  });

  it("blanks absolute model text in not_covered, refer, and recheck", async () => {
    const chat: ChatFn = async () => JSON.stringify({
      actions: [], avoid: [],
      not_covered: "一定不会输", refer: "保证能要回来", recheck: "必然有效",
    });
    const result = await expandAnswer(chat, "房东不退押金", sign, [entry]);
    expect(result.not_covered).toBe("");
    expect(result.refer).toBe("");
    expect(result.recheck).toBe("");
  });
});

describe("generate regression: verdict titles", () => {
  it("uses the neutral headline when model text and entry title are both verdicts", async () => {
    const chat: ChatFn = async () => JSON.stringify({
      mode: "sign", sign: { entry_id: "15-1", text: "建议离婚" }, candidates: ["15-1"],
    });
    const result = await selectSign(chat, "这婚要不要离", [verdictTitled]);
    expect(result.sign?.text).toBe("先看第 15 节第 1 条");
    expect(hasVerdict(result.sign!.text)).toBe(false);
    expect(result.sign?.citation).toBe("第 15 节第 1 条（不要签这一条）");
  });

  it("does not put a verdict title into the expansion fallback", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const failing: ChatFn = async () => {
        throw new Error("boom");
      };
      const result = await expandAnswer(failing, "这婚要不要离", sign, [verdictTitled]);
      expect(result.actions[0].action).toBe("先看第 15 节第 1 条");
      expect(hasVerdict(result.actions[0].action)).toBe(false);
      expect(warn).toHaveBeenCalled();
      const logged = warn.mock.calls.flat().join(" ");
      expect(logged).toContain("generate_expand_failed");
      expect(logged).not.toContain("这婚要不要离");
    } finally {
      warn.mockRestore();
    }
  });
});

describe("generate regression: routing", () => {
  it("ignores a hallucinated section and falls back to the supplied sections", async () => {
    const chat: ChatFn = async () => JSON.stringify({ sections: [99], confidence: 0.9 });
    await expect(routeQuestion(chat, "房东不退押金", [section])).resolves.toEqual({ sections: [15], confidence: 0 });
  });
});

describe("generate regression: prompt scaffolding", () => {
  it("expandUser emits exactly one candidate header and no dangling question label", () => {
    const prompt = expandUser("房东不退押金", sign, [entry]);
    expect(prompt.match(/候选条目：/g)).toHaveLength(1);
    expect(prompt.match(/用户问题：/g)).toHaveLength(1);
    expect(prompt.endsWith("用户问题：")).toBe(false);
    expect(signUser("房东不退押金", [entry]).match(/候选条目：/g)).toHaveLength(1);
  });
});

describe("generate regression: guard corpus", () => {
  it("treats entry ids and section numbers as supported tokens", () => {
    expect(unsupportedClaims("看 15-1 那条", [entry])).toEqual([]);
    expect(unsupportedClaims("按第 15 节先看", [entry])).toEqual([]);
  });
});
