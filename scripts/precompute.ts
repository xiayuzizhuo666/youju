import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { BookData, BookEntry, SignPayload } from "../shared/types.ts";
import { normalizeQuestion } from "../shared/normalize.ts";
import { shortenTitle } from "../shared/text.ts";
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

function signFromEntry(entry: BookEntry): SignPayload {
  const candidate = shortenTitle(entry.title);
  const text = !hasVerdict(candidate) && !hasAbsoluteClaim(candidate)
    ? candidate
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
  return !entry.dispute && entry.evidence === "A" && entry.benefit.level === "大" && entry.cost.money !== "多";
}

function dailyPool(entries: BookEntry[], days: number): BookEntry[] {
  const primary = entries.filter(isDailyCandidate);
  if (primary.length >= days) return primary;
  const primaryIds = new Set(primary.map((entry) => entry.id));
  const secondary = entries.filter((entry) =>
    entry.evidence === "A"
    && (entry.benefit.level === "大" || entry.benefit.level === "中")
    && entry.cost.money !== "多"
    && !entry.dispute
    && !primaryIds.has(entry.id)
  );
  return [...primary, ...secondary];
}

export function buildDailySigns(book: BookData, days: number): DailySign[] {
  const pool = dailyPool(book.entries, days);
  const safePool = pool.length > 0 ? pool : book.entries;
  const start = new Date("2026-11-07T00:00:00+08:00").getTime();
  return Array.from({ length: days }, (_, index) => {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date(start + index * 86_400_000));
    const entry = safePool[index % safePool.length];
    const question = DAILY_QUESTIONS[index % DAILY_QUESTIONS.length];
    return { date, question, sign: signFromEntry(entry) };
  });
}

export function buildCuratedCacheFromMap(
  book: BookData,
  specs: { question: string; entryId: string }[],
): Record<string, SignPayload> {
  const byId = new Map(book.entries.map((entry) => [entry.id, entry]));
  const cache: Record<string, SignPayload> = {};
  for (const spec of specs) {
    const entry = byId.get(spec.entryId);
    if (!entry) throw new Error(`curated entry not found: ${spec.entryId}`);
    cache[normalizeQuestion(spec.question)] = signFromEntry(entry);
  }
  return cache;
}

const CURATED = [
  { question: "房东不退押金怎么办", entryId: "15-1" },
  { question: "被裁了第一步做什么", entryId: "19-4" },
  { question: "朋友让我替他担保签不签", entryId: "8-18" },
  { question: "体检发现结节要不要手术", entryId: "24-5" },
  { question: "熬夜怎么补救", entryId: "3-2" },
  { question: "结婚划不划算", entryId: "10-9" },
  { question: "遇到电信诈骗怎么办", entryId: "8-2" },
  { question: "试用期被辞退有补偿吗", entryId: "19-5" },
  { question: "医保断缴有什么影响", entryId: "7-18" },
  { question: "出国旅行要准备什么", entryId: "21-4" },
];

if (process.argv[1] && process.argv[1].endsWith("precompute.ts")) {
  const root = resolve(import.meta.dirname, "..");
  const book = JSON.parse(readFileSync(join(root, "data", "book.json"), "utf8")) as BookData;
  const daily = buildDailySigns(book, 365);
  const curated = buildCuratedCacheFromMap(book, CURATED);
  writeFileSync(join(root, "data", "daily-signs.json"), JSON.stringify(daily, null, 2));
  writeFileSync(join(root, "data", "curated-cache.json"), JSON.stringify(curated, null, 2));
  console.log(`daily ${daily.length}, curated ${Object.keys(curated).length}`);
}
