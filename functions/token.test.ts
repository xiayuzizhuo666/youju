import { describe, expect, it } from "vitest";
import { signToken, verifyToken } from "./token";
import type { SignTokenPayload } from "../shared/types";

const payload: SignTokenPayload = {
  q: "房东不退押金怎么办",
  id: "15-1",
  c: ["15-1", "15-2"],
  exp: Date.now() + 60_000,
};

describe("token", () => {
  it("round-trips a compact payload", async () => {
    const token = await signToken(payload, "secret");
    await expect(verifyToken<SignTokenPayload>(token, "secret")).resolves.toMatchObject({ q: payload.q, id: payload.id, c: payload.c });
  });
  it("rejects tampering", async () => {
    const token = await signToken(payload, "secret");
    await expect(verifyToken(token.slice(0, -1) + "x", "secret")).resolves.toBeNull();
  });
  it("rejects a fabricated body with a wrong signature", async () => {
    const forged = JSON.stringify({ ...payload, id: "1-1" });
    const body = btoa(unescape(encodeURIComponent(forged))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    await expect(verifyToken(`${body}.deadbeef`, "secret")).resolves.toBeNull();
  });
  it("rejects a token signed with a different secret", async () => {
    const token = await signToken(payload, "secret");
    await expect(verifyToken(token, "other-secret")).resolves.toBeNull();
  });
  it("rejects expiry", async () => {
    const token = await signToken({ ...payload, exp: Date.now() - 1 }, "secret");
    await expect(verifyToken(token, "secret")).resolves.toBeNull();
  });
});
