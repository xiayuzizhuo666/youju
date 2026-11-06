import { z } from "zod";
import type { BookEntry, BookSection, ExpandPayload, SignPayload } from "../shared/types";
import { hasVerdict, unsupportedClaims } from "./guard";
import { EXPAND_SYSTEM, ROUTE_SYSTEM, SIGN_SYSTEM, expandUser, routeUser, signUser } from "./prompts";

export type ChatFn = (
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  options?: { json?: boolean; temperature?: number; maxTokens?: number },
) => Promise<string>;

const routeSchema = z.object({
  sections: z.array(z.number().int()).min(1).max(3),
  confidence: z.number().min(0).max(1),
});

const signSchema = z.object({
  mode: z.enum(["sign", "no_match"]),
  sign: z.object({ entry_id: z.string(), text: z.string().min(1).max(48) }).optional(),
  candidates: z.array(z.string()).default([]),
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
  try {
    const raw = await chat([
      { role: "system", content: ROUTE_SYSTEM },
      { role: "user", content: routeUser(question, sections) },
    ], { json: true, temperature: 0, maxTokens: 300 });
    const parsed = routeSchema.parse(parseJson(raw));
    return parsed;
  } catch {
    return { sections: sections.map((section) => section.no), confidence: 0 };
  }
}

function citationFor(entry: BookEntry): string {
  return `第 ${entry.section_no} 节第 ${entry.item_no} 条（${entry.title}）`;
}

function signFromEntry(entry: BookEntry, text?: string): SignPayload {
  const raw = text?.trim();
  const safe = raw && raw.length <= 24 && !hasVerdict(raw) ? raw : entry.title;
  return {
    entry_id: entry.id,
    text: safe.length > 24 ? safe.slice(0, 24) : safe,
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
  if (!fallback) return { mode: "no_match" as const, candidates: [] };
  try {
    const raw = await chat([
      { role: "system", content: SIGN_SYSTEM },
      { role: "user", content: signUser(question, candidates) },
    ], { json: true, temperature: 0.2, maxTokens: 600 });
    const parsed = signSchema.parse(parseJson(raw));
    if (parsed.mode === "no_match" || !parsed.sign) return { mode: "no_match" as const, candidates: [] };
    const chosen = byId.get(parsed.sign.entry_id) ?? fallback;
    const sign = signFromEntry(chosen, parsed.sign.text);
    if (unsupportedClaims(sign.text, [chosen]).length > 0) return { mode: "sign" as const, sign: signFromEntry(chosen), candidates: [chosen.id] };
    return { mode: "sign" as const, sign, candidates: parsed.candidates.filter((id) => byId.has(id)) };
  } catch {
    return { mode: "sign" as const, sign: signFromEntry(fallback), candidates: [fallback.id] };
  }
}

export async function expandAnswer(chat: ChatFn, question: string, sign: SignPayload, candidates: BookEntry[]): Promise<ExpandPayload> {
  const byId = new Map(candidates.map((entry) => [entry.id, entry]));
  const fallback = candidates.slice(0, 3).map((entry) => ({
    entry_id: entry.id,
    action: entry.title,
    cost: entry.cost_text.slice(0, 80),
    benefit: `${entry.benefit.level}（${entry.benefit.metric}）`,
    evidence: entry.evidence,
    citation: citationFor(entry),
  }));
  try {
    const raw = await chat([
      { role: "system", content: EXPAND_SYSTEM },
      { role: "user", content: expandUser(question, sign, candidates) },
    ], { json: true, temperature: 0.3, maxTokens: 2000 });
    const parsed = expandSchema.parse(parseJson(raw));
    const clean = (items: typeof parsed.actions) => items
      .filter((item) => byId.has(item.entry_id))
      .map((item) => ({ ...item, citation: citationFor(byId.get(item.entry_id)!) }))
      .filter((item) => unsupportedClaims(`${item.action}${item.cost}${item.benefit}`, [byId.get(item.entry_id)!]).length === 0);
    const actions = clean(parsed.actions);
    return {
      actions: actions.length >= 3 ? actions.slice(0, 7) : fallback,
      avoid: clean(parsed.avoid).slice(0, 3),
      not_covered: parsed.not_covered,
      refer: parsed.refer,
      recheck: parsed.recheck,
    };
  } catch {
    return { actions: fallback, avoid: [], not_covered: "", refer: "", recheck: "" };
  }
}
