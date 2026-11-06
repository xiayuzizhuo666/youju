import { z } from "zod";
import type { BookEntry, BookSection, ExpandAction, ExpandPayload, SignPayload } from "../shared/types.ts";
import { hasAbsoluteClaim, hasVerdict, unsupportedClaims } from "./guard.ts";
import { EXPAND_SYSTEM, ROUTE_SYSTEM, SIGN_SYSTEM, expandUser, routeUser, signUser } from "./prompts.ts";

export type ChatFn = (
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  options?: { json?: boolean; temperature?: number; maxTokens?: number },
) => Promise<string>;

const SIGN_MAX_CHARS = 24;
const RATIO_RANK: Record<string, number> = { 极高: 0, 高: 1, 一般: 2 };

const routeSchema = z.object({
  sections: z.array(z.number().int()).min(1).max(3),
  confidence: z.number().min(0).max(1),
});

const signSchema = z.object({
  mode: z.enum(["sign", "no_match"]),
  sign: z.object({ entry_id: z.string(), text: z.string().min(1).max(48) }).optional(),
  candidates: z.array(z.string()).max(8).default([]),
});

const expandSchema = z.object({
  actions: z.array(z.object({
    entry_id: z.string(), action: z.string(), cost: z.string(),
    benefit: z.string(), evidence: z.enum(["A", "B", "C"]),
  })).default([]),
  avoid: z.array(z.object({
    entry_id: z.string(), action: z.string(), cost: z.string(),
    benefit: z.string(), evidence: z.enum(["A", "B", "C"]),
  })).default([]),
  not_covered: z.string().default(""),
  refer: z.string().default(""),
  recheck: z.string().default(""),
});

function parseJson(text: string): unknown {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

export async function routeQuestion(chat: ChatFn, question: string, sections: BookSection[]) {
  const supplied = sections.map((section) => section.no);
  try {
    const raw = await chat([
      { role: "system", content: ROUTE_SYSTEM },
      { role: "user", content: routeUser(question, sections) },
    ], { json: true, temperature: 0, maxTokens: 300 });
    const parsed = routeSchema.parse(parseJson(raw));
    const allowed = new Set(supplied);
    const routed = [...new Set(parsed.sections.filter((no) => allowed.has(no)))].slice(0, 3);
    if (routed.length === 0) return { sections: supplied, confidence: 0 };
    return { sections: routed, confidence: parsed.confidence };
  } catch (error) {
    console.warn("generate_route_failed", error instanceof Error ? error.message : error);
    return { sections: supplied, confidence: 0 };
  }
}

function citationFor(entry: BookEntry): string {
  return `第 ${entry.section_no} 节第 ${entry.item_no} 条（${entry.title}）`;
}

function neutralHeadline(entry: BookEntry): string {
  return `先看第 ${entry.section_no} 节第 ${entry.item_no} 条`;
}

function passesTextGuards(text: string): boolean {
  return !hasVerdict(text) && !hasAbsoluteClaim(text);
}

function safeSignText(entry: BookEntry, text?: string): string {
  const model = text?.trim();
  if (model && model.length <= SIGN_MAX_CHARS && passesTextGuards(model)) return model;
  const title = entry.title.trim();
  if (title && passesTextGuards(title)) return title.length > SIGN_MAX_CHARS ? title.slice(0, SIGN_MAX_CHARS) : title;
  return neutralHeadline(entry);
}

function signFromEntry(entry: BookEntry, text?: string): SignPayload {
  return {
    entry_id: entry.id,
    text: safeSignText(entry, text),
    plain: entry.plain,
    cost: entry.cost,
    benefit: entry.benefit,
    evidence: entry.evidence,
    citation: citationFor(entry),
    source_text: entry.source_text,
    source_links: entry.source_links,
  };
}

export async function selectSign(chat: ChatFn, question: string, candidates: BookEntry[]) {
  const byId = new Map(candidates.map((entry) => [entry.id, entry]));
  const fallback = candidates[0];
  if (!fallback) return { mode: "no_match" as const, candidates: [], degraded: false };
  try {
    const raw = await chat([
      { role: "system", content: SIGN_SYSTEM },
      { role: "user", content: signUser(question, candidates) },
    ], { json: true, temperature: 0.2, maxTokens: 600 });
    const parsed = signSchema.parse(parseJson(raw));
    if (parsed.mode === "no_match" || !parsed.sign) return { mode: "no_match" as const, candidates: [], degraded: false };
    const chosen = byId.get(parsed.sign.entry_id) ?? fallback;
    const sign = signFromEntry(chosen, parsed.sign.text);
    if (unsupportedClaims(sign.text, [chosen]).length > 0) return { mode: "sign" as const, sign: signFromEntry(chosen), candidates: [chosen.id], degraded: true };
    return { mode: "sign" as const, sign, candidates: parsed.candidates.filter((id) => byId.has(id)), degraded: false };
  } catch (error) {
    console.warn("generate_sign_failed", error instanceof Error ? error.message : error);
    return { mode: "sign" as const, sign: signFromEntry(fallback), candidates: [fallback.id], degraded: true };
  }
}

function safeActionText(entry: BookEntry): string {
  const title = entry.title.trim();
  return title && passesTextGuards(title) ? title : neutralHeadline(entry);
}

function fallbackActions(sign: SignPayload, candidates: BookEntry[]): ExpandAction[] {
  const signEntry = candidates.find((entry) => entry.id === sign.entry_id);
  const ranked = [...candidates].sort((a, b) => (RATIO_RANK[a.ratio] ?? 3) - (RATIO_RANK[b.ratio] ?? 3));
  const ordered = signEntry ? [signEntry, ...ranked.filter((entry) => entry.id !== signEntry.id)] : ranked;
  return ordered.slice(0, 3).map((entry) => ({
    entry_id: entry.id,
    action: safeActionText(entry),
    cost: entry.cost_text.slice(0, 80),
    benefit: `${entry.benefit.level}（${entry.benefit.metric}）`,
    evidence: entry.evidence,
    citation: citationFor(entry),
  }));
}

export async function expandAnswer(chat: ChatFn, question: string, sign: SignPayload, candidates: BookEntry[]): Promise<ExpandPayload> {
  const byId = new Map(candidates.map((entry) => [entry.id, entry]));
  const fallback = fallbackActions(sign, candidates);
  const cleanText = (value: string) => (hasAbsoluteClaim(value) ? "" : value);
  try {
    const raw = await chat([
      { role: "system", content: EXPAND_SYSTEM },
      { role: "user", content: expandUser(question, sign, candidates) },
    ], { json: true, temperature: 0.3, maxTokens: 2000 });
    const parsed = expandSchema.parse(parseJson(raw));
    const clean = (items: typeof parsed.actions) => items
      .filter((item) => byId.has(item.entry_id))
      .map((item) => ({ ...item, citation: citationFor(byId.get(item.entry_id)!) }))
      .filter((item) => !hasAbsoluteClaim(`${item.action}${item.cost}${item.benefit}`))
      .filter((item) => unsupportedClaims(`${item.action}${item.cost}${item.benefit}`, [byId.get(item.entry_id)!]).length === 0);
    const actions = clean(parsed.actions);
    return {
      actions: actions.length >= 3 ? actions.slice(0, 7) : fallback,
      avoid: clean(parsed.avoid).slice(0, 3),
      not_covered: cleanText(parsed.not_covered),
      refer: cleanText(parsed.refer),
      recheck: cleanText(parsed.recheck),
    };
  } catch (error) {
    console.warn("generate_expand_failed", error instanceof Error ? error.message : error);
    return { actions: fallback, avoid: [], not_covered: "", refer: "", recheck: "" };
  }
}
