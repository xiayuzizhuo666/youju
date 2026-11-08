import { describe, expect, it } from "vitest";
import { healthSupportCandidates, isHealthQuestion, preferHealthEntry } from "./generate";
import type { BookEntry } from "../shared/types";

function entry(id: string, sectionNo: number, title: string): BookEntry {
  return {
    id,
    section_no: sectionNo,
    section_title: sectionNo === 24 ? "看病" : "反面清单",
    item_no: Number(id.split("-")[1]),
    title,
    cost: { money: "少", time: "少", will: "否" },
    benefit: { level: "大", metric: "健康" },
    evidence: "A",
    cost_text: "不花钱。",
    plain: title,
    gain_text: title,
    source_text: "example",
    source_links: [],
    notes: "",
    population: [],
    ratio: "高",
    dispute: false,
    todo: false,
  };
}

const generic = entry("6-18", 6, "不要靠通用体检套餐防病");
const gallstone = entry("6-20", 6, "不要因为体检查出胆囊结石、但从没疼过，就去预防性切胆囊");
const care = entry("24-5", 24, "每次看完病，把病历、检查报告和影像自己存一份");
const kidneyStone = entry("16-8", 16, "得过肾结石就把水喝到每天 2.5–3 升");
const tumorScreen = entry("6-7", 6, "不要给没有症状的自己做「全身 PET-CT」或「肿瘤标志物套餐」");
const tumorInsurance = entry("16-2", 16, "先办门诊慢特病认定再办异地备案，放化疗、透析、抗排异就能异地直接结算");
const sedentary = entry("2-1", 2, "久坐一天，每隔一小时起来走两分钟");
const relaxation = entry("22-1", 22, "心情差到抑郁的程度，就去走或者跑");

describe("health relevance", () => {
  it("detects health questions without treating unrelated questions as health", () => {
    expect(isHealthQuestion("体检发现结节要不要手术？")).toBe(true);
    expect(isHealthQuestion("房东不退押金怎么办？")).toBe(false);
  });

  it("adds care-navigation candidates when routing did not include section 24", () => {
    const candidates = healthSupportCandidates("体检发现结节要不要手术？", [generic], [generic, care]);
    expect(candidates.map((item) => item.id)).toEqual(["6-18", "24-5"]);
  });

  it("adds a whole-book direct condition match even when routing chose section 24", () => {
    const candidates = healthSupportCandidates("胆囊结石要不要切胆囊？", [care], [care, gallstone, kidneyStone]);
    expect(candidates.map((item) => item.id)).toContain("6-20");
  });

  it("adds care entries even when another section-24 entry is already present", () => {
    const otherCare = entry("24-1", 24, "常见病先在社区看，经基层逐级转诊上去");
    const candidates = healthSupportCandidates("体检报告说可能是肿瘤", [otherCare], [otherCare, care, tumorScreen]);
    expect(candidates.map((item) => item.id)).toContain("24-5");
  });

  it("prefers a care-navigation entry when no candidate mentions the specific condition", () => {
    expect(preferHealthEntry("体检发现结节要不要手术？", generic, [generic, care]).id).toBe("24-5");
  });

  it("keeps a candidate that directly mentions the condition", () => {
    expect(preferHealthEntry("胆囊结石要不要切胆囊？", generic, [generic, gallstone]).id).toBe("6-20");
  });

  it("routes a sedentary question to a movement entry instead of a mood entry", () => {
    expect(preferHealthEntry("久坐一天怎么动？", relaxation, [relaxation, sedentary]).id).toBe("2-1");
  });

  it("prefers care navigation for a possible diagnosis over a screening reminder", () => {
    expect(preferHealthEntry("体检报告说可能是肿瘤", tumorScreen, [tumorScreen, care]).id).toBe("24-5");
  });

  it("does not keep an insurance procedure that only mentions the condition in its body", () => {
    expect(preferHealthEntry("体检报告说可能是肿瘤", tumorInsurance, [tumorInsurance, care]).id).toBe("24-5");
  });

  it("keeps a screening entry when the question itself is about screening", () => {
    expect(preferHealthEntry("体检套餐要不要做", tumorScreen, [tumorScreen, care]).id).toBe("6-7");
  });

  it("prefers the organ-specific candidate over a same-token distractor", () => {
    expect(preferHealthEntry("胆囊结石要不要切胆囊？", kidneyStone, [kidneyStone, gallstone]).id).toBe("6-20");
    expect(preferHealthEntry("肾结石要不要喝水？", gallstone, [gallstone, kidneyStone]).id).toBe("16-8");
  });

  it("does not alter a non-health choice", () => {
    expect(preferHealthEntry("房东不退押金怎么办？", generic, [generic, care]).id).toBe("6-18");
  });
});
