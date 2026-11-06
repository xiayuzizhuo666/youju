import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { BookData, BookEntry, SignPayload } from "../shared/types.ts";
import { buildIndex, search } from "../shared/bm25.ts";
import { normalizeQuestion } from "../shared/normalize.ts";
import { hasAbsoluteClaim, hasVerdict } from "../functions/guard.ts";

export interface DailySign {
  date: string;
  question: string;
  sign: SignPayload;
}

const DAILY_QUESTIONS = [
  "今天能做的一件小事",
  "有没有几乎不花钱、收益很大的事",
  "怎么把今天过好一点",
];

function citationFor(entry: BookEntry): string {
  return `第 ${entry.section_no} 节第 ${entry.item_no} 条（${entry.title}）`;
}

function signFromEntry(entry: BookEntry, question: string): SignPayload {
  const raw = entry.title;
  const text = raw.length <= 24 && !hasVerdict(raw) && !hasAbsoluteClaim(raw)
    ? raw
    : `先看第 ${entry.section_no} 节第 ${entry.item_no} 条`;
  return {
    entry_id: entry.id,
    text,
    plain: entry.plain,
    cost: entry.cost,
    benefit: entry.benefit,
    evidence: entry.evidence,
    citation: citationFor(entry),
    source_text: entry.source_text,
    source_links: entry.source_links,
  };
}

function isDailyCandidate(entry: BookEntry): boolean {
  return entry.evidence === "A" && entry.benefit.level === "大" && entry.cost.money !== "多";
}

export function buildDailySigns(book: BookData, days: number): DailySign[] {
  const candidates = book.entries.filter(isDailyCandidate);
  const pool = candidates.length > 0 ? candidates : book.entries;
  const start = new Date("2026-11-07T00:00:00+08:00").getTime();
  return Array.from({ length: days }, (_, index) => {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date(start + index * 86_400_000));
    const entry = pool[index % pool.length];
    const question = DAILY_QUESTIONS[index % DAILY_QUESTIONS.length];
    return { date, question, sign: signFromEntry(entry, question) };
  });
}

export function buildCuratedCache(book: BookData, questions: string[]): Record<string, SignPayload> {
  const index = buildIndex(book.entries);
  const byId = new Map(book.entries.map((entry) => [entry.id, entry]));
  const cache: Record<string, SignPayload> = {};
  for (const question of questions) {
    const top = search(index, question, 1)[0];
    // No token overlap (e.g. a zero-hit synthetic question) still gets a
    // deterministic, book-backed sign so every curated key is populated.
    const entry = top ? byId.get(top.id) : book.entries[0];
    if (entry) cache[normalizeQuestion(question)] = signFromEntry(entry, question);
  }
  return cache;
}

const CURATED_QUESTIONS = [
  "房东不退押金怎么办",
  "被裁了第一步做什么",
  "朋友让我替他担保签不签",
  "体检发现结节要不要手术",
  "熬夜怎么补救",
  "结婚划不划算",
  "遇到电信诈骗怎么办",
  "试用期被辞退有补偿吗",
  "医保断缴有什么影响",
  "出国旅行要准备什么",
];

if (process.argv[1] && process.argv[1].endsWith("precompute.ts")) {
  const root = resolve(import.meta.dirname, "..");
  const book = JSON.parse(readFileSync(join(root, "data", "book.json"), "utf8")) as BookData;
  const daily = buildDailySigns(book, 365);
  const curated = buildCuratedCache(book, CURATED_QUESTIONS);
  mkdirSync(join(root, "functions", "data"), { recursive: true });
  writeFileSync(join(root, "data", "daily-signs.json"), JSON.stringify(daily, null, 2));
  writeFileSync(join(root, "functions", "data", "daily-signs.json"), JSON.stringify(daily, null, 2));
  writeFileSync(join(root, "functions", "data", "curated-cache.json"), JSON.stringify(curated, null, 2));
  console.log(`daily ${daily.length}, curated ${Object.keys(curated).length}`);
}
