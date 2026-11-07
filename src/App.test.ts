import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DISCLAIMER } from "../shared/disclaimer";

describe("global footer", () => {
  const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

  it("renders the required general-disclaimer line", () => {
    expect(DISCLAIMER).toBe("通用口径，不替代医生、律师、会计；政策以当地部门为准。");
    expect(source).toContain("<p>{DISCLAIMER}</p>");
  });

  it("links to the answer-book explanation and carries no source attribution", () => {
    expect(source).toContain('href="/about"');
    expect(source).toContain("什么是答案之书");
    expect(source).toContain('href="/history"');
    expect(source).toContain("翻签记录");
    expect(source).not.toContain("CC BY 4.0");
    expect(source).not.toContain("内容来自");
  });
});
