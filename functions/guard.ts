import type { BookEntry } from "./lib/types.ts";

const EMERGENCY =
  /倒地|没有呼吸|大出血|火灾|着火|起火|溺水|触电|中毒|卒中|中风|心梗|胸痛|窒息|昏迷|晕倒|休克|呼吸困难|抽搐|烧伤|烫伤|车祸|误吞|吞了药/;
const SUICIDE =
  /自杀|不想活|活不下去|结束生命|轻生|死了算了|我想死|想死|想不开|活够了|活着没意思|跳楼|割腕|上吊|服毒|吃安眠药|吞药/;
const LEGAL = /拘留|传唤|起诉|被告(?!知)|开庭|判刑|派出所|警察带走|家暴|打我|殴打/;

const VERDICT =
  /(建议|应该|应当|必须|最好|赶紧|赶快|趁早)(你|您|先|急着|赶紧)?(离|离婚|签|签字|做|手术|治|辞职|分手|借|借钱|担保)|(不要|别|不能)(急着|再|先)?(离|离婚|签|做|治|辞职|分手|借|担保)|(离|签|做|治|辞职|分手)(吧|就对了)/;
const ABSOLUTE = /一定|必然|保证|治愈|100%|绝对/;

const LAW = /第\s*[一二三四五六七八九十百千0-9]+\s*条/g;
const NUMBER = /\d+(?:\.\d+)?%?/g;

export function classifyTriage(question: string): "emergency" | "suicide" | "legal" | null {
  if (EMERGENCY.test(question)) return "emergency";
  if (SUICIDE.test(question)) return "suicide";
  if (LEGAL.test(question)) return "legal";
  return null;
}

export function hasVerdict(text: string): boolean {
  return VERDICT.test(text);
}

export function hasAbsoluteClaim(text: string): boolean {
  return ABSOLUTE.test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Numeric tokens must match on digit boundaries so a short number is not
 * considered supported merely because it appears inside a longer corpus number
 * (for example "2" inside "2025").
 */
function containsToken(corpus: string, token: string): boolean {
  if (/^\d/.test(token)) {
    return new RegExp(`(^|[^0-9.])${escapeRegExp(token)}(?![0-9.])`).test(corpus);
  }
  return corpus.includes(token);
}

export interface UnsupportedClaimOptions {
  /**
   * Eval-only strict mode. Drops entry.id, entry.section_no, and date spans
   * (for example "2025 年 9 月 15 日") from the support corpus so a quantity in
   * the sign text can only be supported by substantive entry text, not by the
   * entry identifier or a publication date. Product callers use the default.
   */
  strict?: boolean;
}

export function unsupportedClaims(text: string, entries: BookEntry[], options: UnsupportedClaimOptions = {}): string[] {
  let corpus = entries
    .map((entry) =>
      [
        ...(options.strict ? [] : [entry.id, String(entry.section_no)]),
        entry.title,
        entry.cost_text,
        entry.plain,
        entry.gain_text,
        entry.notes,
        entry.source_text,
        entry.section_title,
        entry.cost.money,
        entry.cost.time,
        entry.cost.will,
        entry.benefit.level,
        entry.benefit.metric,
        entry.population.join(" "),
      ].join("|"),
    )
    .join("|")
    .replace(/\s+/g, "");
  if (options.strict) corpus = corpus.replace(/\d{4}\s*年\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*日)?/g, "|");
  // Law references are reported in their original wording (whitespace runs collapsed),
  // and their spans are removed before the number scan so an article is not reported twice.
  const lawMatches = (text.match(LAW) ?? []).map((law) => law.replace(/\s+/g, " "));
  const withoutLaws = text.replace(LAW, " ");
  const numberMatches = withoutLaws.match(NUMBER) ?? [];
  const seen = new Set<string>();
  const tokens = [...numberMatches, ...lawMatches].filter((token) => {
    const key = token.replace(/\s+/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return tokens.filter((token) => !containsToken(corpus, token.replace(/\s+/g, "")));
}
