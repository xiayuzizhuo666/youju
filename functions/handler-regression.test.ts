import { describe, expect, it, vi } from "vitest";
import { clientIp, createHandler, type HandlerDeps } from "./handler";
import { createLimiter } from "./demo";
import { signToken } from "./token";
import type { BookData, SignPayload, SignTokenPayload } from "../shared/types";
import type { ChatFn } from "./generate";

const book: BookData = {
  meta: { commit: "test", synced_at: "2026-11-07", total: 1, evidence: { A: 1, B: 0, C: 0 }, license: "CC BY 4.0" },
  sections: [{ no: 15, title: "租房与买房", intro: "", entries: [{
    id: "15-1", section_no: 15, section_title: "租房与买房", item_no: 1,
    title: "房东不退押金", cost: { money: "0", time: "少", will: "否" },
    benefit: { level: "中", metric: "金钱" }, evidence: "A",
    cost_text: "不花钱。", plain: "押金应当退还，先看合同。", gain_text: "可以要求返还。",
    source_text: "民法典. <https://example.com>", source_links: ["https://example.com"],
    notes: "", population: [], ratio: "一般", dispute: false, todo: false,
  }] }],
  entries: [{
    id: "15-1", section_no: 15, section_title: "租房与买房", item_no: 1,
    title: "房东不退押金", cost: { money: "0", time: "少", will: "否" },
    benefit: { level: "中", metric: "金钱" }, evidence: "A",
    cost_text: "不花钱。", plain: "押金应当退还，先看合同。", gain_text: "可以要求返还。",
    source_text: "民法典. <https://example.com>", source_links: ["https://example.com"],
    notes: "", population: [], ratio: "一般", dispute: false, todo: false,
  }],
};

const curatedSign: SignPayload = {
  entry_id: "15-1",
  text: "先看合同里的押金条款",
  plain: "押金应当退还，先看合同。",
  cost: { money: "0", time: "少", will: "否" },
  benefit: { level: "中", metric: "金钱" },
  evidence: "A",
  citation: "第 15 节第 1 条（房东不退押金）",
  source_text: "民法典. <https://example.com>",
  source_links: ["https://example.com"],
};

const curated: Record<string, SignPayload> = { "房东不退押金怎么办": curatedSign };

const chat: ChatFn = async (messages) => {
  const system = messages[0].content;
  if (system.includes("章节路由")) return JSON.stringify({ sections: [15], confidence: 0.9 });
  if (system.includes("翻书人")) return JSON.stringify({ mode: "sign", sign: { entry_id: "15-1", text: "先看合同里的押金条款" }, candidates: ["15-1"] });
  return JSON.stringify({ actions: [{ entry_id: "15-1", action: "先看合同", cost: "不花钱", benefit: "中", evidence: "A" }], avoid: [], not_covered: "", refer: "", recheck: "" });
};

function makeHandler(overrides: Partial<HandlerDeps> = {}) {
  return createHandler({
    book, chat, now: Date.now,
    env: { APP_HMAC_SECRET: "test" },
    limiter: createLimiter({ maxPerIp: 10, maxGlobal: 10 }),
    expandLimiter: createLimiter({ maxPerIp: 10, maxGlobal: 10 }),
    curated,
    ...overrides,
  });
}

const denyAll = () => createLimiter({ maxPerIp: 0, maxGlobal: 0 });

const request = (body: unknown) => new Request("http://localhost/functions/v1/app", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

function tokenBody(token: string): Record<string, unknown> {
  const body = token.split(".")[0];
  const padded = body.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - body.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

function forgeToken(payload: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}.deadbeef`;
}

describe("handler regression", () => {
  it("returns a signable curated fallback when the ask quota is exhausted", async () => {
    const handler = makeHandler({ limiter: denyAll() });
    const response = await handler(request({ action: "ask", question: "房东不退押金怎么办？" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.mode).toBe("fallback");
    expect(body.sign.entry_id).toBe("15-1");
    expect(typeof body.signToken).toBe("string");

    const expanded = await handler(request({ action: "expand", token: body.signToken }));
    expect(expanded.status).toBe(200);
    const expandBody = await expanded.json();
    expect(expandBody.expand.actions[0].entry_id).toBe("15-1");
  });

  it("falls back to the curated sign when routing fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const failing: ChatFn = async () => {
        throw new Error("boom");
      };
      const handler = makeHandler({ chat: failing });
      const response = await handler(request({ action: "ask", question: "房东不退押金怎么办" }));
      const body = await response.json();
      expect(body.mode).toBe("fallback");
      expect(body.sign.entry_id).toBe("15-1");
      expect(typeof body.signToken).toBe("string");
    } finally {
      warn.mockRestore();
    }
  });

  it("falls back to the curated sign when sign selection degrades", async () => {
    const degrades: ChatFn = async (messages) => {
      if (messages[0].content.includes("章节路由")) return JSON.stringify({ sections: [15], confidence: 0.9 });
      throw new Error("sign down");
    };
    const handler = makeHandler({ chat: degrades });
    const response = await handler(request({ action: "ask", question: "房东不退押金怎么办" }));
    const body = await response.json();
    expect(body.mode).toBe("fallback");
    expect(body.sign).toEqual(curatedSign);
    expect(typeof body.signToken).toBe("string");
  });

  it("still signs a normal ask when a curated entry exists", async () => {
    const handler = makeHandler();
    const response = await handler(request({ action: "ask", question: "房东不退押金怎么办" }));
    const body = await response.json();
    expect(body.mode).toBe("sign");
    expect(body.sign.entry_id).toBe("15-1");
    expect(typeof body.signToken).toBe("string");
  });

  it("rejects a JSON null body", async () => {
    const handler = makeHandler();
    const response = await handler(new Request("http://localhost/functions/v1/app", { method: "POST", body: "null" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_json");
  });

  it("enforces the expand quota", async () => {
    const handler = makeHandler({ expandLimiter: denyAll() });
    const ask = await handler(request({ action: "ask", question: "房东不退押金怎么办" })).then((res) => res.json());
    const response = await handler(request({ action: "expand", token: ask.signToken }));
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toBe("rate_limited");
  });

  it("mints a compact token with only q/id/c/exp", async () => {
    const handler = makeHandler();
    const ask = await handler(request({ action: "ask", question: "房东不退押金怎么办" })).then((res) => res.json());
    const body = tokenBody(ask.signToken);
    expect(Object.keys(body).sort()).toEqual(["c", "exp", "id", "q"]);
    expect(body.id).toBe("15-1");
    expect(body.q).toBe("房东不退押金怎么办");
    expect(body).not.toHaveProperty("s");
    expect(ask.signToken.length).toBeLessThan(1200);
  });

  it("hydrates the sign from the verified token, not from the token body", async () => {
    const handler = makeHandler();
    const ask = await handler(request({ action: "ask", question: "房东不退押金怎么办" })).then((res) => res.json());
    const response = await handler(request({ action: "sign", token: ask.signToken }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.question).toBe("房东不退押金怎么办");
    expect(body.sign.entry_id).toBe("15-1");
    expect(body.sign.citation).toBe("第 15 节第 1 条（房东不退押金）");
    expect(body.sign.text).toBe("房东不退押金");
    expect(body.disclaimer).toContain("不替代医生、律师、会计");
  });

  it("fails closed for a fabricated or expired sign token", async () => {
    const handler = makeHandler();
    const future = Date.now() + 60_000;
    const fabricated = forgeToken({ q: "想看的假问题", id: "15-1", c: ["15-1"], exp: future });
    const signResponse = await handler(request({ action: "sign", token: fabricated }));
    expect(signResponse.status).toBe(400);
    expect((await signResponse.json()).error).toBe("invalid_token");
    const expandResponse = await handler(request({ action: "expand", token: fabricated }));
    expect(expandResponse.status).toBe(400);
    expect((await expandResponse.json()).error).toBe("invalid_token");

    const expiredPayload: SignTokenPayload = { q: "房东不退押金怎么办", id: "15-1", c: ["15-1"], exp: Date.now() - 1 };
    const expired = await signToken(expiredPayload, "test");
    const expiredResponse = await handler(request({ action: "sign", token: expired }));
    expect(expiredResponse.status).toBe(400);
    expect((await expiredResponse.json()).error).toBe("invalid_token");
  });

  it("rejects a token for a missing entry id", async () => {
    const payload: SignTokenPayload = { q: "问题", id: "99-9", c: ["99-9"], exp: Date.now() + 60_000 };
    const token = await signToken(payload, "test");
    const handler = makeHandler();
    const response = await handler(request({ action: "sign", token }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_token");
  });

  it("reports health flags without exposing values", async () => {
    const withKey = makeHandler({ modelKeyConfigured: true, hmacConfigured: true });
    const health = await withKey(new Request("http://localhost/functions/v1/app?action=health")).then((res) => res.json());
    expect(health.ok).toBe(true);
    expect(health.modelKeyConfigured).toBe(true);
    expect(health.hmacConfigured).toBe(true);
    expect(JSON.stringify(health)).not.toContain("test");

    // The module wiring substitutes a random secret when APP_HMAC_SECRET is
    // absent; the flag records whether the owner actually configured one.
    const withoutKey = makeHandler({ modelKeyConfigured: false, hmacConfigured: false, env: { APP_HMAC_SECRET: "random-fallback" } });
    const bare = await withoutKey(new Request("http://localhost/functions/v1/app?action=health")).then((res) => res.json());
    expect(bare.modelKeyConfigured).toBe(false);
    expect(bare.hmacConfigured).toBe(false);
  });
});

describe("clientIp", () => {
  it("prefers platform-set headers over x-forwarded-for", () => {
    expect(clientIp(new Request("http://localhost", {
      headers: { "cf-connecting-ip": "4.4.4.4", "x-real-ip": "3.3.3.3", "x-forwarded-for": "1.1.1.1" },
    }))).toBe("4.4.4.4");
    expect(clientIp(new Request("http://localhost", {
      headers: { "x-real-ip": "3.3.3.3", "x-forwarded-for": "1.1.1.1" },
    }))).toBe("3.3.3.3");
  });

  it("uses only the last x-forwarded-for hop so a rotated first hop is not the key", () => {
    expect(clientIp(new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" },
    }))).toBe("2.2.2.2");
  });

  it("falls back to a shared unknown bucket", () => {
    expect(clientIp(new Request("http://localhost"))).toBe("unknown");
  });
});
