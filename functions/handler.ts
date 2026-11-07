import type { AskResponse, BookData, ExpandResponse, SignPayload, SignResponse, SignTokenPayload } from "../shared/types.ts";
import { retrieve } from "../shared/bm25.ts";
import { DISCLAIMER } from "../shared/disclaimer.ts";
import { normalizeQuestion } from "../shared/normalize.ts";
import { classifyTriage } from "./guard.ts";
import { routeQuestion, selectSign, expandAnswer, signFromEntry, type ChatFn } from "./generate.ts";
import { signToken, verifyToken } from "./token.ts";
import { createLimiter } from "./demo.ts";
import { proxyChat } from "./providers.ts";
import { handleAgent } from "./agent.ts";
import bookJson from "./data/book.json" with { type: "json" };
import curatedJson from "./data/curated-cache.json" with { type: "json" };
import dailyJson from "./data/daily-signs.json" with { type: "json" };

const MAX_BODY = 100_000;
const TOKEN_TTL_MS = 20 * 60_000;
const MAX_TOKEN_CANDIDATES = 12;

export interface HandlerDeps {
  book: BookData;
  chat: ChatFn;
  now: () => number;
  env: { APP_HMAC_SECRET: string };
  limiter: ReturnType<typeof createLimiter>;
  expandLimiter: ReturnType<typeof createLimiter>;
  curated: Record<string, SignPayload>;
  /** Boolean signals only; the values must never leave the Function env. */
  modelKeyConfigured?: boolean;
  hmacConfigured?: boolean;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function error(code: string, status: number, message: string): Response {
  return json({ ok: false, error: code, message }, status);
}

/**
 * Resolve the caller key for the soft per-IP quota. Platform-set headers are
 * preferred; a client can rotate `x-forwarded-for`, so only its last hop
 * (nearest proxy) is used as a fallback, never the first hop.
 */
export function clientIp(request: Request): string {
  const direct = request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-real-ip")?.trim();
  if (direct) return direct;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((hop) => hop.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return "unknown";
}

/**
 * Validate the compact token shape after the HMAC check. Extra fields are
 * ignored; a token minted before this contract fails closed.
 */
function compactToken(payload: SignTokenPayload | null): SignTokenPayload | null {
  if (!payload) return null;
  if (typeof payload.q !== "string" || payload.q.trim().length === 0) return null;
  if (typeof payload.id !== "string" || payload.id.length === 0) return null;
  if (!Array.isArray(payload.c) || payload.c.some((id) => typeof id !== "string" || id.length === 0)) return null;
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return null;
  return {
    q: payload.q.slice(0, 200),
    id: payload.id,
    c: payload.c.slice(0, MAX_TOKEN_CANDIDATES),
    exp: payload.exp,
  };
}

function tokenFor(question: string, id: string, candidates: string[], now: number): SignTokenPayload {
  return { q: question, id, c: [...new Set([id, ...candidates])].slice(0, MAX_TOKEN_CANDIDATES), exp: now + TOKEN_TTL_MS };
}

function triageMessage(kind: "emergency" | "suicide" | "legal"): { message: string; citation?: string } {
  if (kind === "emergency") return { message: "这可能是急症：先打 120（火警/事故打 119），再做现场第一个动作。不要先翻书。", citation: "第 13 节（紧急情况）" };
  if (kind === "suicide") return { message: "如果你现在有伤害自己的念头，先打全国心理援助热线 12356，或让身边的人陪着你。", citation: "第 1 节、第 29 节" };
  return { message: "涉及人身安全或正在进行的法律程序（传唤、拘留、起诉）：先保证安全、报警或找律师；书里只给通用口径，不替个案下判断。", citation: "第 8 节（别把自己搭进去）" };
}

export function createHandler(deps: HandlerDeps) {
  async function fallbackResponse(question: string, sign: SignPayload, candidateIds: string[] = []): Promise<Response> {
    const token = await signToken(tokenFor(question, sign.entry_id, candidateIds, deps.now()), deps.env.APP_HMAC_SECRET);
    return json({ ok: true, mode: "fallback", question, sign, signToken: token, degraded: true, disclaimer: DISCLAIMER } satisfies AskResponse);
  }

  /** Retrieved ids are only used to fill the expand candidate list for a fallback sign. */
  function retrievalIds(question: string): string[] {
    return retrieve(deps.book.entries, question, 8).candidates.map((entry) => entry.id);
  }

  return async function handler(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (request.method === "GET") {
        if (url.searchParams.get("action") === "meta") {
          return json({ ok: true, ...deps.book.meta });
        }
        if (url.searchParams.get("action") === "health") {
          return json({
            ok: true,
            model: "deepseek-chat",
            budget: deps.limiter.remaining(clientIp(request)),
            // Boolean signals only; never expose the values themselves.
            modelKeyConfigured: deps.modelKeyConfigured === true,
            hmacConfigured: deps.hmacConfigured ?? deps.env.APP_HMAC_SECRET.trim().length > 0,
          });
        }
        if (url.searchParams.get("action") === "daily") {
          const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
          const items = dailyJson as { date: string; question: string; sign: SignPayload }[];
          const item = items.find((entry) => entry.date === today) ?? items[0];
          if (!item) return error("no_daily_sign", 404, "今天还没有签。");
          const token = await signToken(tokenFor(item.question, item.sign.entry_id, [item.sign.entry_id], deps.now()), deps.env.APP_HMAC_SECRET);
          return json({ ok: true, question: item.question, sign: item.sign, signToken: token, disclaimer: DISCLAIMER });
        }
        return error("method_not_allowed", 405, "只支持 POST，或 GET ?action=meta/health/daily。");
      }
      if (request.method !== "POST") return error("method_not_allowed", 405, "只支持 POST。");

      const text = await request.text();
      if (text.length > MAX_BODY) return error("body_too_large", 413, "请求内容过大。");
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return error("invalid_json", 400, "请求格式不正确。");
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return error("invalid_json", 400, "请求格式不正确。");
      const body = parsed as Record<string, unknown>;

      const action = body.action;
      if (action === "agent") return handleAgent(body, deps, clientIp(request));
      if (action === "sign") {
        // Hydrate the sign from the book after verifying the HMAC; the token
        // carries no display text, so a fabricated token fails closed here.
        const token = typeof body.token === "string" ? body.token : "";
        const payload = compactToken(await verifyToken<SignTokenPayload>(token, deps.env.APP_HMAC_SECRET));
        if (!payload) return error("invalid_token", 400, "这张签已过期或链接不完整，请重新翻一次。");
        const entry = deps.book.entries.find((candidate) => candidate.id === payload.id);
        if (!entry) return error("invalid_token", 400, "这张签对应的条目不存在，请重新翻一次。");
        const response: SignResponse = { ok: true, question: payload.q, sign: signFromEntry(entry), disclaimer: DISCLAIMER };
        return json(response);
      }
      if (action === "ask") {
        const question = typeof body.question === "string" ? body.question.trim().slice(0, 200) : "";
        if (!question) return error("missing_question", 400, "请先写下你在纠结的事。");
        const triage = classifyTriage(question);
        if (triage) {
          const response: AskResponse = { ok: true, mode: "triage", question, triage: { kind: triage, ...triageMessage(triage) }, disclaimer: DISCLAIMER };
          return json(response);
        }

        const key = normalizeQuestion(question);
        const cached = Object.hasOwn(deps.curated, key) ? deps.curated[key] : undefined;
        if (!deps.limiter.allow(clientIp(request))) {
          if (cached) return fallbackResponse(question, cached, retrievalIds(question));
          return error("rate_limited", 429, "今天的演示额度用完了，明天再来，或先翻今日一签。");
        }

        const routed = await routeQuestion(deps.chat, question, deps.book.sections);
        if (routed.confidence === 0 && cached) return fallbackResponse(question, cached, retrievalIds(question));
        const selected = routed.confidence >= 0.5
          ? deps.book.entries.filter((entry) => routed.sections.includes(entry.section_no))
          : deps.book.entries;
        const { candidates } = retrieve(selected, question, 20);
        if (candidates.length === 0) {
          if (cached) return fallbackResponse(question, cached, retrievalIds(question));
          const response: AskResponse = {
            ok: true, mode: "no_match", question,
            nearest_sections: deps.book.sections.slice(0, 3).map((section) => ({ no: section.no, title: section.title })),
            disclaimer: DISCLAIMER,
          };
          return json(response);
        }

        const result = await selectSign(deps.chat, question, candidates);
        if (result.degraded && cached) return fallbackResponse(question, cached, candidates.slice(0, 8).map((entry) => entry.id));
        if (result.mode === "no_match" || !result.sign) {
          if (cached) return fallbackResponse(question, cached);
          const response: AskResponse = {
            ok: true, mode: "no_match", question,
            nearest_sections: deps.book.sections.slice(0, 3).map((section) => ({ no: section.no, title: section.title })),
            disclaimer: DISCLAIMER,
          };
          return json(response);
        }

        const candidateIds = [...new Set([result.sign.entry_id, ...result.candidates])];
        const payload = tokenFor(question, result.sign.entry_id, candidateIds, deps.now());
        const token = await signToken(payload, deps.env.APP_HMAC_SECRET);
        const response: AskResponse = { ok: true, mode: "sign", question, sign: result.sign, signToken: token, degraded: result.degraded, disclaimer: DISCLAIMER };
        return json(response);
      }

      if (action === "expand") {
        const token = typeof body.token === "string" ? body.token : "";
        const payload = compactToken(await verifyToken<SignTokenPayload>(token, deps.env.APP_HMAC_SECRET));
        if (!payload) return error("invalid_token", 400, "这张签已过期或链接不完整，请重新翻一次。");
        const signEntry = deps.book.entries.find((entry) => entry.id === payload.id);
        if (!signEntry) return error("invalid_token", 400, "签对应的条目不存在。");
        const candidateIds = new Set([payload.id, ...payload.c]);
        const candidates = deps.book.entries.filter((entry) => candidateIds.has(entry.id));
        if (candidates.length === 0) return error("invalid_token", 400, "签对应的条目不存在。");
        if (!deps.expandLimiter.allow(clientIp(request))) return error("rate_limited", 429, "今天的演示额度用完了，明天再来，或先翻今日一签。");
        const sign = signFromEntry(signEntry);
        const expand = await expandAnswer(deps.chat, payload.q, sign, candidates);
        const response: ExpandResponse = { ok: true, expand, citations: expand.actions.map((item) => item.citation), disclaimer: DISCLAIMER };
        return json(response);
      }

      return error("unknown_action", 400, "未知操作。");
    } catch (err) {
      console.error("handler_error", err instanceof Error ? err.name : "unknown");
      return error("internal_error", 500, "服务暂时不可用，请稍后再试。");
    }
  };
}

function envValue(name: string): string {
  const deno = (globalThis as { Deno?: { env?: { get(key: string): string | undefined } } }).Deno;
  if (deno?.env?.get) return String(deno.env.get(name) ?? "").trim();
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return String(proc?.env?.[name] ?? "").trim();
}

function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const configuredSecret = envValue("APP_HMAC_SECRET");
if (!configuredSecret) console.warn("APP_HMAC_SECRET_missing_using_random_secret");
const hmacSecret = configuredSecret || randomSecret();

const chat: ChatFn = async (messages, options) => {
  const result = await proxyChat({
    providerId: "deepseek",
    apiKey: envValue("DEEPSEEK_API_KEY"),
    model: envValue("DEEPSEEK_MODEL") || "deepseek-chat",
    messages,
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
    json: options?.json,
  });
  return result.text;
};

export const handler = createHandler({
  book: bookJson as unknown as BookData,
  chat,
  now: Date.now,
  env: { APP_HMAC_SECRET: hmacSecret },
  limiter: createLimiter({ maxPerIp: 30, maxGlobal: 500 }),
  expandLimiter: createLimiter({ maxPerIp: 10, maxGlobal: 200 }),
  curated: curatedJson as Record<string, SignPayload>,
  modelKeyConfigured: Boolean(envValue("DEEPSEEK_API_KEY")),
  hmacConfigured: Boolean(configuredSecret),
});
