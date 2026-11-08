# 有据 · 部署与投稿检查清单

本文件只记录步骤，不包含任何 secret 值。Task 14 没有发布站点、没有创建公开资源、没有读取或写入任何密钥。**下面标“owner”的步骤只能由 owner 执行**。

## 0. 当前状态（本地已完成）

- [x] `npm run build` 通过（Vite 产物在 `dist/`，只有一个大于 500 kB 的 chunk 警告）。
- [x] `npm test` 通过：21 个测试文件、148 个测试。
- [x] 封面 `docs/cover.html` 已生成，并截图到 `public/cover.png`：1920×1080、PNG、316,961 字节（约 0.30 MiB）、16:9、小于 5MB，中文逐字核对正确。
- [x] 投稿说明 `docs/submission.md`、演示脚本 `docs/demo-script.md` 已就绪。
- [x] 公开 URL：`https://render.qmuse.pub/p/muse/6495219290401338/index.html`（QMuse 前端；Qoder 后端继续提供模型与 Agent API）。
- [ ] 有 key 评测结果：当前只有 no-key/degraded baseline，提交前必须替换。

## 1. 环境

- Node 22.20.0（满足 `^22.13.0 || >=24`），Windows + Git Bash。
- 本机 Git Bash 的 `ComSpec` 可能为空，`npm run <script>` 会静默失败。若遇到，显式设置：

```bash
export ComSpec='C:\Windows\System32\cmd.exe'
```

或者每条命令前加 `ComSpec='C:\Windows\System32\cmd.exe'`。

- 不要创建或提交 `.env` / `.env.*`；仓库 `.gitignore` 已排除。
- 不要把任何 key、HMAC secret 写进前端代码、仓库、截图或聊天记录。

## 2. owner：在 Qoder Sites 配置 Secrets

在要发布的 Qoder Site 的 **Settings → Secrets** 中添加：

| 名称 | 值 | 说明 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | owner 已有的 DeepSeek key | 只存在 Site Secret；不要粘贴进仓库或本地 `.env` |
| `APP_HMAC_SECRET` | 随机 32+ 字符 | 只存在 Site Secret；用于签/展开 token 的 HMAC |
| `AGENT_API_KEY` | 可选，随机 32+ 字符 | 可选；配置后 Agent 调用需带 `Authorization: Bearer <key>`，不配置则保持开放 |

`APP_HMAC_SECRET` 可由 owner 自己生成，例如在可信终端运行：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

生成后直接填入 Site Secret，不要提交、不要截图、不要贴进文档。轮换该值会让已发出的签/展开链接失效，这是预期行为。

## 3. 构建

```bash
cd /f/Qoder_game/youju
ComSpec='C:\Windows\System32\cmd.exe' npm run build
```

预期：`tsc --noEmit` 通过，`dist/` 生成，退出码 0。只有一个 Vite chunk > 500 kB 的警告，不是错误。

## 4. owner：发布 Qoder Sites

本任务不创建站点、不发布、不调用 `publish_site`。owner 确认后执行：

1. 在 Qoder 里对 `F:/Qoder_game/youju` 使用 `sites:sites-hosting` 技能准备站点。向技能说明：项目目录 `F:/Qoder_game/youju`，构建产物 `dist`，Function 目录 `functions`，开启 SPA 路由；由技能生成站点描述文件，不要手工猜文件名。
2. 站点配置必须是：

   ```text
   webDirectory: dist
   functionDirectory: functions
   spa: true
   ```

3. 如果技能在仓库里生成了站点描述文件（`.站点名称.qoder.site` 一类），把它一起提交，后续发布要靠它识别站点。
4. 先确认 Secrets 已配置、构建为最新，再发布。**没有 owner 明确同意，不要公开发布。**

预期：得到一个公开 URL。把 URL 替换到：

- `docs/submission.md` 的公开 URL（已填）；
- 本文件第 8 节；
- 如需要，`index.html` 的 `og:image` 可改为公开 URL 下的 `/cover.png` 绝对地址后重新构建、再次发布（可选）。

## 5. owner：公开 URL 验收（中国大陆、无 VPN）

用中国大陆移动网络、关闭 VPN，打开公开 URL，逐项检查：

- [ ] `/` 首页可打开，输入框、场景卡、今日一签正常。
- [ ] 输入“房东不退押金怎么办？”，点“翻一签”，能落到签卡。
- [ ] 点“展开这本账”，`/expand/...` 有行动、别做清单、书里没写的、该找谁。
- [ ] `/about` 显示“什么是答案之书”：是什么、怎么用、记录、边界。
- [ ] `/history` 显示本机翻签记录、连续天数与清空按钮；刷新后记录仍在，“再看一次”能直接打开原签。
- [ ] `/api` 显示 Agent API 说明，`/openapi.json` 可访问。
- [ ] `/functions/v1/app?action=health` 返回 `modelKeyConfigured`、`hmacConfigured`、`agentKeyConfigured` 三个布尔值；前两者都为 `true` 才说明 Secrets 生效，接口不会返回值本身。
- [ ] “存成签卡”能下载 1080×1440 PNG，图内含站点二维码和 CC BY 4.0 署名。
- [ ] 手机浏览器可用，无横向滚动、无遮挡。

若公开 URL 在中国大陆不可达或 TTFB 不可接受：把同一份 `dist/` + `functions/` 部署到阿里云 OSS + Function Compute 或腾讯云静态托管 + SCF，并更新投稿 URL。代码不需要改。

## 6. owner：验证公开 Agent API

把 `<public-url>` 换成实际地址：

```bash
curl --fail -X POST '<public-url>/functions/v1/app' \
  -H 'Content-Type: application/json' \
  -d '{"action":"agent","tool":"get_book_meta","input":{}}'

curl --fail -X POST '<public-url>/functions/v1/app' \
  -H 'Content-Type: application/json' \
  -d '{"action":"agent","tool":"ask_life_question","input":{"question":"房东不退押金怎么办"}}'
```

预期：

- `get_book_meta` 返回 `total: 772`、34 节、A/B/C 计数，以及版本 commit `21ad9068a207fb5f99d7ae60a9ef9a814a45ba20`。
- `ask_life_question` 返回 `mode: "sign"`，含签（`sign`）、展开（`expand`）、出处和 `disclaimer`；没有 key 时会走降级签并带 `degraded` 标记。
- 如果配置了 `AGENT_API_KEY`，不带 `Authorization: Bearer <key>` 会返回 401；未配置则开放。
- 如果返回 429，说明演示额度用尽（见第 7 节），响应头 `Retry-After` 是等待秒数，不是故障。

## 7. owner：有 key 评测（必须，提交前）

当前 `docs/eval-results.md` 是 **no-key/degraded baseline**，不能作为模型效果或门槛证据。用 owner 的 key 在本地重跑：

```bash
cd /f/Qoder_game/youju
ComSpec='C:\Windows\System32\cmd.exe' DEEPSEEK_API_KEY='<owner-key>' npm run eval
```

注意：

- key 只注入本次进程环境，不写 `.env`、不提交；命令历史可能留下明文，跑完清理 shell 历史或改用安全的注入方式。
- eval 在进程内调用 handler，不经过公开 URL，因此不会被线上 30 次/IP/天的额度影响；一次完整运行约 55 次章节路由 + 55 次选签 + 55 次展开的模型请求（分流题不路由），会产生少量费用。
- 若需要成本估算，额外注入 `EVAL_INPUT_PRICE_PER_M` / `EVAL_OUTPUT_PRICE_PER_M`（元/百万 token）；不注入时报告只记录 token 用量，不编造成本。
- 运行结束后，用新结果替换：
  - `docs/eval-results.md`（整份报告由脚本生成，含 ask / expand 延迟、展开引用失败、token 与成本）；
  - `docs/submission.md` 的“评测”表格与文字，删除“no-key/degraded baseline”的当前数字；
  - `docs/eval-human-review.md` 的 20 条人工复核（按新 CSV 重新抽前 20 条签行评分）。
- 在新结果出来之前，对外只说“本地降级基线”，不引用 90% 章节召回门槛作为已通过。

线上额度（部署后的真实限制，写进投稿说明即可，不是本地 eval 的限制）：

- 网页每 IP 每天 30 次问、10 次展开；
- Agent 的 `ask_life_question` 使用独立额度：每 IP 每天 20 次（非分流问题才计数），不和网页额度互相挤占；
- 全局每天 500 次问、200 次展开、200 次 Agent 问；
- 重复问题命中进程内缓存时不调用模型；缓存最多 100 条、30 分钟过期；
- 分流问题在限流之前处理，不占额度。

这些计数器是 **per-isolate 的内存软限额**：Qoder Sites 可能同时跑多个 Function isolate，每个 isolate 各有一份计数；冷启动或扩容后计数会重置。它用于挡住公开链接被刷和演示成本失控，不是精确计费。客户端 IP 的取法：优先平台设置的 `cf-connecting-ip` / `x-real-ip`，否则只看 `x-forwarded-for` 的**最后一跳**（最近代理），不接受客户端可轮换的第一跳。若平台不设置这些头，所有请求会落到 `unknown` 共享桶。需要精确额度时再换持久计数（KV/数据库）。

## 8. owner：投稿

提交前先在赛事官网核对截止日期。工作日期是 **2026-12-06 23:59**，但部分新闻仍写 11-10，必须以官网为准。

需要提交：

- [x] 公开 URL：`https://render.qmuse.pub/p/muse/6495219290401338/index.html`
- [ ] 封面：`public/cover.png`（1920×1080，16:9，< 5MB，自有封面）
- [ ] 作品说明：`docs/submission.md` 的内容
- [ ] 可选演示视频：按 `docs/demo-script.md` 录制，60–90 秒、1080p、MP4、< 500MB，放在 `docs/`，不要放进 `public/`
- [ ] 团队：solo（1 人）
- [ ] 作品名与一句话形态：有据 / Web 智能体 + 可调用 Agent API

提交后再打开一次公开 URL，确认第 5 节所有路由仍然可用。

## 9. 本次 Task 14 未做的事（明确边界）

- 没有创建 Qoder Site，没有发布，没有调用 `publish_site`。
- 没有创建、读取、修改或删除任何 Site Secret；没有读取 `DEEPSEEK_API_KEY` 或 `APP_HMAC_SECRET`。
- 已生成公开 URL：`https://youju-krtzz7phy1t.qoder.zone`（公开访问）。
- 没有上传任何公开资源，没有录制或上传视频。
- 封面为 HTML + 本地 headless Chrome 截图，未使用官方封面、果麦标识或图片模型文字。
