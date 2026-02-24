# COO 记忆与智能系统设计

## 目标

将 AI 助手升级为拥有长期记忆的 COO 角色。每晚自动扫描全库数据，生成对业务的理解并累积记忆。对话时加载记忆上下文，以行业前 1% COO 的视角提供分析和建议。

## 三层记忆架构

### Layer 1 — 工作记忆（Working Memory）
- **触发**：每次 ChatBubble 对话时
- **内容**：实时查询数据库关键指标（逾期任务数、今日新增决策、at-risk OKR、紧急警报）
- **生命周期**：临时，不持久化
- **注入方式**：拼入 Claude CLI 的 system prompt

### Layer 2 — 情景记忆（Episodic Memory）
- **触发**：每晚 21:50 cron job
- **内容**：当日全库快照 + LLM 生成的叙事（今天发生了什么）+ 变化检测（与昨日对比）+ 行动建议
- **生命周期**：永久保留，每天一条
- **存储**：`CooMemoryEpisode` 表

### Layer 3 — 语义记忆（Semantic Memory）
- **触发**：每晚情景记忆生成后
- **内容**：COO 对公司的整体认知——业务理解、团队画像、趋势判断、经验教训
- **生命周期**：持续更新，只保留最新版本（但通过 version 字段可追溯）
- **存储**：`CooMemoryCore` 表

## 数据模型

```prisma
model CooMemoryCore {
  id        String   @id @default(cuid())
  content   String   // Markdown — COO 对公司的整体认知（~2000字）
  version   Int      @default(1)
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())
}

model CooMemoryEpisode {
  id        String   @id @default(cuid())
  date      DateTime @unique // 每天一条，日期去重
  snapshot  String   // 当日数据快照（JSON 字符串）
  narrative String   // LLM 生成的当日叙事（Markdown）
  changes   String   // 与昨日对比的变化检测（Markdown）
  actions   String   // COO 建议的行动项（Markdown）
  createdAt DateTime @default(now())
}
```

## 每晚数据采集维度

| 维度 | 表 | 查询内容 |
|------|---|---------|
| 任务 | Task | 总数、各状态(TODO/IN_PROGRESS/DONE/CANCELLED/POSTPONED)分布、今日新增、今日完成、逾期数、按 Assignee 分布 |
| 决策 | Decision | 总数、各状态分布、执行中占比、逾期决策列表 |
| OKR | Objective + KeyResult | 目标数、KR 平均进度、at-risk 项（进度 < 预期）、已完成目标 |
| 团队脉搏 | TeamPulse | 今日总消息量、活跃用户数、情绪评分、平均响应时间、高峰时段 |
| 舆情 | SentimentDailyStat + SentimentAlert | 监控游戏评分趋势、今日负面评论数、触发的警报 |
| 竞品 | Competitor* | 新动态数量、评分变化、关键新闻摘要 |
| 飞书 | FeishuMessage + ChatSignal | 今日消息总量、活跃群组 Top5、检测到的异常信号 |
| 洞察 | InsightCard | 今日生成的洞察卡片摘要 |

## 调度时序

```
21:50 — collectSnapshot()    全库扫描 → 生成 snapshot JSON
21:52 — generateNarrative()  LLM 对比昨日 snapshot → 生成 narrative + changes
21:55 — updateCoreMemory()   LLM 读取 CooMemoryCore + 今日 narrative → 更新语义记忆
21:58 — generateActions()    LLM 以 COO 视角生成行动建议 → 存入 episode.actions
22:00 — 现有 keyword generation（不变）
22:05 — 现有 briefing generation（不变）
```

## ChatBubble 记忆加载

修改 `lib/claude-worker.ts` 的 `processJob()`：

1. 查询 `CooMemoryCore`（最新一条 content）
2. 查询最近 3 天 `CooMemoryEpisode`（narrative + actions）
3. 实时查询紧急数据：逾期任务、at-risk OKR、今日新增决策
4. 拼接为增强 system prompt：

```
你是 POA Master 的 COO AI 助手。你拥有对公司业务的深度理解和持续记忆。

## 你对公司的认知
{CooMemoryCore.content}

## 最近三天发生的事
{最近3天 CooMemoryEpisode.narrative 摘要}

## 今日实时数据
- 逾期任务：X 个
- at-risk OKR：Y 个
- 今日新增决策：Z 个
- ...

请以行业前 1% COO 的专业水准回答用户的问题。
提供深度分析、风险预警、和可执行的建议。
用中文回答。
```

## COO 简报页面

新页面 `/coo-briefing`：

- **今日概览**：narrative + changes（情景记忆）
- **行动建议**：actions 列表，带优先级标签
- **业务仪表盘**：基于 snapshot 的关键指标可视化
- **历史回顾**：日历选择器，查看过去任何一天的记忆
- **认知模型**：展示 CooMemoryCore 内容（COO 对公司的理解）

## LLM 分配

| 场景 | LLM | 调用方式 |
|------|-----|---------|
| 每晚记忆生成（narrative/changes/actions） | GPT-5.2 | OpenAI API (`getOpenAIClient()`) |
| 语义记忆更新（core memory） | GPT-5.2 | OpenAI API |
| ChatBubble 对话 | Claude Sonnet | Claude CLI (`claude-worker.ts`) |

## 文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `prisma/schema.prisma` | 修改 | 新增 CooMemoryCore + CooMemoryEpisode 模型 |
| `lib/coo-memory/collector.ts` | 新建 | 全库扫描，生成 snapshot JSON |
| `lib/coo-memory/narrator.ts` | 新建 | LLM 生成 narrative + changes + actions |
| `lib/coo-memory/core-updater.ts` | 新建 | LLM 更新语义记忆 |
| `lib/coo-memory/loader.ts` | 新建 | 对话时加载三层记忆，拼接 system prompt |
| `lib/coo-memory/scheduler.ts` | 新建 | cron 调度，串联每晚流程 |
| `app/api/coo/memory/generate/route.ts` | 新建 | 手动触发记忆生成的 API |
| `app/api/coo/memory/route.ts` | 新建 | 获取最新记忆状态的 API |
| `app/api/coo/briefing/route.ts` | 新建 | 获取 COO 简报数据的 API |
| `app/(dashboard)/coo-briefing/page.tsx` | 新建 | COO 简报前端页面 |
| `lib/claude-worker.ts` | 修改 | processJob 中加载记忆注入 system prompt |
| `lib/insights/scheduler.ts` | 修改 | 集成 COO 记忆调度 |
| `components/Header.tsx` | 修改 | 导航栏增加 COO 简报入口 |
