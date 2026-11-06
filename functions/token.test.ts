import { describe, expect, it } from "vitest";
import { signToken, verifyToken } from "./token";
import type { SignTokenPayload } from "../shared/types";

const payload: SignTokenPayload = {
  q: "房东不退押金怎么办",
  s: {
    entry_id: "15-1", text: "先看合同", plain: "押金应当退还。",
    cost: { money: "0", time: "少", will: "否" }, benefit: { level: "中", metric: "金钱" },
    evidence: "A", citation: "第 15 节第 1 条（房东不退押金）",
    source_text: "", source_links: [],
  },
  c: ["15-1"],
  exp: Date.now() + 60_000,
};

describe("token", () => {
  it("round-trips a payload", async () => {
    const token = await signToken(payload, "secret");
    await expect(verifyToken<SignTokenPayload>(token, "secret")).resolves.toMatchObject({ q: payload.q });
  });
  it("rejects tampering", async () => {
    const token = await signToken(payload, "secret");
    await expect(verifyToken(token.slice(0, -1) + "x", "secret")).resolves.toBeNull();
  });
  it("rejects expiry", async () => {
    const token = await signToken({ ...payload, exp: Date.now() - 1 }, "secret");
    await expect(verifyToken(token, "secret")).resolves.toBeNull();
  });
});
