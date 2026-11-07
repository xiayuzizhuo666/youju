import { z } from "zod";
import type { BookEntry, BookSection, ExpandAction, ExpandPayload, SignPayload } from "../shared/types.ts";
import { shortenTitle } from "../shared/text.ts";
import { hasAbsoluteClaim, hasVerdict, unsupportedClaims } from "./guard.ts";
import { EXPAND_SYSTEM, ROUTE_SYSTEM, SIGN_SYSTEM, expandUser, routeUser, signUser } from "./prompts.ts";

export type ChatFn = (
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  options?: { json?: boolean; temperature?: number; maxTokens?: number },
) => Promise<string>;

const SIGN_MAX_CHARS = 24;
const RATIO_RANK: Record<string, number> = { 极高: 0, 高: 1, 一般: 2 };
const EVIDENCE_RANK: Record<string, number> = { A: 0, B: 1, C: 2 };

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
  conclusion: z.string().max(120).default(""),
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

/**
 * Normalize to letters and digits only so whitespace, punctuation, and
 * full/half-width variants do not hide (or fake) an extractive match.
 */
function matchable(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * The sign text may only wear this citation if it is an extraction of the
 * cited entry: after normalization its characters must be a contiguous
 * substring of the entry's title / plain / cost / gain / notes. Model
 * paraphrase is otherwise discarded for the entry title or neutral pointer.
 */
function isExtractive(text: string, entry: BookEntry): boolean {
  const needle = matchable(text);
  if (!needle) return false;
  return [entry.title, entry.plain, entry.cost_text, entry.gain_text, entry.notes]
    .some((field) => matchable(field).includes(needle));
}

function safeSignText(entry: BookEntry, text?: string): string {
  const model = text?.trim();
  if (model) {
    const shortened = shortenTitle(model, SIGN_MAX_CHARS);
    if (passesTextGuards(shortened) && isExtractive(shortened, entry)) return shortened;
  }
  const title = entry.title.trim();
  if (title) {
    const shortened = shortenTitle(title, SIGN_MAX_CHARS);
    if (passesTextGuards(shortened)) return shortened;
  }
  return neutralHeadline(entry);
}

export function signFromEntry(entry: BookEntry, text?: string): SignPayload {
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
  const fallbackIds = candidates.slice(0, 8).map((entry) => entry.id);
  if (!fallback) return { mode: "no_match" as const, candidates: [], degraded: false };
  try {
    const raw = await chat([
      { role: "system", content: SIGN_SYSTEM },
      { role: "user", content: signUser(question, candidates) },
    ], { json: true, temperature: 0.2, maxTokens: 600 });
    const parsed = signSchema.parse(parseJson(raw));
    if (parsed.mode === "no_match" || !parsed.sign) return { mode: "no_match" as const, candidates: [], degraded: false };
    const chosen = byId.get(parsed.sign.entry_id);
    if (!chosen) {
      // Never pair model prose with a different entry's citation: an unknown
      // id discards the text and degrades to the top candidate's own sign.
      return { mode: "sign" as const, sign: signFromEntry(fallback), candidates: fallbackIds, degraded: true };
    }
    const sign = signFromEntry(chosen, parsed.sign.text);
    if (unsupportedClaims(sign.text, [chosen]).length > 0) return { mode: "sign" as const, sign: signFromEntry(chosen), candidates: fallbackIds, degraded: true };
    return { mode: "sign" as const, sign, candidates: parsed.candidates.filter((id) => byId.has(id)), degraded: false };
  } catch (error) {
    console.warn("generate_sign_failed", error instanceof Error ? error.message : error);
    return { mode: "sign" as const, sign: signFromEntry(fallback), candidates: fallbackIds, degraded: true };
  }
}

function safeActionText(entry: BookEntry): string {
  const title = entry.title.trim();
  return title && passesTextGuards(title) ? title : neutralHeadline(entry);
}

function actionFromEntry(entry: BookEntry, text?: string): ExpandAction {
  const action = text?.trim();
  return {
    entry_id: entry.id,
    action: action && passesTextGuards(action) ? shortenTitle(action, 40) : safeActionText(entry),
    cost: entry.cost_text.slice(0, 80),
    benefit: `${entry.benefit.level}（${entry.benefit.metric}）`,
    evidence: entry.evidence,
    citation: citationFor(entry),
  };
}

function actionRank(entry: BookEntry | undefined): [number, number] {
  return [
    RATIO_RANK[entry?.ratio ?? "一般"] ?? 3,
    EVIDENCE_RANK[entry?.evidence ?? "C"] ?? 3,
  ];
}

/**
 * Book ordering, applied in code instead of trusting model output:
 * sign entry first, then ratio (极高 > 高 > 一般), then evidence (A > B > C).
 */
function orderActions(items: ExpandAction[], byId: Map<string, BookEntry>, signId: string): ExpandAction[] {
  return [...items].sort((a, b) => {
    if (a.entry_id === signId && b.entry_id !== signId) return -1;
    if (b.entry_id === signId && a.entry_id !== signId) return 1;
    const [aRatio, aEvidence] = actionRank(byId.get(a.entry_id));
    const [bRatio, bEvidence] = actionRank(byId.get(b.entry_id));
    return aRatio - bRatio || aEvidence - bEvidence;
  });
}

function fallbackActions(sign: SignPayload, candidates: BookEntry[]): ExpandAction[] {
  const byId = new Map(candidates.map((entry) => [entry.id, entry]));
  const actions = candidates.map((entry) => actionFromEntry(entry));
  return orderActions(actions, byId, sign.entry_id).slice(0, 3);
}

/** Absolute claims and verdicts are never allowed in model-authored free text. */
function safeExpandText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (hasAbsoluteClaim(trimmed) || hasVerdict(trimmed)) return "";
  return trimmed;
}

export async function expandAnswer(chat: ChatFn, question: string, sign: SignPayload, candidates: BookEntry[]): Promise<ExpandPayload> {
  const byId = new Map(candidates.map((entry) => [entry.id, entry]));
  const fallback = fallbackActions(sign, candidates);
  try {
    const raw = await chat([
      { role: "system", content: EXPAND_SYSTEM },
      { role: "user", content: expandUser(question, sign, candidates) },
    ], { json: true, temperature: 0.3, maxTokens: 2000 });
    const parsed = expandSchema.parse(parseJson(raw));
    const clean = (items: typeof parsed.actions) => items
      .filter((item) => byId.has(item.entry_id))
      .map((item) => {
        const entry = byId.get(item.entry_id)!;
        return {
          entry_id: item.entry_id,
          action: item.action.trim(),
          cost: item.cost.trim(),
          benefit: item.benefit.trim(),
          // Evidence always comes from the cited entry, never from the model.
          evidence: entry.evidence,
          citation: citationFor(entry),
        };
      })
      .filter((item) => item.action)
      .filter((item) => !hasAbsoluteClaim(`${item.action}${item.cost}${item.benefit}`))
      .filter((item) => !hasVerdict(`${item.action}${item.cost}${item.benefit}`))
      .filter((item) => unsupportedClaims(`${item.action}${item.cost}${item.benefit}`, [byId.get(item.entry_id)!]).length === 0);
    const cleaned = orderActions(clean(parsed.actions), byId, sign.entry_id);
    let actions = cleaned;
    if (cleaned.length >= 3) {
      // The contract puts the sign entry first even when the model omits it.
      if (!cleaned.some((item) => item.entry_id === sign.entry_id)) {
        const signEntry = byId.get(sign.entry_id);
        if (signEntry) actions = [actionFromEntry(signEntry, sign.text), ...cleaned];
      }
      actions = actions.slice(0, 7);
    } else {
      actions = fallback;
    }
    const conclusion = safeExpandText(parsed.conclusion);
    const safeConclusion = conclusion && unsupportedClaims(conclusion, candidates).length === 0 ? conclusion : "";
    return {
      conclusion: safeConclusion,
      actions,
      avoid: clean(parsed.avoid).slice(0, 3),
      not_covered: safeExpandText(parsed.not_covered),
      refer: safeExpandText(parsed.refer),
      recheck: safeExpandText(parsed.recheck),
    };
  } catch (error) {
    console.warn("generate_expand_failed", error instanceof Error ? error.message : error);
    return { conclusion: "", actions: fallback, avoid: [], not_covered: "", refer: "", recheck: "" };
  }
}
