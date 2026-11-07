import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHandler } from "../functions/handler.ts";
import { createLimiter } from "../functions/demo.ts";
import { proxyChat } from "../functions/providers.ts";
import { unsupportedClaims } from "../functions/guard.ts";
import type { ChatFn } from "../functions/generate.ts";
import type { BookData, BookEntry, ExpandPayload, SignPayload } from "../shared/types.ts";

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
  question?: string;
  sign?: SignPayload;
  signToken?: string;
  triage?: { kind?: string };
  nearest_sections?: { no: number; title: string }[];
  degraded?: boolean;
  error?: string;
  message?: string;
}

interface ExpandBody {
  ok?: boolean;
  expand?: ExpandPayload;
  citations?: string[];
  error?: string;
  message?: string;
}

interface EvalRow {
  id: string;
  category: string;
  question: string;
  mode: string;
  degraded: boolean;
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
  expandOk: "1" | "0" | "n/a";
  expandLatencyMs: number | "";
  expandActions: number;
  expandCitationOk: "1" | "0" | "n/a";
  expandIssue: string;
}

const root = resolve(import.meta.dirname, "..");
const book = JSON.parse(readFileSync(join(root, "data", "book.json"), "utf8")) as BookData;
const questions = JSON.parse(readFileSync(join(root, "data", "eval-questions.json"), "utf8")) as EvalQuestion[];
const curated = JSON.parse(readFileSync(join(root, "functions", "data", "curated-cache.json"), "utf8")) as Record<string, SignPayload>;

const apiKey = (process.env.DEEPSEEK_API_KEY ?? "").trim();
const model = (process.env.DEEPSEEK_MODEL ?? "").trim() || "deepseek-chat";
const keyPresent = apiKey.length > 0;
let modelAttempts = 0;
let modelCalls = 0;
let modelFailures = 0;
let usageInput = 0;
let usageOutput = 0;

// Optional prices in CNY per one million tokens. Left unset on purpose: the
// report records provider usage and only estimates cost when the owner supplies
// the current provider pricing, instead of hard-coding a price that may be stale.
const inputPriceRaw = (process.env.EVAL_INPUT_PRICE_PER_M ?? "").trim();
const outputPriceRaw = (process.env.EVAL_OUTPUT_PRICE_PER_M ?? "").trim();
const inputPrice = inputPriceRaw ? Number(inputPriceRaw) : Number.NaN;
const outputPrice = outputPriceRaw ? Number(outputPriceRaw) : Number.NaN;
const pricingConfigured = Number.isFinite(inputPrice) && Number.isFinite(outputPrice);

const chat: ChatFn = async (messages, options) => {
  // Count every call the generation layer attempts, including calls short-circuited
  // without a key, so the report can state the real request count instead of a guess.
  modelAttempts += 1;
  // Without a key the generation layer must degrade exactly like it would in a
  // deployment with no key, but we short-circuit instead of sending every attempt
  // as a doomed network request. Do not fabricate a key here.
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
    usageInput += result.usage.inputTokens;
    usageOutput += result.usage.outputTokens;
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
if (signEvaluable.length !== 42) throw new Error(`eval set must contain 42 sign-evaluable questions, found ${signEvaluable.length}`);
const questionIds = questions.map((item) => item.id);
if (new Set(questionIds).size !== questionIds.length) {
  const duplicates = questionIds.filter((id, index) => questionIds.indexOf(id) !== index);
  throw new Error(`eval set ids must be unique, duplicated: ${duplicates.join(", ")}`);
}
const bookSectionNos = new Set(book.sections.filter((section) => section.entries.length > 0).map((section) => section.no));
for (const item of questions) {
  for (const sectionNo of item.sections) {
    if (!bookSectionNos.has(sectionNo)) {
      throw new Error(`eval question ${item.id} expects section ${sectionNo}, which is missing or empty in data/book.json`);
    }
  }
}

const rows: EvalRow[] = [];
const latencies: number[] = [];
const expandLatencies: number[] = [];
const modeCounts = new Map<string, number>();
let sectionHits = 0;
let triageHits = 0;
let noMatchHits = 0;
let citationFailures = 0;
let degradedSigns = 0;
let fallbackRows = 0;
let expandAttempted = 0;
let expandFailures = 0;
let expandCitationFailures = 0;

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
  const degradedRow = body.degraded === true;
  modeCounts.set(mode, (modeCounts.get(mode) ?? 0) + 1);
  if (mode === "fallback") fallbackRows += 1;
  if (mode === "sign" && degradedRow) degradedSigns += 1;
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
      // Eval-only strict check: excludes entry.id / section_no and date spans from
      // the support corpus, so an amount cannot be "supported" by the entry number
      // (the known product-guard false negative for entry 15-1 and "可以退 15 万").
      const unsupported = unsupportedClaims(sign.text, [entry], { strict: true });
      if (unsupported.length > 0) issues.push(`text_unsupported_strict:${unsupported.join("|")}`);
    }
    citationOk = issues.length === 0 ? "1" : "0";
    citationIssue = issues.join(";");
    if (issues.length > 0) citationFailures += 1;
  }

  // Expand coverage: every row that produced a sign token is expanded through
  // the same handler, so latency and strict citation failures cover both the
  // action list and the avoid list. This is a fallback path without a key.
  let expandOk: EvalRow["expandOk"] = "n/a";
  let expandLatencyMs: number | "" = "";
  let expandActions = 0;
  let expandCitationOk: EvalRow["expandCitationOk"] = "n/a";
  let expandIssue = "";
  if (typeof body.signToken === "string" && body.signToken.length > 0) {
    expandAttempted += 1;
    const expandStarted = performance.now();
    let expandBody: ExpandBody = { ok: false, error: "unreachable" };
    try {
      const response = await handler(new Request("http://localhost/functions/v1/app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "expand", token: body.signToken }),
      }));
      expandBody = (await response.json()) as ExpandBody;
    } catch (error) {
      expandBody = { ok: false, error: error instanceof Error ? error.name : "unknown" };
    }
    expandLatencyMs = Math.round(performance.now() - expandStarted);
    expandLatencies.push(expandLatencyMs);
    const expand = expandBody.expand;
    if (!expandBody.ok || !expand) {
      expandOk = "0";
      expandIssue = expandBody.error ?? "expand_missing";
      expandFailures += 1;
    } else {
      expandActions = expand.actions.length;
      const issues: string[] = [];
      for (const action of [...expand.actions, ...expand.avoid]) {
        const cited = book.entries.find((candidate) => candidate.id === action.entry_id);
        if (!cited) {
          issues.push(`${action.entry_id}:entry_missing`);
          continue;
        }
        if (!action.citation || action.citation !== citationFor(cited)) issues.push(`${action.entry_id}:citation_mismatch`);
        const unsupported = unsupportedClaims(`${action.action}${action.cost}${action.benefit}`, [cited], { strict: true });
        if (unsupported.length > 0) issues.push(`${action.entry_id}:unsupported:${unsupported.join("|")}`);
      }
      expandCitationOk = issues.length === 0 ? "1" : "0";
      expandIssue = issues.length > 0 ? issues.join(";") : (expand.actions.length < 3 ? "actions_lt_3" : "");
      expandOk = expand.actions.length > 0 ? "1" : "0";
      if (expand.actions.length === 0) expandFailures += 1;
      if (issues.length > 0) expandCitationFailures += 1;
    }
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
    degraded: degradedRow,
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
    expandOk,
    expandLatencyMs,
    expandActions,
    expandCitationOk,
    expandIssue,
  });
}

const sorted = [...latencies].sort((a, b) => a - b);
const percentile = (value: number) => sorted[Math.min(sorted.length - 1, Math.ceil(value * sorted.length) - 1)] ?? 0;
const average = Math.round(latencies.reduce((sum, value) => sum + value, 0) / Math.max(1, latencies.length));
const sortedExpand = [...expandLatencies].sort((a, b) => a - b);
const expandPercentile = (value: number) => sortedExpand[Math.min(sortedExpand.length - 1, Math.ceil(value * sortedExpand.length) - 1)] ?? 0;
const expandAverage = Math.round(expandLatencies.reduce((sum, value) => sum + value, 0) / Math.max(1, expandLatencies.length));
const pct = (hits: number, total: number) => total === 0 ? "n/a" : `${hits}/${total}（${(hits / total * 100).toFixed(1)}%）`;

const expandLatencySummary = expandLatencies.length === 0
  ? "n/a（无签名 token）"
  : `p50 ${expandPercentile(0.5)}ms / p95 ${expandPercentile(0.95)}ms / max ${sortedExpand[sortedExpand.length - 1] ?? 0}ms / avg ${expandAverage}ms`;
const costEstimate = pricingConfigured ? (usageInput / 1e6) * inputPrice + (usageOutput / 1e6) * outputPrice : null;
const costLine = !keyPresent
  ? "¥0（无模型调用）"
  : costEstimate === null
    ? "未估算（未配置 EVAL_INPUT_PRICE_PER_M / EVAL_OUTPUT_PRICE_PER_M）"
    : `约 ¥${costEstimate.toFixed(4)}（按配置的输入 ¥${inputPrice}/百万、输出 ¥${outputPrice}/百万 token 估算）`;
const usageLine = `input ${usageInput} / output ${usageOutput} token`;

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

const expandProblemLines = rows.filter((row) => row.expandOk === "0" || row.expandCitationOk === "0").length === 0
  ? "- 无"
  : rows.filter((row) => row.expandOk === "0" || row.expandCitationOk === "0")
    .map((row) => `- ${row.id}（${row.entryId || "无签"}）：expand_ok=${row.expandOk}，actions=${row.expandActions}，issue=${row.expandIssue || "无"}`)
    .join("\n");

const triageLines = rows.filter((row) => row.triageOk !== "n/a")
  .map((row) => `- ${row.id}：${row.triageOk === "1" ? "命中" : "未命中"}（期望 ${questions.find((item) => item.id === row.id)?.triage}，实际 ${row.triageKind || row.mode}）`)
  .join("\n");

const noMatchLines = rows.filter((row) => row.noMatchOk !== "n/a")
  .map((row) => `- ${row.id}：${row.noMatchOk === "1" ? "正确 no_match" : `未走 no_match（mode=${row.mode}，签=${row.signText}）`}`)
  .join("\n");

const modelSignRows = rows.filter((row) => row.sectionOk !== "n/a" && row.mode === "sign" && !row.degraded);
const modelSignHits = modelSignRows.filter((row) => row.sectionOk === "1").length;
const modelSignRecall = modelSignRows.length === 0 ? "0/0（无模型签行，n/a）" : pct(modelSignHits, modelSignRows.length);

const scenarioCategories = new Set(["租房", "工作", "钱", "健康", "关系", "安全"]);
const scenarioTriage = questions.filter((item) => item.triage && scenarioCategories.has(item.category));
const scenarioTriageIds = scenarioTriage.map((item) => item.id).join("、");
const adversarialTriageIds = questions.filter((item) => item.triage && item.category === "对抗").map((item) => item.id).join("、");

const degradedCauses: string[] = [];
if (!keyPresent) degradedCauses.push("no-key");
if (modelFailures > 0) degradedCauses.push(`modelFailures=${modelFailures}`);
if (degradedSigns > 0) degradedCauses.push(`degradedSigns=${degradedSigns}`);
if (fallbackRows > 0) degradedCauses.push(`fallbackRows=${fallbackRows}`);
if (expandFailures > 0) degradedCauses.push(`expandFailures=${expandFailures}`);
const modelValidated = keyPresent && modelFailures === 0 && degradedSigns === 0 && fallbackRows === 0 && expandFailures === 0;
const degraded = !modelValidated;
const modeLabel = modelValidated ? "model-validated" : `degraded（${degradedCauses.join("；")}）`;
const keyLabel = keyPresent ? "present（值未记录）" : "absent（未注入，未使用假 key）";
const modelLine = keyPresent
  ? `- 模型：${model}；发起模型调用 ${modelCalls} 次，失败 ${modelFailures} 次；累计 ${usageLine}`
  : `- 模型：${model}；模型调用 0 次（key 缺失，eval 客户端短路 ${modelAttempts} 次；若注入 key，这些就是实际会发出的请求）；累计 ${usageLine}`;

const noKeyNotes = !keyPresent
  ? `- 本报告是 **no-key/degraded baseline**：\`DEEPSEEK_API_KEY\` 缺失，路由、选签与展开的模型调用全部抛错，handler 降级为 curated 命中或 BM25 top-1 / 按书排序兜底。
- 因此 \`mode=fallback\` 的行是 curated 兜底，\`mode=sign\` 的行实际也是 BM25 兜底签，展开行是 fallback actions；这些数字**不代表 DeepSeek 模型效果**。
- 无匹配在降级路径下结构性失效：没有模型判定，BM25 对无关问题也会返回候选，handler 只会给出兜底签，所以无关题全部未走 \`no_match\`。这是降级路径的已知缺陷，不是模型评测结论。
- BM25 索引已按条目数组 memoize；延迟包含首次建索引的开销，不包含每次重新分词，但仍不能当作线上延迟。`
  : "";
const degradedNotes = modelValidated
  ? "- 本次运行使用真实 DeepSeek 调用，没有 `degraded=true` 的 sign 行、没有 `mode=fallback` 行、没有展开失败，也没有模型调用失败。"
  : `${noKeyNotes}
- 降级计数：modelFailures=${modelFailures}，degradedSigns=${degradedSigns}（mode=sign 且 degraded=true），fallbackRows=${fallbackRows}（mode=fallback），expandFailures=${expandFailures}/${expandAttempted}。由此本运行标注为 **degraded**，不标注 model-validated。`;

const sectionRate = signEvaluable.length === 0 ? 0 : sectionHits / signEvaluable.length * 100;
const gateLine = modelValidated
  ? `- 绑定门槛：全量章节召回 **≥ 90%**。本次 ${sectionRate.toFixed(1)}%，${sectionRate >= 90 ? "达标" : "**未达标**"}。`
  : `- 绑定门槛：全量章节召回 **≥ 90%**。本次 ${sectionRate.toFixed(1)}%，但本运行已标注 degraded，该数字只作降级基线，不能据此判定模型是否达标。`;
const expandGateLine = expandLatencies.length === 0
  ? "- 展开门槛：p95 < 8s。本次无签名 token，n/a。"
  : modelValidated
    ? `- 展开门槛：p95 < 8s。本次 ${expandPercentile(0.95)}ms，${expandPercentile(0.95) < 8000 ? "达标" : "**未达标**"}。`
    : `- 展开门槛：p95 < 8s。本次 ${expandPercentile(0.95)}ms，但本运行已标注 degraded（无 key 时展开走 fallback），不能据此判定模型展开是否达标。`;

const report = `# 有据 v1 评测结果

- 运行时间：${new Date().toISOString()}
- 运行模式：**${modeLabel}**
- DEEPSEEK_API_KEY：${keyLabel}
${modelLine}

${degradedNotes}

## 题集构成

- 总题量：${questions.length}
- 场景题：${scenarioCount}（其中 ${scenarioTriage.length} 题期望安全分流${scenarioTriageIds ? `：${scenarioTriageIds}` : ""}）
- 无关题（no_match）：${noMatchCount}
- 对抗题：${adversarialCount}（其中 ${questions.filter((item) => item.category === "对抗" && item.triage).length} 题期望分流${adversarialTriageIds ? `：${adversarialTriageIds}` : ""}）
- 期望分流合计：${triageCount}
- 可评分签题（非分流、非无关、有期望章节）：${signEvaluable.length}
- 展开题（带 signToken 的签名行）：${expandAttempted}

## 指标

| 指标 | 结果 | 定义 |
| --- | --- | --- |
| 章节召回（全部签行） | ${pct(sectionHits, signEvaluable.length)} | 签所在章节 ∈ 期望章节；分母为全部 ${signEvaluable.length} 道可评分签题；**包含 mode=fallback 的签名**，no_match/error 按未命中计 |
| 章节召回（仅模型签行） | ${modelSignRecall} | 分母 ${modelSignRows.length}，只计 mode=sign 且未标记 degraded 的行，排除 mode=fallback 与 degraded=true |
| 三类分流召回 | ${pct(triageHits, triageCount)} | mode=triage 且 kind 与期望一致 |
| 无匹配精确率 | ${pct(noMatchHits, noMatchCount)} | 无关题返回 mode=no_match |
| 引用失败（严格检查） | ${citationFailures} 条 | eval 专用严格检查：citation 与签对应条目不一致，或签文含被引条目正文不支持的数字/法条；语料排除 entry.id 与 section_no |
| 延迟（ask 端到端） | p50 ${percentile(0.5)}ms / p95 ${percentile(0.95)}ms / max ${sorted[sorted.length - 1] ?? 0}ms / avg ${average}ms | 含 handler 内部全流程，单线程顺序执行 |
| 展开延迟（expand 端到端） | ${expandLatencySummary} | 对每个带 signToken 的签名行调用 \`action:"expand"\`；含 handler 内部全流程，单线程顺序执行 |
| 展开成功 | ${pct(expandAttempted - expandFailures, expandAttempted)} | \`ok\` 存在、\`expand\` 存在且 actions 非空 |
| 展开引用失败（严格检查） | ${expandCitationFailures} 条 | action/avoid 的 citation 与条目不一致，或 action/cost/benefit 含被引条目正文不支持的数字/法条 |
| 模型 token 用量 | ${usageLine} | 从 \`proxyChat\` 返回的 usage 累计；无 key 时为 0 |
| 模型成本估算 | ${costLine} | 单价来自 \`EVAL_INPUT_PRICE_PER_M\` / \`EVAL_OUTPUT_PRICE_PER_M\`（元/百万 token）；未配置时只报 token |

${gateLine}
${expandGateLine}

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

## 引用失败（严格检查）

${citationFailureLines}

> 严格检查在 eval 中独立于产品守卫：支持语料排除 \`entry.id\` 与 \`entry.section_no\`（并剔除日期串），因此“可以退 15 万”这类仅靠条目编号 15-1 或发布日期里的 15 “过关”的文本会被标出。产品守卫 \`unsupportedClaims\` 仍把 ID/章节号算作支持证据，这是已知盲点；本报告不采用其判定。

## 展开失败（严格检查）

${expandProblemLines}

> 展开指标对每个签名 token 调用一次 \`action:"expand"\`。无 key 时展开会走 fallback actions（按书排序，最多 3 条），因此引用通常为真；这不代表模型展开的引用质量，也不能用来判定展开门槛。
> 严格检查会把产品 fallback 生成的定位语“先看第 X 节第 Y 条”以及条目标题里的日期（例如“2026 年 9 月 20 日”）标为引用失败：严格语料排除了条目编号、章节号和日期串。这是保守口径，不是模型编造。

## 人工复核

- 签文与展开项是否“合理且有引用支持”需要人工判断；机器结果逐行见 \`docs/eval-review.csv\`（保留 \`sign_text\`、\`citation\`、\`entry_id\`、\`section_no\`、\`expand_issue\` 列供复核）。
- 人工 20 行评分与理由单独保存在 \`docs/eval-human-review.md\`，eval 重跑不会覆盖该文件。该评分针对 d668ccb 的 no-key 降级基线，不是 DeepSeek 模型质量；有 key 重跑后需重新人工复核。
`;

mkdirSync(join(root, "docs"), { recursive: true });
writeFileSync(join(root, "docs", "eval-results.md"), report);

const csv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const header = [
  "id", "category", "question", "mode", "degraded", "section_ok", "triage_ok", "no_match_ok",
  "sign_text", "citation", "latency_ms", "entry_id", "section_no", "expected_sections",
  "citation_ok", "citation_issue", "triage_kind", "detail",
  "expand_ok", "expand_latency_ms", "expand_actions", "expand_citation_ok", "expand_issue",
];
const csvRows = rows.map((row) => [
  row.id, row.category, row.question, row.mode, row.degraded, row.sectionOk, row.triageOk, row.noMatchOk,
  row.signText, row.citation, row.latencyMs, row.entryId, row.sectionNo, row.expectedSections,
  row.citationOk, row.citationIssue, row.triageKind, row.detail,
  row.expandOk, row.expandLatencyMs, row.expandActions, row.expandCitationOk, row.expandIssue,
].map(csv).join(","));
writeFileSync(join(root, "docs", "eval-review.csv"), [header.map(csv).join(","), ...csvRows].join("\n"));

console.log(report);
if (degraded) console.warn("eval_degraded_run", { keyPresent, modelCalls, modelFailures, degradedSigns, fallbackRows, expandAttempted, expandFailures, expandCitationFailures });
