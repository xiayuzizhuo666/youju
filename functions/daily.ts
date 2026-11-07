import type { BookData, BookEntry, SignPayload } from "./lib/types.ts";
import { normalizeQuestion } from "./lib/normalize.ts";
import { signFromEntry } from "./generate.ts";
import { book } from "./book.ts";

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

const CURATED = [
  { question: "房东不退押金怎么办", entryId: "15-1" },
  { question: "被裁了第一步做什么", entryId: "19-4" },
  { question: "朋友让我替他担保签不签", entryId: "8-18" },
  { question: "体检发现结节要不要手术", entryId: "6-20" },
  { question: "熬夜怎么补救", entryId: "3-2" },
  { question: "结婚划不划算", entryId: "10-9" },
  { question: "遇到电信诈骗怎么办", entryId: "8-2" },
  { question: "试用期被辞退有补偿吗", entryId: "19-5" },
  { question: "医保断缴有什么影响", entryId: "7-18" },
  { question: "出国旅行要准备什么", entryId: "21-4" },
];

const DAY = 86_400_000;
const START = new Date("2026-11-07T00:00:00+08:00").getTime();

function dateFor(index: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" })
    .format(new Date(START + index * DAY));
}

function isDailyCandidate(entry: BookEntry): boolean {
  return entry.evidence === "A"
    && entry.benefit.level === "大"
    && entry.cost.money !== "多"
    && !entry.dispute;
}

export function buildDailySigns(data: BookData, days: number): DailySign[] {
  const candidates = data.entries.filter(isDailyCandidate);
  const pool = candidates.length > 0 ? candidates : data.entries;
  return Array.from({ length: days }, (_, index) => {
    const entry = pool[index % pool.length];
    return {
      date: dateFor(index),
      question: DAILY_QUESTIONS[index % DAILY_QUESTIONS.length],
      sign: signFromEntry(entry),
    };
  });
}

export function buildCuratedCache(
  data: BookData,
  specs: { question: string; entryId: string }[],
): Record<string, SignPayload> {
  const byId = new Map(data.entries.map((entry) => [entry.id, entry]));
  const cache: Record<string, SignPayload> = {};
  for (const spec of specs) {
    const entry = byId.get(spec.entryId);
    if (!entry) throw new Error(`curated entry not found: ${spec.entryId}`);
    cache[normalizeQuestion(spec.question)] = signFromEntry(entry);
  }
  return cache;
}

export const dailySigns = buildDailySigns(book, 365);
export const curatedCache = buildCuratedCache(book, CURATED);