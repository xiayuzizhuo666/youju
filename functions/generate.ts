import type { BookEntry, BookSection, ExpandAction, ExpandPayload, SignPayload } from "./lib/types.ts";
import { shortenTitle } from "./lib/text.ts";
import { hasAbsoluteClaim, hasVerdict, unsupportedClaims } from "./guard.ts";
import { EXPAND_SYSTEM, ROUTE_SYSTEM, SIGN_SYSTEM, expandUser, routeUser, signUser } from "./prompts.ts";

export type ChatFn = (
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  options?: { json?: boolean; temperature?: number; maxTokens?: number; timeoutMs?: number },
) => Promise<string>;

const SIGN_MAX_CHARS = 24;
const RATIO_RANK: Record<string, number> = { 极高: 0, 高: 1, 一般: 2 };
const EVIDENCE_RANK: Record<string, number> = { A: 0, B: 1, C: 2 };

const HEALTH_SPECIFIC =
  /结节|肿瘤|癌|结石|囊肿|息肉|骨折|糖尿病|高血压|血压|血糖|血脂|尿酸|甲状腺|乳腺|胆囊|胰腺|前列腺|子宫|卵巢|肺|肝|肾|胃|肠|心脏|脑|膝盖|关节|手术|化疗|放疗|穿刺|活检|靶向|骨质疏松|乙肝|丙肝|艾滋|幽门|贫血|失眠|抑郁|焦虑/;
const HEALTH_GENERAL = /体检|复查|检查报告|报告|专科|医生|医院|门诊|住院|吃药|用药/;
const HEALTH_SUPPORT_IDS = ["24-5", "24-6", "24-3", "24-1"];

function entryText(entry: BookEntry): string {
  return `${entry.title}${entry.plain}${entry.notes}`;
}

export function isHealthQuestion(question: string): boolean {
  return HEALTH_SPECIFIC.test(question) || HEALTH_GENERAL.test(question);
}

/** Ensure a health question can see direct condition matches and care-navigation entries. */
export function healthSupportCandidates(question: string, candidates: BookEntry[], all: BookEntry[]): BookEntry[] {
  if (!isHealthQuestion(question)) return candidates;
  const terms = [...new Set(question.match(HEALTH_SPECIFIC) ?? [])];
  const score = (entry: BookEntry) => terms.filter((term) => entryText(entry).includes(term)).length;
  const direct = terms.length === 0 ? [] : all
    .filter((entry) => score(entry) > 0)
    .sort((a, b) => score(b) - score(a))
    .slice(0, 5);
  const merged = [
    ...candidates,
    ...direct.filter((entry) => !candidates.some((candidate) => candidate.id === entry.id)),
  ];
  if (merged.some((entry) => entry.section_no === 24)) return merged;
  const support = HEALTH_SUPPORT_IDS
    .map((id) => all.find((entry) => entry.id === id))
    .filter((entry): entry is BookEntry => Boolean(entry));
  return [...merged, ...support];
}

/**
 * Keep the model's choice when it matches a condition/procedure in the question.
 * If it only picked a generic "体检/保健" reminder, prefer a care-navigation
 * entry from section 24 instead of answering a different question.
 */
export function preferHealthEntry(question: string, chosen: BookEntry, candidates: BookEntry[]): BookEntry {
  if (!isHealthQuestion(question)) return chosen;
  const terms = [...new Set(question.match(HEALTH_SPECIFIC) ?? [])];
  if (terms.length === 0) return chosen;
  const score = (entry: BookEntry) => terms.filter((term) => entryText(entry).includes(term)).length;
  const best = candidates.reduce((current, entry) => score(entry) > score(current) ? entry : current, chosen);
  if (score(best) > 0) return score(chosen) >= score(best) ? chosen : best;
  return HEALTH_SUPPORT_IDS
    .map((id) => candidates.find((entry) => entry.id === id))
    .find((entry): entry is BookEntry => Boolean(entry)) ?? chosen;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, max = 1000): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function asStringArray(value: unknown, maxItems = 8): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, maxItems)
    : [];
}

function asEvidence(value: unknown): "A" | "B" | "C" {
  return value === "A" || value === "B" || value === "C" ? value : "C";
}

function parseExpandItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => ({
      entry_id: asString(item.entry_id),
      action: asString(item.action),
      cost: asString(item.cost),
      benefit: asString(item.benefit),
      evidence: asEvidence(item.evidence),
    }))
    .filter((item) => item.entry_id && item.action);
}

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
    ], { json: true, temperature: 0, maxTokens: 300, timeoutMs: 4_000 });
    const parsed = parseJson(raw);
    if (!isRecord(parsed)) throw new Error("invalid route");
    const parsedSections = Array.isArray(parsed.sections)
      ? parsed.sections.filter((no): no is number => typeof no === "number" && Number.isInteger(no))
      : [];
    const allowed = new Set(supplied);
    const routed = [...new Set(parsedSections.filter((no) => allowed.has(no)))].slice(0, 3);
    if (routed.length === 0) return { sections: supplied, confidence: 0 };
    const confidence = typeof parsed.confidence === "number" && parsed.confidence >= 0 && parsed.confidence <= 1
      ? parsed.confidence
      : 0;
    return { sections: routed, confidence };
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
    ], { json: true, temperature: 0.2, maxTokens: 600, timeoutMs: 6_000 });
    const parsed = parseJson(raw);
    if (!isRecord(parsed)) throw new Error("invalid sign");
    const mode = parsed.mode === "no_match" ? "no_match" : parsed.mode === "sign" ? "sign" : null;
    if (!mode) throw new Error("invalid sign mode");
    if (mode === "no_match") return { mode: "no_match" as const, candidates: [], degraded: false };
    const signObj = isRecord(parsed.sign) ? parsed.sign : null;
    const entryId = signObj ? asString(signObj.entry_id) : "";
    const modelText = signObj ? asString(signObj.text, 48).trim() : "";
    if (!entryId || !modelText) throw new Error("invalid sign payload");
    const chosen = byId.get(entryId);
    if (!chosen) {
      // Never pair model prose with a different entry's citation: an unknown
      // id discards the text and degrades to the top candidate's own sign.
      return { mode: "sign" as const, sign: signFromEntry(fallback), candidates: fallbackIds, degraded: true };
    }
    const preferred = preferHealthEntry(question, chosen, candidates);
    const sign = signFromEntry(preferred, preferred.id === chosen.id ? modelText : undefined);
    if (unsupportedClaims(sign.text, [preferred]).length > 0) {
      return { mode: "sign" as const, sign: signFromEntry(preferred), candidates: fallbackIds, degraded: true };
    }
    const candidateIds = asStringArray(parsed.candidates, 8).filter((id) => byId.has(id));
    if (!candidateIds.includes(preferred.id)) candidateIds.unshift(preferred.id);
    return { mode: "sign" as const, sign, candidates: candidateIds, degraded: false };
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
    ], { json: true, temperature: 0.3, maxTokens: 2000, timeoutMs: 8_000 });
    const parsed = parseJson(raw);
    if (!isRecord(parsed)) throw new Error("invalid expand");
    const actionsRaw = parseExpandItems(parsed.actions);
    const avoidRaw = parseExpandItems(parsed.avoid);
    const clean = (items: ReturnType<typeof parseExpandItems>) => items
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
    const cleaned = orderActions(clean(actionsRaw), byId, sign.entry_id);
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
    const conclusion = safeExpandText(asString(parsed.conclusion, 120));
    const safeConclusion = conclusion && unsupportedClaims(conclusion, candidates).length === 0 ? conclusion : "";
    return {
      conclusion: safeConclusion,
      actions,
      avoid: clean(avoidRaw).slice(0, 3),
      not_covered: safeExpandText(asString(parsed.not_covered)),
      refer: safeExpandText(asString(parsed.refer)),
      recheck: safeExpandText(asString(parsed.recheck)),
      degraded: cleaned.length < 3,
    };
  } catch (error) {
    console.warn("generate_expand_failed", error instanceof Error ? error.message : error);
    return { conclusion: "", actions: fallback, avoid: [], not_covered: "", refer: "", recheck: "", degraded: true };
  }
}
