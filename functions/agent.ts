import type { HandlerDeps } from "./handler.ts";
import { routeQuestion, selectSign, expandAnswer } from "./generate.ts";
import { classifyTriage } from "./guard.ts";
import { retrieve } from "../shared/bm25.ts";
import type { SignPayload } from "../shared/types.ts";
import daily from "./data/daily-signs.json" with { type: "json" };

const DISCLAIMER = "通用口径，不替代医生、律师、会计；政策以当地部门为准。";

interface DailySign {
  date: string;
  question: string;
  sign: SignPayload;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function handleAgent(body: Record<string, unknown>, deps: HandlerDeps): Promise<Response> {
  const tool = body.tool;
  const input = (body.input ?? {}) as Record<string, unknown>;

  if (tool === "get_book_meta") {
    return json({ ok: true, result: deps.book.meta });
  }

  if (tool === "get_daily_sign") {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
    const items = daily as unknown as DailySign[];
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
    if (!deps.limiter.allow("agent")) return json({ ok: false, error: "rate_limited", message: "演示额度用完了。" }, 429);
    const routed = await routeQuestion(deps.chat, question, deps.book.sections);
    const pool = routed.confidence >= 0.5
      ? deps.book.entries.filter((entry) => routed.sections.includes(entry.section_no))
      : deps.book.entries;
    const { candidates } = retrieve(pool, question, 20);
    if (candidates.length === 0) return json({ ok: true, result: { mode: "no_match", disclaimer: DISCLAIMER } });
    const selected = await selectSign(deps.chat, question, candidates);
    if (selected.mode !== "sign" || !selected.sign) return json({ ok: true, result: { mode: "no_match", disclaimer: DISCLAIMER } });
    const expand = await expandAnswer(deps.chat, question, selected.sign, candidates);
    return json({ ok: true, result: { mode: "sign", sign: selected.sign, expand, disclaimer: DISCLAIMER } });
  }

  return json({ ok: false, error: "unknown_tool", message: "未知工具。" }, 400);
}
