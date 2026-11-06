import type { BookEntry } from "../shared/types";

const EMERGENCY = /倒地|没有呼吸|大出血|火灾|溺水|触电|中毒|卒中|中风|心梗|胸痛|窒息|昏迷/;
const SUICIDE = /自杀|不想活|活不下去|结束生命|轻生|死了算了/;
const LEGAL = /拘留|传唤|起诉|被告|开庭|判刑|派出所|警察带走|律师/;

const VERDICT = /(建议|应该|应当|必须)(离|签|做|治|辞职|分手|借|担保)|(不要|别|不能)(离|签|做|治|辞职|分手|借|担保)|(离|签|做|治)(吧|就对了)/;
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

export function unsupportedClaims(text: string, entries: BookEntry[]): string[] {
  const corpus = entries
    .map((entry) => [entry.cost_text, entry.plain, entry.gain_text, entry.notes, entry.source_text].join("\n"))
    .join("\n")
    .replace(/\s+/g, "");
  const compact = text.replace(/\s+/g, "");
  // Law references are reported in their original wording (whitespace runs collapsed),
  // and their digits are removed before the number scan so an article is not reported twice.
  const laws = (text.match(LAW) ?? []).map((law) => law.replace(/\s+/g, " "));
  const numbers = compact.replace(LAW, " ").match(NUMBER) ?? [];
  return [...new Set([...numbers, ...laws])].filter((token) => !corpus.includes(token.replace(/\s+/g, "")));
}
