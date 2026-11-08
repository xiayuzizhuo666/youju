import type { HandlerDeps } from "./handler.ts";
import { routeQuestion, selectSign, expandAnswer, healthSupportCandidates, type ChatFn } from "./generate.ts";
import { classifyTriage } from "./guard.ts";
import { retrieve } from "./lib/bm25.ts";
import { DISCLAIMER } from "./lib/disclaimer.ts";
import { dailySigns, type DailySign } from "./daily.ts";

function json(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

function rateLimited(limiter: { retryAfterMs?(): number }): Response {
  const retry = limiter.retryAfterMs?.() ?? 0;
  return json(
    { ok: false, error: "rate_limited", message: "演示额度用完了。" },
    429,
    retry > 0 ? { "Retry-After": String(Math.ceil(retry / 1000)) } : {},
  );
}

const AGENT_BUDGET_MS = 14_000;

function budgetedChat(chat: ChatFn, budgetMs: number): ChatFn {
  const deadline = Date.now() + budgetMs;
  return (messages, options) => {
    const remaining = deadline - Date.now();
    if (remaining <= 250) throw new Error("agent_budget_exhausted");
    return chat(messages, {
      ...options,
      timeoutMs: Math.min(options?.timeoutMs ?? 8_000, remaining),
    });
  };
}

export async function handleAgent(body: Record<string, unknown>, deps: HandlerDeps, ip = "unknown"): Promise<Response> {
  const tool = body.tool;
  const input = (body.input ?? {}) as Record<string, unknown>;

  if (tool === "get_book_meta") {
    return json({ ok: true, result: deps.book.meta });
  }

  if (tool === "get_daily_sign") {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
    const items = dailySigns as DailySign[];
    const item = items.find((entry) => entry.date === today) ?? items[0];
    return item ? json({ ok: true, result: { sign: item.sign, disclaimer: DISCLAIMER } }) : json({ ok: false, error: "no_daily_sign" }, 404);
  }

  if (tool === "ask_life_question") {
    const question = typeof input.question === "string" ? input.question.trim().slice(0, 200) : "";
    if (!question) return json({ ok: false, error: "missing_question", message: "缺少 question。" }, 400);
    const triage = classifyTriage(question);
    if (triage) {
      return json({ ok: true, result: { mode: "triage", triage, disclaimer: DISCLAIMER } });
    }
    // Agent calls have their own quota so an agent cannot exhaust the web
    // quota, and one caller's smoke tests cannot exhaust another's.
    const limiter = deps.agentLimiter ?? deps.limiter;
    if (!limiter.allow(ip)) return rateLimited(limiter);
    const chat = budgetedChat(deps.chat, AGENT_BUDGET_MS);
    const routed = await routeQuestion(chat, question, deps.book.sections);
    const pool = routed.confidence >= 0.5
      ? deps.book.entries.filter((entry) => routed.sections.includes(entry.section_no))
      : deps.book.entries;
    const { candidates } = retrieve(pool, question, 20);
    if (candidates.length === 0) return json({ ok: true, result: { mode: "no_match", disclaimer: DISCLAIMER } });
    const signCandidates = healthSupportCandidates(question, candidates, deps.book.entries);
    const selected = await selectSign(chat, question, signCandidates);
    if (selected.mode !== "sign" || !selected.sign) return json({ ok: true, result: { mode: "no_match", disclaimer: DISCLAIMER } });
    const expand = await expandAnswer(chat, question, selected.sign, candidates);
    return json({
      ok: true,
      result: {
        mode: "sign",
        sign: selected.sign,
        summary: selected.summary,
        degraded: selected.degraded === true || expand.degraded === true,
        expand,
        disclaimer: DISCLAIMER,
      },
    });
  }

  return json({ ok: false, error: "unknown_tool", message: "未知工具。" }, 400);
}
