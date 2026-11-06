const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl
  ? new Intl.Segmenter("zh-CN", { granularity: "word" })
  : null;

export function tokenize(text: string): string[] {
  const normalized = text.toLowerCase().replace(/[\s\p{P}]+/gu, " ").trim();
  if (!normalized) return [];
  const words = segmenter
    ? Array.from(segmenter.segment(normalized)).map((part) => part.segment.trim()).filter(Boolean)
    : normalized.split(/\s+/).filter(Boolean);
  const chars = normalized.replace(/\s+/g, "");
  const bigrams: string[] = [];
  for (let index = 0; index < chars.length - 1; index += 1) bigrams.push(chars.slice(index, index + 2));
  return [...new Set([...words, ...bigrams])];
}
