import type { BookEntry } from "./types.ts";
import { tokenize } from "./tokenize.ts";

const K1 = 1.5;
const B = 0.75;

export interface Bm25Index {
  docs: { id: string; tokens: string[]; len: number }[];
  df: Map<string, number>;
  avgdl: number;
  N: number;
}

export function buildIndex(entries: BookEntry[]): Bm25Index {
  const docs = entries.map((entry) => {
    const tokens = tokenize([
      entry.title, entry.plain, entry.cost_text, entry.gain_text, entry.notes, entry.source_text,
    ].join(" "));
    return { id: entry.id, tokens, len: tokens.length };
  });
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const token of new Set(doc.tokens)) df.set(token, (df.get(token) ?? 0) + 1);
  }
  const avgdl = docs.reduce((sum, doc) => sum + doc.len, 0) / Math.max(1, docs.length);
  return { docs, df, avgdl, N: docs.length };
}

export function search(index: Bm25Index, query: string, limit = 20): { id: string; score: number }[] {
  const terms = tokenize(query);
  const scores = index.docs.map((doc) => {
    const tf = new Map<string, number>();
    for (const token of doc.tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
    let score = 0;
    for (const term of terms) {
      const freq = tf.get(term) ?? 0;
      if (!freq) continue;
      const docFreq = index.df.get(term) ?? 0;
      const idf = Math.log(1 + (index.N - docFreq + 0.5) / (docFreq + 0.5));
      score += idf * (freq * (K1 + 1)) / (freq + K1 * (1 - B + B * doc.len / index.avgdl));
    }
    return { id: doc.id, score };
  });
  return scores.filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

export function retrieve(entries: BookEntry[], question: string, limit = 20): { candidates: BookEntry[]; topScore: number } {
  const index = buildIndex(entries);
  const ranked = search(index, question, limit);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const candidates = ranked.map((item) => byId.get(item.id)).filter((entry): entry is BookEntry => Boolean(entry));
  return { candidates, topScore: ranked[0]?.score ?? 0 };
}
