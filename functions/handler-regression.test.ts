import { describe, expect, it, vi } from "vitest";
import { createHandler, type HandlerDeps } from "./handler";
import { createLimiter } from "./demo";
import type { BookData, SignPayload } from "../shared/types";
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
      return JSON.stringify({ mode: "sign", sign: { entry_id: "15-1", text: "先要回 5000 元押金" }, candidates: ["15-1"] });
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
});
