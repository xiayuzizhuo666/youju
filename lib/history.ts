import type { SignPayload } from "../shared/types";

export interface HistoryItem {
  question: string;
  text: string;
  citation: string;
  entryId: string;
  savedAt: number;
  /** Signed sign token; older records may not have one. */
  token?: string;
}

export interface HistoryData {
  version: 1;
  items: HistoryItem[];
  days: string[];
}

export type HistoryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const HISTORY_KEY = "youju.history.v1";
const MAX_ITEMS = 20;
const MAX_DAYS = 60;

function defaultStorage(): HistoryStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isItem(value: unknown): value is HistoryItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.question === "string"
    && typeof item.text === "string"
    && typeof item.citation === "string"
    && typeof item.entryId === "string"
    && typeof item.savedAt === "number"
    && Number.isFinite(item.savedAt)
    && (item.token === undefined || typeof item.token === "string");
}

function isDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function empty(): HistoryData {
  return { version: 1, items: [], days: [] };
}

/** Local calendar date, not UTC: the streak follows the user's own day. */
export function localDate(now: number): string {
  const date = new Date(now);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function createHistoryStore(storage: HistoryStorage | null = defaultStorage()) {
  function read(): HistoryData {
    if (!storage) return empty();
    try {
      const raw = storage.getItem(HISTORY_KEY);
      if (!raw) return empty();
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return empty();
      const record = parsed as Record<string, unknown>;
      const items = Array.isArray(record.items) ? record.items.filter(isItem).slice(0, MAX_ITEMS) : [];
      const days = Array.isArray(record.days) ? record.days.filter(isDay).slice(0, MAX_DAYS) : [];
      return { version: 1, items, days };
    } catch {
      return empty();
    }
  }

  function write(data: HistoryData): void {
    if (!storage) return;
    try {
      storage.setItem(HISTORY_KEY, JSON.stringify(data));
    } catch {
      // Private mode or a full quota should not break the sign page.
    }
  }

  function list(): HistoryItem[] {
    return read().items;
  }

  function record(question: string, sign: SignPayload, now = Date.now(), token?: string): HistoryItem[] {
    const data = read();
    const item: HistoryItem = {
      question: question.trim().slice(0, 200),
      text: sign.text,
      citation: sign.citation,
      entryId: sign.entry_id,
      savedAt: now,
      ...(token ? { token } : {}),
    };
    const key = `${item.entryId}\u0000${item.question}`;
    const items = [
      item,
      ...data.items.filter((existing) => `${existing.entryId}\u0000${existing.question}` !== key),
    ].slice(0, MAX_ITEMS);
    const days = [...new Set([localDate(now), ...data.days])].sort().reverse().slice(0, MAX_DAYS);
    write({ version: 1, items, days });
    return items;
  }

  function streak(now = Date.now()): number {
    const days = new Set(read().days);
    const cursor = new Date(now);
    if (!days.has(localDate(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
    let count = 0;
    while (count < MAX_DAYS && days.has(localDate(cursor.getTime()))) {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }

  function clear(): void {
    if (!storage) return;
    try {
      storage.removeItem(HISTORY_KEY);
    } catch {
      // Ignore storage failures; the page still renders the empty state.
    }
  }

  return { list, record, streak, clear };
}

export const history = createHistoryStore();
