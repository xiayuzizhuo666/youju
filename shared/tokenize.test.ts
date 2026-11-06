import { describe, expect, it } from "vitest";
import { tokenize } from "./tokenize";

describe("tokenize", () => {
  it("keeps Chinese words and bigrams", () => {
    const tokens = tokenize("房东不退押金怎么办？");
    expect(tokens.some((token) => token.includes("押金"))).toBe(true);
    expect(tokens).toContain("房东");
  });

  it("handles English and punctuation", () => {
    expect(tokenize("BMI 怎么算？")).toContain("bmi");
  });
});
