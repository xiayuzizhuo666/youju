export function shortenTitle(raw: string, max = 24): string {
  if (raw.length <= max) return raw;
  const head = raw.slice(0, max - 1);
  const lastPunct = Math.max(...["，", "。", "；", "：", "、", " "].map((p) => head.lastIndexOf(p)));
  const cut = lastPunct >= 8 ? head.slice(0, lastPunct) : head;
  return `${cut}…`;
}
