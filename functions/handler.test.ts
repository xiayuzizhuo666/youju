import { describe, expect, it } from "vitest";
import { createHandler } from "./handler";
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

const chat: ChatFn = async (messages) => {
  const system = messages[0].content;
  if (system.includes("章节路由")) return JSON.stringify({ sections: [15], confidence: 0.9 });
  if (system.includes("翻书人")) return JSON.stringify({ mode: "sign", sign: { entry_id: "15-1", text: "先看合同里的押金条款" }, candidates: ["15-1"] });
  return JSON.stringify({ actions: [{ entry_id: "15-1", action: "先看合同", cost: "不花钱", benefit: "中", evidence: "A" }], avoid: [], not_covered: "", refer: "", recheck: "" });
};

function makeHandler(chatOverride: ChatFn = chat, curated: Record<string, SignPayload> = {}) {
  return createHandler({
    book, chat: chatOverride, now: () => Date.now(),
    env: { APP_HMAC_SECRET: "test" },
    limiter: createLimiter({ maxPerIp: 10, maxGlobal: 10 }),
    expandLimiter: createLimiter({ maxPerIp: 10, maxGlobal: 10 }),
    curated,
  });
}

const request = (body: unknown) => new Request("http://localhost/functions/v1/app", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

describe("handler", () => {
  it("returns a sign for a normal question", async () => {
    const response = await makeHandler()(request({ action: "ask", question: "房东不退押金怎么办" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.mode).toBe("sign");
    expect(body.sign.entry_id).toBe("15-1");
    expect(body.degraded).toBe(false);
    expect(typeof body.signToken).toBe("string");
  });

  it("marks a sign degraded when generation falls back", async () => {
    const failingChat: ChatFn = async (messages) => {
      if (messages[0].content.includes("章节路由")) return JSON.stringify({ sections: [15], confidence: 0.9 });
      throw new Error("model down");
    };
    const body = await makeHandler(failingChat)(request({ action: "ask", question: "房东不退押金怎么办" })).then((res) => res.json());
    expect(body.mode).toBe("sign");
    expect(body.sign.entry_id).toBe("15-1");
    expect(body.degraded).toBe(true);
  });

  it("marks a curated fallback response degraded", async () => {
    const failingChat: ChatFn = async () => { throw new Error("model down"); };
    const cached = {
      entry_id: "15-1", text: "房东不退押金", plain: "押金应当退还。",
      cost: { money: "0", time: "少", will: "否" }, benefit: { level: "中", metric: "金钱" },
      evidence: "A" as const, citation: "第 15 节第 1 条（房东不退押金）",
      source_text: "民法典. <https://example.com>", source_links: ["https://example.com"],
    };
    const body = await makeHandler(failingChat, { "房东不退押金怎么办": cached })(request({ action: "ask", question: "房东不退押金怎么办" })).then((res) => res.json());
    expect(body.mode).toBe("fallback");
    expect(body.degraded).toBe(true);
  });

  it("triages emergencies before retrieval", async () => {
    const response = await makeHandler()(request({ action: "ask", question: "我突然胸痛喘不上气" }));
    const body = await response.json();
    expect(body.mode).toBe("triage");
    expect(body.triage.kind).toBe("emergency");
  });

  it("rejects invalid JSON", async () => {
    const response = await makeHandler()(new Request("http://localhost/functions/v1/app", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
  });

  it("expands a valid token", async () => {
    const handler = makeHandler();
    const ask = await handler(request({ action: "ask", question: "房东不退押金怎么办" })).then((res) => res.json());
    const response = await handler(request({ action: "expand", token: ask.signToken }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.expand.actions[0].entry_id).toBe("15-1");
  });

  it("returns meta and health", async () => {
    const handler = makeHandler();
    const meta = await handler(new Request("http://localhost/functions/v1/app?action=meta")).then((res) => res.json());
    expect(meta.total).toBe(1);
    const health = await handler(new Request("http://localhost/functions/v1/app?action=health")).then((res) => res.json());
    expect(health.ok).toBe(true);
  });
});
