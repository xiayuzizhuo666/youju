import { costScore, ratioFor } from "../../shared/cost";
import type { BookData, BookEntry, BookSection, Evidence } from "../../shared/types";

const ENTRY_START = /^###\s+(\d+)\.\s+(.+?)\s*$/;
const FIELD = /^-\s+(成本|说人话|收益|证据等级|来源|备注)：(.*)$/;
const COST_TAG = /<!--\s*成本标签:\s*(.*?)\s*-->/;
// Section title (`# 1. ...`) and trailing footer headings (`## 许可`) end an entry.
const SECTION_HEADING = /^#{1,2}\s+/;

function parseTag(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of tag.split(/\s+/).filter(Boolean)) {
    const [key, ...rest] = part.split("=");
    if (key) out[key] = rest.join("=");
  }
  return out;
}

// The book appends a parenthetical to some evidence lines, e.g. "A（争议）".
// Only the leading letter is the evidence grade; an unknown grade is an error.
function parseEvidence(raw: string | undefined): Evidence {
  const value = (raw ?? "C").trim();
  const match = value.match(/^(A|B|C)(?![A-Z])/);
  if (!match) throw new Error(`unknown evidence level: ${JSON.stringify(value)}`);
  return match[1] as Evidence;
}

function buildEntry(raw: { itemNo: number; title: string; lines: string[] }, sectionNo: number, sectionTitle: string): BookEntry {
  const text = raw.lines.join("\n");
  const tags = parseTag(text.match(COST_TAG)?.[1] ?? "");
  const fields: Record<string, string> = {};
  let currentKey = "";
  for (const line of text.split(/\r?\n/)) {
    if (COST_TAG.test(line)) continue;
    const fm = line.match(FIELD);
    if (fm) {
      currentKey = fm[1];
      fields[currentKey] = fm[2].trim();
      continue;
    }
    if (currentKey && line.trim()) fields[currentKey] += "\n" + line.trim();
  }
  const sourceText = fields["来源"] ?? "";
  const sourceLinks = [...sourceText.matchAll(/<(https?:\/\/[^>]+)>/g)].map((m) => m[1]);
  const entry: BookEntry = {
    id: `${sectionNo}-${raw.itemNo}`,
    section_no: sectionNo,
    section_title: sectionTitle,
    item_no: raw.itemNo,
    title: raw.title,
    cost: { money: tags["钱"] ?? "0", time: tags["时间"] ?? "少", will: tags["毅力"] ?? "否" },
    benefit: { level: tags["收益"] ?? "小", metric: tags["口径"] ?? "其他" },
    evidence: parseEvidence(fields["证据等级"]),
    cost_text: fields["成本"] ?? "",
    plain: fields["说人话"] ?? "",
    gain_text: fields["收益"] ?? "",
    source_text: sourceText,
    source_links: sourceLinks,
    notes: fields["备注"] ?? "",
    population: (tags["人群"] ?? "").split(/[,，+]/).map((s) => s.trim()).filter(Boolean),
    ratio: "一般",
    dispute: /^争议/.test(fields["备注"] ?? ""),
    todo: /待核实|TODO/.test(text),
  };
  entry.ratio = ratioFor(entry.benefit.level, costScore(entry));
  return entry;
}

export function parseSection(markdown: string, fileName: string): BookSection {
  const lines = markdown.split(/\r?\n/);
  const titleLine = lines.find((line) => /^#\s+\d+\.\s+/.test(line));
  const titleMatch = titleLine?.match(/^#\s+(\d+)\.\s+(.+)$/);
  const no = Number(titleMatch?.[1] ?? fileName.match(/^(\d+)/)?.[1] ?? 0);
  const title = (titleMatch?.[2] ?? "").trim();
  const introLines: string[] = [];
  const entries: BookEntry[] = [];
  let current: { itemNo: number; title: string; lines: string[] } | null = null;
  let finished = false;

  for (const line of lines) {
    const entryMatch = line.match(ENTRY_START);
    if (entryMatch) {
      if (current) entries.push(buildEntry(current, no, title));
      current = { itemNo: Number(entryMatch[1]), title: entryMatch[2].trim(), lines: [] };
      continue;
    }
    if (SECTION_HEADING.test(line)) {
      // A footer heading after the entries (`## 许可`) closes the last entry and
      // its trailing text is not part of the section introduction. The section
      // title above the first entry is skipped without closing anything.
      if (current) entries.push(buildEntry(current, no, title));
      if (entries.length > 0) finished = true;
      current = null;
      continue;
    }
    if (current) current.lines.push(line);
    else if (!finished && !line.startsWith("[") && !line.startsWith("#") && line.trim()) introLines.push(line.trim());
  }
  if (current) entries.push(buildEntry(current, no, title));

  return { no, title, intro: introLines.join("\n"), entries };
}

export function validateBook(book: Pick<BookData, "entries" | "sections">): void {
  if (book.sections.length !== 34) throw new Error(`expected 34 sections, got ${book.sections.length}`);
  if (book.entries.length !== 772) throw new Error(`expected 772 entries, got ${book.entries.length}`);
  const counts = { A: 0, B: 0, C: 0 };
  const ids = new Set<string>();
  for (const entry of book.entries) {
    counts[entry.evidence] += 1;
    if (ids.has(entry.id)) throw new Error(`duplicate id ${entry.id}`);
    ids.add(entry.id);
    if (!entry.title || !entry.cost_text || !entry.plain || !entry.gain_text || !entry.source_text) {
      throw new Error(`missing fields ${entry.id}`);
    }
  }
  if (counts.A !== 497 || counts.B !== 223 || counts.C !== 52) {
    throw new Error(`evidence counts ${JSON.stringify(counts)}`);
  }
}
