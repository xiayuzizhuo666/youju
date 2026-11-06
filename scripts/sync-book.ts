import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseSection, validateBook } from "./lib/parse-book";
import type { BookData } from "../shared/types";

const ROOT = resolve(import.meta.dirname, "..");
const TMP = join(ROOT, ".tmp", "HowToLiveBetter");
const REPO = "https://github.com/eternity4719/HowToLiveBetter.git";

if (!existsSync(TMP)) {
  execFileSync("git", ["clone", "--depth", "1", REPO, TMP], { stdio: "inherit" });
}
const commit = execFileSync("git", ["-C", TMP, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const bookDir = join(TMP, "book");
const files = readdirSync(bookDir).filter((name) => name.endsWith(".md")).sort();
const sections = files.map((name) => parseSection(readFileSync(join(bookDir, name), "utf8"), name));
const entries = sections.flatMap((section) => section.entries);
const evidence = { A: 0, B: 0, C: 0 } as Record<"A" | "B" | "C", number>;
for (const entry of entries) evidence[entry.evidence] += 1;

const book: BookData = {
  meta: { commit, synced_at: new Date().toISOString(), total: entries.length, evidence, license: "CC BY 4.0" },
  sections,
  entries,
};
validateBook(book);

mkdirSync(join(ROOT, "data"), { recursive: true });
mkdirSync(join(ROOT, "functions", "data"), { recursive: true });
writeFileSync(join(ROOT, "data", "book.json"), JSON.stringify(book, null, 2));
writeFileSync(join(ROOT, "data", "book-meta.json"), JSON.stringify(book.meta, null, 2));
cpSync(join(ROOT, "data", "book.json"), join(ROOT, "functions", "data", "book.json"));
console.log(`synced ${entries.length} entries at ${commit}`);
