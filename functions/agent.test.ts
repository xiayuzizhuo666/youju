import { describe, expect, it } from "vitest";
import { handleAgent } from "./agent";
import type { HandlerDeps } from "./handler";
import type { BookData } from "../shared/types";
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

function makeDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps {
  return {
    book,
    chat,
    now: () => 1_800_000_000_000,
    env: { APP_HMAC_SECRET: "test" },
    limiter: { allow: () => true, remaining: () => 1 },
    expandLimiter: { allow: () => true, remaining: () => 1 },
    curated: {},
    ...overrides,
  };
}

describe("agent", () => {
  it("answers ask_life_question", async () => {
    const response = await handleAgent({ tool: "ask_life_question", input: { question: "房东不退押金怎么办" } }, makeDeps());
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.sign.entry_id).toBe("15-1");
    expect(body.result.expand.actions.length).toBeGreaterThan(0);
    expect(body.result.disclaimer).toContain("不替代医生、律师、会计");
  });

  it("returns book meta", async () => {
    const response = await handleAgent({ tool: "get_book_meta", input: {} }, makeDeps());
    const body = await response.json();
    expect(body.result.total).toBe(1);
  });

  it("returns the daily sign", async () => {
    const response = await handleAgent({ tool: "get_daily_sign", input: {} }, makeDeps());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(typeof body.result.sign.entry_id).toBe("string");
    expect(body.result.disclaimer).toContain("不替代医生、律师、会计");
  });

  it("triages before consuming the agent quota", async () => {
    let quotaCalls = 0;
    const limiter = {
      allow: () => { quotaCalls += 1; return true; },
      remaining: () => 1,
    };
    const response = await handleAgent({ tool: "ask_life_question", input: { question: "我突然胸痛喘不上气" } }, makeDeps({ limiter }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.result.mode).toBe("triage");
    expect(body.result.triage).toBe("emergency");
    expect(quotaCalls).toBe(0);
  });

  it("rejects a missing question", async () => {
    const response = await handleAgent({ tool: "ask_life_question", input: {} }, makeDeps());
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe("missing_question");
  });

  it("rate limits non-triage questions", async () => {
    const limiter = { allow: () => false, remaining: () => 0 };
    const response = await handleAgent({ tool: "ask_life_question", input: { question: "房东不退押金怎么办" } }, makeDeps({ limiter }));
    const body = await response.json();
    expect(response.status).toBe(429);
    expect(body.error).toBe("rate_limited");
  });

  it("rejects an unknown tool", async () => {
    const response = await handleAgent({ tool: "not_a_tool", input: {} }, makeDeps());
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe("unknown_tool");
  });
});
