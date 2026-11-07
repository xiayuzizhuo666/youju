import { describe, expect, it } from "vitest";
import { decodeSignToken } from "./token";
import type { SignTokenPayload } from "../shared/types";

const payload: SignTokenPayload = {
  q: "房东不退押金怎么办",
  s: {
    entry_id: "15-1",
    text: "租房时押金的数额、退还时间和扣减情形，必须写进合同",
    plain: "押金不是房东的违约金。",
    cost: { money: "少", time: "少", will: "否" },
    benefit: { level: "大", metric: "押金损失" },
    evidence: "A",
    citation: "第 15 节第 1 条（签合同前弄清押金条款）",
    source_text: "民法典第 704 条、第 710 条。",
    source_links: ["https://example.com/civil-code"],
  },
  c: ["15-1"],
  exp: 1_800_000_000_000,
};

function encodeBody(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

describe("decodeSignToken", () => {
  it("round-trips a valid token with a signature suffix", () => {
    const token = `${encodeBody(JSON.stringify(payload))}.deadbeef`;
    expect(decodeSignToken(token)).toEqual(payload);
  });
  it("returns null for malformed base64", () => {
    expect(decodeSignToken("!!!not-base64!!!")).toBeNull();
  });
  it("returns null for malformed JSON", () => {
    expect(decodeSignToken(encodeBody("not json"))).toBeNull();
  });
  it("returns null for an empty JSON object", () => {
    expect(decodeSignToken("e30")).toBeNull();
  });
  it("returns null when q or s has the wrong shape", () => {
    expect(decodeSignToken(encodeBody(JSON.stringify({ q: 1, s: {} })))).toBeNull();
    expect(decodeSignToken(encodeBody(JSON.stringify({ q: "问题", s: null })))).toBeNull();
    expect(decodeSignToken(encodeBody(JSON.stringify({ q: "问题", s: [] })))).toBeNull();
  });
});
