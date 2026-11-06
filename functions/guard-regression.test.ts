import { describe, expect, it } from "vitest";
import { classifyTriage, hasVerdict, unsupportedClaims } from "./guard";
import type { BookEntry } from "../shared/types";

const baseEntry: BookEntry = {
  id: "15-1", section_no: 15, section_title: "租房与买房", item_no: 1,
  title: "房东不退押金", cost: { money: "0", time: "少", will: "否" },
  benefit: { level: "中", metric: "金钱" }, evidence: "A",
  cost_text: "不花钱。", plain: "押金应当退还。", gain_text: "可以要求返还。",
  source_text: "民法典. <https://example.com>", source_links: ["https://example.com"],
  notes: "", population: [], ratio: "一般", dispute: false, todo: false,
};

function withSource(source_text: string): BookEntry {
  return { ...baseEntry, source_text };
}

const EMERGENCY_PHRASES = [
  "家里着火了",
  "路上出车祸了",
  "他突然晕倒了",
  "他休克了",
  "我呼吸困难",
  "我妈抽搐不止",
  "孩子误吞了药",
];

const SUICIDE_PHRASES = [
  "我想死",
  "我想跳楼",
  "我想吃安眠药",
  "我想不开",
  "我活够了",
  "活着没意思",
  "我想割腕",
  "有人跳楼了",
];

describe("triage regression: emergency phrasing", () => {
  it.each(EMERGENCY_PHRASES)("routes %s as emergency", (question) => {
    expect(classifyTriage(question)).toBe("emergency");
  });
  it("keeps the prescribed chest-pain case as emergency", () => {
    expect(classifyTriage("我突然胸痛，喘不上气")).toBe("emergency");
  });
});

describe("triage regression: suicide phrasing", () => {
  it.each(SUICIDE_PHRASES)("routes %s as suicide", (question) => {
    expect(classifyTriage(question)).toBe("suicide");
  });
});

describe("triage regression: legal precision", () => {
  it("does not triage lawyer-letter or notification wording", () => {
    expect(classifyTriage("房东不退押金，律师函有用吗")).toBeNull();
    expect(classifyTriage("我刚被告知要调岗")).toBeNull();
  });
  it("still routes personal-safety and detention wording", () => {
    expect(classifyTriage("男朋友打我，我该怎么办？")).toBe("legal");
    expect(classifyTriage("我被拘留了")).toBe("legal");
  });
});

describe("verdict regression: common directive wording", () => {
  it.each([
    "建议你离婚",
    "建议先离婚",
    "赶紧离婚",
    "不要急着签",
    "分手吧",
    "辞职吧",
    "建议离婚",
    "不要签",
  ])("flags %s", (text) => {
    expect(hasVerdict(text)).toBe(true);
  });
  it("does not flag viewpoint text", () => {
    expect(hasVerdict("先看你自己在这段关系里的感受")).toBe(false);
  });
});

describe("citation regression: digit boundaries", () => {
  it("does not treat a short number as supported by a longer corpus number", () => {
    const entry = withSource("2025 年数据。");
    expect(unsupportedClaims("可以要求 2 倍赔偿", [entry])).toEqual(["2"]);
    expect(unsupportedClaims("2025 年数据", [entry])).toEqual([]);
  });
  it("matches supported law citations regardless of spacing", () => {
    const entry = withSource("民法典第 999 条。");
    expect(unsupportedClaims("第999条", [entry])).toEqual([]);
  });
});
