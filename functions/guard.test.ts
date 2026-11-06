import { describe, expect, it } from "vitest";
import { classifyTriage, hasAbsoluteClaim, hasVerdict, unsupportedClaims } from "./guard";
import type { BookEntry } from "../shared/types";

const entry = {
  id: "15-1", section_no: 15, section_title: "租房与买房", item_no: 1,
  title: "房东不退押金", cost: { money: "0", time: "少", will: "否" },
  benefit: { level: "中", metric: "金钱" }, evidence: "A" as const,
  cost_text: "不花钱。", plain: "押金应当退还。", gain_text: "可以要求返还。",
  source_text: "民法典. <https://example.com>", source_links: ["https://example.com"],
  notes: "", population: [], ratio: "一般" as const, dispute: false, todo: false,
};

describe("triage", () => {
  it("routes emergencies first", () => {
    expect(classifyTriage("我突然胸痛，喘不上气")).toBe("emergency");
  });
  it("routes suicide risk", () => {
    expect(classifyTriage("我不想活了")).toBe("suicide");
  });
  it("routes legal proceedings", () => {
    expect(classifyTriage("我被拘留了")).toBe("legal");
  });
  it("does not triage ordinary questions", () => {
    expect(classifyTriage("房东不退押金怎么办")).toBeNull();
  });
});

describe("guards", () => {
  it("rejects verdict-style sign text", () => {
    expect(hasVerdict("建议离婚")).toBe(true);
    expect(hasVerdict("不要签")).toBe(true);
    expect(hasVerdict("先看你自己在这段关系里的感受")).toBe(false);
  });
  it("rejects absolute claims", () => {
    expect(hasAbsoluteClaim("一定能治好")).toBe(true);
    expect(hasAbsoluteClaim("可能降低风险")).toBe(false);
  });
  it("finds unsupported numbers and law articles", () => {
    const text = "押金应当退还，胜诉率 90%，依据民法典第 999 条。";
    expect(unsupportedClaims(text, [entry])).toEqual(["90%", "第 999 条"]);
  });
});
