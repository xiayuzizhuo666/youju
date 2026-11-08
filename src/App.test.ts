import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DISCLAIMER } from "../shared/disclaimer";

describe("global footer", () => {
  const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

  it("renders the required general-disclaimer line", () => {
    expect(DISCLAIMER).toBe("通用口径，不替代医生、律师、会计；政策以当地部门为准。");
    expect(source).toContain("<p>{DISCLAIMER}</p>");
  });

  it("links to the answer-book explanation and keeps the footer minimal", () => {
    expect(source).toContain('href="/about"');
    expect(source).toContain("什么是答案之书");
    expect(source).toContain('href="/history"');
    expect(source).toContain("翻签记录");
    expect(source).not.toContain("CC BY 4.0");
    expect(source).not.toContain("内容来自");
  });

  it("keeps the minimal CC BY attribution on the about and share cards", () => {
    const about = readFileSync(new URL("../pages/About.tsx", import.meta.url), "utf8");
    const share = readFileSync(new URL("../components/ShareCard.tsx", import.meta.url), "utf8");
    for (const text of [about, share]) {
      expect(text).toContain("内容来自《高性价比人生指南》");
      expect(text).toContain("CC BY 4.0");
    }
    expect(about).toContain("不是官方版本");
    expect(about).toContain("有修改");
    expect(share).toContain("/qr.png");
    expect(share).toContain("github.com/eternity4719/HowToLiveBetter");
    expect(share).toContain("creativecommons.org/licenses/by/4.0/");
  });
});
