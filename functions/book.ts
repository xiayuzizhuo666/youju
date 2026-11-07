import type { BookData, BookSection } from "./lib/types.ts";
import compact from "./data/book.json" with { type: "json" };

interface CompactBook {
  meta: BookData["meta"];
  sections: BookSection[];
}

const data = compact as CompactBook;

export const book: BookData = {
  meta: data.meta,
  sections: data.sections,
  entries: data.sections.flatMap((section) => section.entries),
};