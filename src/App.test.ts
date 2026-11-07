import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DISCLAIMER } from "../shared/disclaimer";

describe("global footer", () => {
  const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

  it("renders the required general-disclaimer line", () => {
    expect(DISCLAIMER).toBe("通用口径，不替代医生、律师、会计；政策以当地部门为准。");
    expect(source).toContain("<p>{DISCLAIMER}</p>");
  });

  it("keeps the attribution and non-official notice", () => {
    expect(source).toContain("内容来自《高性价比人生指南》，CC BY 4.0，有修改；不是官方版本。");
  });
});
