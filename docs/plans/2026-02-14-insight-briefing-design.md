# 每日洞察简报系统设计

> 灵感来源：ChatGPT Pulse — 从被动统计到主动研究的转变

## 概述

构建一个类似 ChatGPT Pulse 的每日洞察简报系统。核心理念：**不是统计汇总，而是主动研究**。系统每晚自动从内部数据中提取关注话题，搜索互联网获取最新情报，结合内部上下文生成 CEO 视角的洞察简报，第二天早上通过飞书推送精简版 + 网页查看完整版。

## 与 ChatGPT Pulse 的异同

| 维度 | ChatGPT Pulse | 我们的方案 |
|------|--------------|-----------|
| 兴趣来源 | 对话记忆（隐式） | 飞书消息 + 项目数据 + 手动配置（更精准） |
| 外部研究 | 搜索互联网 | 搜索互联网（相同） |
| 内部关联 | Gmail/Calendar | 飞书消息 + Pulse 项目 + 任务 + 圆桌 |
| 输出格式 | 手机卡片 | 飞书推送 + 网页卡片 |
| 反馈机制 | 👍👎 + 对话调整 | 👍👎 + 话题管理 + 隐式信号 |
| 受众 | 个人 | CEO/高管（单人，管理者视角） |

## 核心架构

```
[话题引擎] → [研究员] → [简报编排] → [分发]
   ↑                                      ↓
   └──────── [反馈闭环] ←─────────────────┘
```

四个模块形成夜间自动运行的流水线，反馈闭环持续优化话题精准度。

---

## 模块 1：话题引擎（Topic Engine）

### 作用
从内部数据和用户配置中，提炼出"今晚需要研究什么"。

### 输入源
- **飞书消息**（最近 24-72h）：提取讨论中反复出现的关键词、人名、项目名、外部公司名
- **项目 Pulse 数据**：风险和阻塞项中涉及的外部因素（如"苹果审核政策变更"、"某渠道封禁"）
- **圆桌讨论**：决策和风险中的关键词
- **手动配置**：用户设置的关注话题（如竞品名单、行业关键词、技术栈）

### 处理逻辑
1. 每天 22:00 触发
2. 收集最近飞书摘要 + 项目摘要 + 圆桌摘要作为上下文
3. LLM 调用提取 5-10 个「今天团队最关心的话题」
4. 和用户配置的固定话题合并去重
5. 按话题权重排序，选取 weight >= 20 的话题
6. 输出：话题列表，每个话题带关键词和搜索策略

### LLM Prompt 设计要点
- 角色：你是一个 CEO 的情报助理
- 任务：从团队对话和项目数据中识别 CEO 最应该关注的话题
- 要求：提取具体话题（"APT渠道结算延迟"），不要模糊概念（"支付问题"）
- 输出：JSON 数组 [{name, keywords[], reason}]

---

## 模块 2：研究员（Researcher）

### 作用
拿到话题列表后，搜索互联网获取最新信息，并和内部数据交叉分析。

### 每个话题的执行步骤

**Step A — 外部搜索**
- 对每个话题生成 1-3 个搜索查询词（中文 + 英文）
- 调用搜索 API 获取结果（标题、摘要、链接、日期）
- 过滤掉超过 7 天的旧内容

**Step B — 内容提取**
- 对最相关的 3-5 条结果，抓取网页正文
- 用 LLM 提取与话题相关的关键信息

**Step C — 内部关联**
- 在飞书消息中搜索该话题的相关对话（关键词匹配）
- 在 Pulse 项目条目中检索相关风险/决策
- 构建「外部情报 + 内部上下文」的完整画面

**Step D — 洞察生成**
- 外部搜索结果 + 内部关联数据一起给 LLM
- 从 CEO 视角生成：
  - 一句话概要
  - 关键发现（2-3 个要点）
  - 对我们的影响（结合内部数据）
  - 建议行动（是否需要关注/跟进）
  - 来源链接

### 搜索 API
推荐 **Serper**（$50/月 5万次查询）：
- 5-10 个话题 x 2-3 次搜索 = 每天约 15-30 次
- 支持中英文搜索
- REST API，接入简单

### 并发控制
- 话题并行研究，单个失败不影响其他
- 整个研究过程预计 3-5 分钟完成

---

## 模块 3：简报编排（Briefing Composer）

### 作用
把研究员产出的多个话题洞察，编排成一份结构化的每日简报。

### 编排逻辑
1. **排序**：按紧急度和影响力（内部风险/阻塞 > 行业重大变化 > 竞品动态 > 趋势信息）
2. **去重合并**：多个话题如果指向同一事件，合并为一条
3. **生成总结开篇**：2-3 句话的"今日要闻"
4. **限制数量**：最终输出 5-8 张卡片

### 卡片数据结构
```typescript
InsightCard {
  id: string
  category: 'risk' | 'industry' | 'competitor' | 'internal' | 'tech' | 'opportunity'
  priority: 'high' | 'medium' | 'low'
  title: string              // 一句话标题
  summary: string            // 2-3 句话概要
  details: string            // 完整分析（Markdown）
  impact: string             // 对我们的影响
  action: string | null      // 建议行动
  sources: { title, url }[]  // 信息来源
  relatedInternal: {         // 关联的内部数据
    feishuMessages?: string[]
    pulseEntries?: string[]
    tasks?: string[]
  }
  topicId: string            // 关联话题，用于反馈
}
```

---

## 模块 4：分发（Distribution）

### 渠道 A — 飞书推送（精简版）

每天 08:00 自动发送到指定飞书对话：

```
每日洞察简报 — 2月15日

[风险] APT渠道结算延迟，需关注2月底回款
[行业] 米哈游新作海外预注册破500万，东南亚市场竞争加剧
[技术] Unity 2026.1 发布，新渲染管线性能提升40%
...

共 6 条洞察 → 查看完整版：https://poamaster:3030/insights/daily/2026-02-15
```

### 渠道 B — POA Master 网页（完整版）

新建页面 `/insights/daily`：

- **顶部**：日期选择器 + "今日要闻"概要
- **卡片列表**：每张卡片可展开/收起
  - 收起：类型标签 + 标题 + 优先级
  - 展开：完整分析 + 影响评估 + 来源链接 + 关联内部数据
- **反馈按钮**：每张卡片 👍/👎 + "不再关注此话题"
- **底部**：话题管理入口

---

## 反馈闭环

### 三层反馈机制

**1. 卡片级反馈（即时）**
- 👍 = 这类信息有用，增加话题权重
- 👎 = 不感兴趣，降低话题权重
- "屏蔽此话题" = 永不再出现

**2. 话题管理（主动配置）**
- 页面 `/insights/topics`
- 查看所有被追踪的话题（自动提取 + 手动添加）
- 每个话题：来源、权重分数、最近命中次数
- 操作：调高/调低优先级、暂停、删除、添加新话题

**3. 隐式信号（自动）**
- 卡片被展开查看 = 轻微正向信号
- 卡片从未展开 = 轻微负向信号
- 连续 3 天无交互 = 自动降权
- 飞书对话中频繁出现的新关键词 = 自动升权

### 话题权重算法

每个话题维护 `weight` 分数（0-100）：

```
初始权重：
  手动添加 = 80
  自动提取 = 50

每日调整：
  👍 → +10
  👎 → -20
  展开查看 → +3
  未展开 → -2
  飞书消息命中 → +5
  连续3天无交互 → -15

阈值：
  weight < 10 → 自动暂停
  weight > 90 → 封顶
  研究门槛 = weight >= 20
```

---

## 数据模型

```prisma
model InsightTopic {
  id          String   @id @default(cuid())
  name        String                    // 话题名称
  keywords    String[] @default([])     // 搜索关键词
  source      String   @default("auto") // auto | manual
  weight      Int      @default(50)     // 权重 0-100
  isPaused    Boolean  @default(false)
  lastHitAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  cards       InsightCard[]
}

model InsightBriefing {
  id          String   @id @default(cuid())
  date        DateTime @unique          // 简报日期（一天一份）
  summary     String   @db.Text         // 今日要闻概要
  status      String   @default("generating") // generating | ready | sent
  feishuSent  Boolean  @default(false)
  cardCount   Int      @default(0)
  createdAt   DateTime @default(now())
  cards       InsightCard[]
}

model InsightCard {
  id          String   @id @default(cuid())
  briefingId  String
  topicId     String?
  category    String                    // risk | industry | competitor | internal | tech | opportunity
  priority    String   @default("medium")
  title       String
  summary     String   @db.Text
  details     String   @db.Text         // 完整 Markdown
  impact      String?  @db.Text
  action      String?  @db.Text
  sources     Json     @default("[]")   // [{title, url}]
  relatedData Json     @default("{}")   // 关联的内部数据
  feedback    Int?                      // 1=👍, -1=👎, null=未反馈
  viewedAt    DateTime?
  createdAt   DateTime @default(now())

  briefing    InsightBriefing @relation(fields: [briefingId], references: [id])
  topic       InsightTopic?   @relation(fields: [topicId], references: [id])

  @@index([briefingId])
  @@index([topicId])
}
```

---

## 定时调度

```
22:00  → 话题引擎运行（提取今日话题）
22:05  → 研究员启动（并行搜索 + 分析）
22:15  → 简报编排（汇总 + 排序）
22:20  → 存入数据库
08:00  → 飞书推送精简版
```

使用 node-cron 在 Next.js 应用内运行，或作为独立的定时脚本。

---

## 实施顺序建议

### Phase 1：最小可用版（1-2天）
1. Schema + Migration（InsightTopic, InsightBriefing, InsightCard）
2. 话题管理页面 `/insights/topics`（手动添加/管理话题）
3. 研究员 API（单话题搜索 + LLM 分析）
4. 手动触发生成简报（按钮触发，不需定时）
5. 简报查看页面 `/insights/daily`

### Phase 2：自动化（1天）
6. 话题引擎（从飞书/项目数据自动提取话题）
7. 定时调度（cron 夜间自动运行）
8. 飞书推送

### Phase 3：反馈闭环（1天）
9. 卡片反馈（👍👎）
10. 话题权重自动调整
11. 隐式信号采集（展开查看追踪）

---

## API 端点设计

```
GET    /api/insights/topics           — 话题列表
POST   /api/insights/topics           — 添加话题
PUT    /api/insights/topics/[id]      — 更新话题（权重/暂停/关键词）
DELETE /api/insights/topics/[id]      — 删除话题

POST   /api/insights/briefing/generate — 手动触发生成简报
GET    /api/insights/briefing          — 获取最新简报（或指定日期）
GET    /api/insights/briefing/[id]     — 获取简报详情

PUT    /api/insights/cards/[id]/feedback — 卡片反馈（👍👎）
PUT    /api/insights/cards/[id]/view     — 记录卡片查看

POST   /api/insights/briefing/send-feishu — 推送简报到飞书
```

---

## 技术依赖

- **搜索 API**：Serper（或 Bing Search API）
- **网页抓取**：fetch + cheerio（或 Readability.js）提取正文
- **LLM**：OpenAI GPT-4o（分析）/ GPT-4o-mini（话题提取）
- **定时任务**：node-cron
- **飞书推送**：复用现有 Feishu Open API 发消息能力
