import { describe, expect, it } from "vitest";
import { decodeSignToken } from "./token";
import type { SignTokenPayload } from "../shared/types";

const payload: SignTokenPayload = {
  q: "房东不退押金怎么办",
  id: "15-1",
  c: ["15-1", "15-2"],
  exp: 1_800_000_000_000,
};

function encodeBody(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

describe("decodeSignToken", () => {
  it("decodes only the compact envelope", () => {
    const token = `${encodeBody(JSON.stringify(payload))}~deadbeef`;
    expect(decodeSignToken(token)).toEqual(payload);
  });
  it("round-trips a valid token with a signature suffix", () => {
    const token = `${encodeBody(JSON.stringify(payload))}~deadbeef`;
    expect(decodeSignToken(token)).toMatchObject({ q: payload.q, id: payload.id });
  });
  it("does not trust a sign payload in the token", () => {
    const forged = { q: "问题", id: "15-1", c: ["15-1"], exp: payload.exp, s: { entry_id: "15-1", text: "伪造的签" } };
    const decoded = decodeSignToken(encodeBody(JSON.stringify(forged)));
    expect(decoded).toEqual({ q: "问题", id: "15-1", c: ["15-1"], exp: payload.exp });
    expect(decoded && "s" in decoded).toBe(false);
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
  it("returns null when the compact fields have the wrong shape", () => {
    expect(decodeSignToken(encodeBody(JSON.stringify({ q: 1, id: "15-1", c: [], exp: 1 })))).toBeNull();
    expect(decodeSignToken(encodeBody(JSON.stringify({ q: "问题", c: [], exp: 1 })))).toBeNull();
    expect(decodeSignToken(encodeBody(JSON.stringify({ q: "问题", id: "", c: [], exp: 1 })))).toBeNull();
    expect(decodeSignToken(encodeBody(JSON.stringify({ q: "问题", id: "15-1", c: "15-1", exp: 1 })))).toBeNull();
    expect(decodeSignToken(encodeBody(JSON.stringify({ q: "问题", id: "15-1", c: [1], exp: 1 })))).toBeNull();
    expect(decodeSignToken(encodeBody(JSON.stringify({ q: "问题", id: "15-1", c: [], exp: "soon" })))).toBeNull();
  });
  it("rejects the legacy sign-payload shape without a chosen id", () => {
    expect(decodeSignToken(encodeBody(JSON.stringify({
      q: "问题",
      s: { entry_id: "15-1", text: "先看合同", citation: "第 15 节第 1 条", cost: {}, benefit: {} },
      c: ["15-1"],
      exp: payload.exp,
    })))).toBeNull();
  });
});
