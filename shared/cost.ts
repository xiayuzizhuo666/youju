import type { BookEntry, Ratio } from "./types";

const COST_W = {
  money: { "0": 0, "少": 1, "多": 2 },
  time: { "少": 0, "中": 1, "多": 2 },
  will: { "否": 0, "些": 1, "是": 2 },
} as const;

export function costScore(entry: Pick<BookEntry, "cost">): number {
  return (COST_W.money[entry.cost.money as keyof typeof COST_W.money] ?? 0)
    + (COST_W.time[entry.cost.time as keyof typeof COST_W.time] ?? 0)
    + (COST_W.will[entry.cost.will as keyof typeof COST_W.will] ?? 0);
}

export function ratioFor(level: string, score: number): Ratio {
  if (level === "大") return score === 0 ? "极高" : score <= 2 ? "高" : "一般";
  if (level === "中") return score === 0 ? "高" : "一般";
  return "一般";
}
