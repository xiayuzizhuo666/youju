import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHandler } from "../functions/handler.ts";
import { createLimiter } from "../functions/demo.ts";
import { proxyChat } from "../functions/providers.ts";
import { unsupportedClaims } from "../functions/guard.ts";
import type { ChatFn } from "../functions/generate.ts";
import type { BookData, BookEntry, SignPayload } from "../shared/types.ts";

interface EvalQuestion {
  id: string;
  category: string;
  question: string;
  sections: number[];
  triage: "emergency" | "suicide" | "legal" | null;
  no_match?: boolean;
}

interface AskBody {
  ok?: boolean;
  mode?: string;
  sign?: SignPayload;
  triage?: { kind?: string };
  nearest_sections?: { no: number; title: string }[];
  error?: string;
  message?: string;
}

interface EvalRow {
  id: string;
  category: string;
  question: string;
  mode: string;
  sectionOk: "1" | "0" | "n/a";
  triageOk: "1" | "0" | "n/a";
  noMatchOk: "1" | "0" | "n/a";
  signText: string;
  citation: string;
  latencyMs: number;
  entryId: string;
  sectionNo: number | "";
  expectedSections: string;
  citationOk: "1" | "0" | "n/a";
  citationIssue: string;
  triageKind: string;
  detail: string;
  humanSignOk: string;
  humanNote: string;
}

const root = resolve(import.meta.dirname, "..");
const book = JSON.parse(readFileSync(join(root, "data", "book.json"), "utf8")) as BookData;
const questions = JSON.parse(readFileSync(join(root, "data", "eval-questions.json"), "utf8")) as EvalQuestion[];
const curated = JSON.parse(readFileSync(join(root, "functions", "data", "curated-cache.json"), "utf8")) as Record<string, SignPayload>;

const apiKey = (process.env.DEEPSEEK_API_KEY ?? "").trim();
const model = (process.env.DEEPSEEK_MODEL ?? "").trim() || "deepseek-chat";
const keyPresent = apiKey.length > 0;
let modelCalls = 0;
let modelFailures = 0;

const chat: ChatFn = async (messages, options) => {
  // Without a key the generation layer must degrade exactly like it would in a
  // deployment with no key, but we short-circuit instead of sending 80+ doomed
  // network requests. Do not fabricate a key here.
  if (!keyPresent) throw new Error("DEEPSEEK_API_KEY_absent");
  modelCalls += 1;
  try {
    const result = await proxyChat({
      providerId: "deepseek",
      apiKey,
      model,
      messages,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      json: options?.json,
    });
    return result.text;
  } catch (error) {
    modelFailures += 1;
    throw error;
  }
};

const handler = createHandler({
  book,
  chat,
  now: Date.now,
  env: { APP_HMAC_SECRET: "eval-secret" },
  limiter: createLimiter({ maxPerIp: 1000, maxGlobal: 1000 }),
  expandLimiter: createLimiter({ maxPerIp: 1000, maxGlobal: 1000 }),
  curated,
});

function citationFor(entry: BookEntry): string {
  return `第 ${entry.section_no} 节第 ${entry.item_no} 条（${entry.title}）`;
}

function countByCategory(category: string): number {
  return questions.filter((item) => item.category === category).length;
}

const scenarioCount = ["租房", "工作", "钱", "健康", "关系", "安全"].reduce((sum, category) => sum + countByCategory(category), 0);
const adversarialCount = countByCategory("对抗");
const noMatchCount = questions.filter((item) => item.no_match).length;
const triageCount = questions.filter((item) => item.triage !== null).length;
const signEvaluable = questions.filter((item) => !item.no_match && !item.triage && item.sections.length > 0);

if (questions.length !== 50) throw new Error(`eval set must contain 50 questions, found ${questions.length}`);
if (scenarioCount !== 37) throw new Error(`eval set must contain 37 scenario questions, found ${scenarioCount}`);
if (noMatchCount !== 3) throw new Error(`eval set must contain 3 no_match questions, found ${noMatchCount}`);
if (adversarialCount !== 10) throw new Error(`eval set must contain 10 adversarial questions, found ${adversarialCount}`);
if (triageCount !== 5) throw new Error(`eval set must contain 5 triage questions, found ${triageCount}`);

const rows: EvalRow[] = [];
const latencies: number[] = [];
const modeCounts = new Map<string, number>();
let sectionHits = 0;
let triageHits = 0;
let noMatchHits = 0;
let citationFailures = 0;

for (const item of questions) {
  const started = performance.now();
  let body: AskBody = { mode: "error", error: "unreachable" };
  try {
    const response = await handler(new Request("http://localhost/functions/v1/app", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ask", question: item.question }),
    }));
    body = (await response.json()) as AskBody;
  } catch (error) {
    body = { mode: "error", error: error instanceof Error ? error.name : "unknown" };
  }
  const latencyMs = Math.round(performance.now() - started);
  latencies.push(latencyMs);

  const mode = body.mode ?? "error";
  modeCounts.set(mode, (modeCounts.get(mode) ?? 0) + 1);
  const sign = body.sign;
  const entry = sign ? book.entries.find((candidate) => candidate.id === sign.entry_id) : undefined;

  let sectionOk: EvalRow["sectionOk"] = "n/a";
  if (signEvaluable.some((candidate) => candidate.id === item.id)) {
    // A no_match/error on a question that should produce a sign is a recall miss,
    // not "not applicable": the denominator stays at every sign-evaluable item.
    sectionOk = sign && entry && item.sections.includes(entry.section_no) ? "1" : "0";
    if (sectionOk === "1") sectionHits += 1;
  }

  let triageOk: EvalRow["triageOk"] = "n/a";
  if (item.triage) {
    triageOk = mode === "triage" && body.triage?.kind === item.triage ? "1" : "0";
    if (triageOk === "1") triageHits += 1;
  }

  let noMatchOk: EvalRow["noMatchOk"] = "n/a";
  if (item.no_match) {
    noMatchOk = mode === "no_match" ? "1" : "0";
    if (noMatchOk === "1") noMatchHits += 1;
  }

  let citationOk: EvalRow["citationOk"] = "n/a";
  let citationIssue = "";
  if (sign) {
    const issues: string[] = [];
    if (!entry) issues.push("entry_missing");
    if (!sign.citation) issues.push("citation_empty");
    else if (entry && sign.citation !== citationFor(entry)) issues.push("citation_mismatch");
    if (entry) {
      const unsupported = unsupportedClaims(sign.text, [entry]);
      if (unsupported.length > 0) issues.push(`text_unsupported:${unsupported.join("|")}`);
    }
    citationOk = issues.length === 0 ? "1" : "0";
    citationIssue = issues.join(";");
    if (issues.length > 0) citationFailures += 1;
  }

  const detail = mode === "error"
    ? body.error ?? "error"
    : mode === "no_match"
      ? (body.nearest_sections ?? []).map((section) => `${section.no}:${section.title}`).join("|")
      : mode === "triage"
        ? body.triage?.kind ?? ""
        : "";

  rows.push({
    id: item.id,
    category: item.category,
    question: item.question,
    mode,
    sectionOk,
    triageOk,
    noMatchOk,
    signText: sign?.text ?? "",
    citation: sign?.citation ?? "",
    latencyMs,
    entryId: sign?.entry_id ?? "",
    sectionNo: entry?.section_no ?? "",
    expectedSections: item.sections.join("|"),
    citationOk,
    citationIssue,
    triageKind: body.triage?.kind ?? "",
    detail,
    humanSignOk: "",
    humanNote: "",
  });
}

const sorted = [...latencies].sort((a, b) => a - b);
const percentile = (value: number) => sorted[Math.min(sorted.length - 1, Math.ceil(value * sorted.length) - 1)] ?? 0;
const average = Math.round(latencies.reduce((sum, value) => sum + value, 0) / Math.max(1, latencies.length));
const pct = (hits: number, total: number) => total === 0 ? "n/a" : `${hits}/${total}（${(hits / total * 100).toFixed(1)}%）`;

const modeLine = ["sign", "fallback", "triage", "no_match", "error"]
  .map((mode) => `${mode} ${modeCounts.get(mode) ?? 0}`)
  .join(" / ");

const categoryRows = ["租房", "工作", "钱", "健康", "关系", "安全", "无关", "对抗"].map((category) => {
  const items = rows.filter((row) => row.category === category);
  const scored = items.filter((row) => row.sectionOk !== "n/a");
  const hits = scored.filter((row) => row.sectionOk === "1").length;
  const modes = [...new Set(items.map((row) => row.mode))].join("|");
  return `| ${category} | ${items.length} | ${scored.length} | ${hits} | ${scored.length ? `${(hits / scored.length * 100).toFixed(1)}%` : "n/a"} | ${modes} |`;
}).join("\n");

const sectionMisses = rows.filter((row) => row.sectionOk === "0");
const sectionMissLines = sectionMisses.length === 0
  ? "- 无"
  : sectionMisses.map((row) => `- ${row.id}（期望 ${row.expectedSections}，实际 ${row.sectionNo === "" ? "无签" : `第 ${row.sectionNo} 节`}，mode=${row.mode}）：${row.signText || "无签文"}`).join("\n");

const citationFailureLines = rows.filter((row) => row.citationOk === "0").length === 0
  ? "- 无"
  : rows.filter((row) => row.citationOk === "0")
    .map((row) => `- ${row.id}（${row.entryId}）：${row.citationIssue}；citation=${row.citation}`)
    .join("\n");

const triageLines = rows.filter((row) => row.triageOk !== "n/a")
  .map((row) => `- ${row.id}：${row.triageOk === "1" ? "命中" : "未命中"}（期望 ${questions.find((item) => item.id === row.id)?.triage}，实际 ${row.triageKind || row.mode}）`)
  .join("\n");

const noMatchLines = rows.filter((row) => row.noMatchOk !== "n/a")
  .map((row) => `- ${row.id}：${row.noMatchOk === "1" ? "正确 no_match" : `未走 no_match（mode=${row.mode}，签=${row.signText}）`}`)
  .join("\n");

const degraded = !keyPresent || modelFailures > 0;
const modeLabel = !keyPresent
  ? "no-key/degraded baseline"
  : modelFailures > 0
    ? "degraded（key 存在但模型调用失败）"
    : "model-validated";
const keyLabel = keyPresent ? "present（值未记录）" : "absent（未注入，未使用假 key）";
const modelLine = keyPresent
  ? `- 模型：${model}；模型调用 ${modelCalls} 次，失败 ${modelFailures} 次`
  : `- 模型：${model}；模型调用 0 次（key 缺失，客户端直接短路，不发网络请求）`;

const degradedNotes = !keyPresent
  ? `- 本报告是 **no-key/degraded baseline**：路由与选签的模型调用全部失败，handler 降级为 curated 命中或 BM25 top-1 兜底。
- 因此 \`mode=fallback\` 的行是 curated 兜底，\`mode=sign\` 的行实际也是 BM25 兜底签；这些数字**不代表 DeepSeek 模型效果**。
- 无匹配在降级路径下结构性失效：没有模型判定，BM25 对无关问题也会返回候选，handler 只会给出兜底签，所以无关题全部未走 \`no_match\`。这是降级路径的已知缺陷，不是模型评测结论。
- 章节召回的分母是全部 ${signEvaluable.length} 道可评分签题；降级运行时，非 sign 的模式也按未命中计。
- 延迟包含 BM25 对全量 ${book.entries.length} 条条目建索引的开销（模型调用失败后 confidence=0，退回全量检索），比正常有 key 的窄检索路径慢，不能当作线上延迟。`
  : modelFailures > 0
    ? `- 本次运行中 ${modelFailures}/${modelCalls} 次模型调用失败，相关题目走了 curated/BM25 兜底，指标已被污染。`
    : "- 本次运行使用真实 DeepSeek 调用，每个 ask 的 \`sign\` 由模型路由/选签产生。";

const report = `# 有据 v1 评测结果

- 运行时间：${new Date().toISOString()}
- 运行模式：**${modeLabel}**
- DEEPSEEK_API_KEY：${keyLabel}
${modelLine}

${degradedNotes}

## 题集构成

- 总题量：${questions.length}
- 场景题：${scenarioCount}（其中 ${questions.filter((item) => ["租房", "工作", "钱", "健康", "关系", "安全"].includes(item.category) && item.triage).length} 题期望安全分流：health-07、relation-07）
- 无关题（no_match）：${noMatchCount}
- 对抗题：${adversarialCount}（其中 ${questions.filter((item) => item.category === "对抗" && item.triage).length} 题期望分流：adv-01、adv-02、adv-10）
- 期望分流合计：${triageCount}
- 可评分签题（非分流、非无关、有期望章节）：${signEvaluable.length}

## 指标

| 指标 | 结果 | 定义 |
| --- | --- | --- |
| 章节召回 | ${pct(sectionHits, signEvaluable.length)} | 签所在章节 ∈ 期望章节；no_match/error 按未命中计 |
| 三类分流召回 | ${pct(triageHits, triageCount)} | mode=triage 且 kind 与期望一致 |
| 无匹配精确率 | ${pct(noMatchHits, noMatchCount)} | 无关题返回 mode=no_match |
| 引用失败 | ${citationFailures} 条 | citation 与签对应条目不一致，或签文含该条目不支持的数字/法条 |
| 延迟（ask 端到端） | p50 ${percentile(0.5)}ms / p95 ${percentile(0.95)}ms / max ${sorted[sorted.length - 1] ?? 0}ms / avg ${average}ms | 含 handler 内部全流程，单线程顺序执行 |

模式分布：${modeLine}

## 分类明细

| 类别 | 题量 | 可评分 | 章节命中 | 命中率 | 模式 |
| --- | --- | --- | --- | --- | --- |
${categoryRows}

## 章节未命中

${sectionMissLines}

## 分流题

${triageLines}

## 无关题

${noMatchLines}

## 引用失败

${citationFailureLines}

## 人工复核

签文是否“合理且有引用支持”需要人工判断。逐行结果见 \`docs/eval-review.csv\`（\`sign_text\`、\`citation\`、\`entry_id\`、\`section_no\` 列），对前 20 条签行在 \`human_sign_ok\` 列打 0/1，并把汇总写入本节。
`;

mkdirSync(join(root, "docs"), { recursive: true });
writeFileSync(join(root, "docs", "eval-results.md"), report);

const csv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const header = [
  "id", "category", "question", "mode", "section_ok", "triage_ok", "no_match_ok",
  "sign_text", "citation", "latency_ms", "entry_id", "section_no", "expected_sections",
  "citation_ok", "citation_issue", "triage_kind", "detail", "human_sign_ok", "human_note",
];
const csvRows = rows.map((row) => [
  row.id, row.category, row.question, row.mode, row.sectionOk, row.triageOk, row.noMatchOk,
  row.signText, row.citation, row.latencyMs, row.entryId, row.sectionNo, row.expectedSections,
  row.citationOk, row.citationIssue, row.triageKind, row.detail, row.humanSignOk, row.humanNote,
].map(csv).join(","));
writeFileSync(join(root, "docs", "eval-review.csv"), [header.map(csv).join(","), ...csvRows].join("\n"));

console.log(report);
if (degraded) console.warn("eval_degraded_run", { keyPresent, modelCalls, modelFailures });
