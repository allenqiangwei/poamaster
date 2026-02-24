# 竞品监控 (Competitive Intelligence) 设计文档

**目标**: 为手游竞品构建全方位情报体系，覆盖应用商店评论+评分、官网/产品页变化检测、行业新闻/财报三大数据源，AI 自动分析后融入现有 Insights Briefing 每日简报。

**架构**: 新增独立服务 `services/competitor-monitor/`（与 feishu-listener、sentiment-collector 同级），定时采集三类数据写入 PostgreSQL，由现有 Insights Briefing 管线在生成每日简报时消费。

**技术栈**: Node.js/TypeScript, Prisma ORM, node-cron, Claude AI (via claude-bridge), Cheerio (HTML 解析), RSS 解析

---

## 架构图

```
┌─────────────────────────────────────────────────┐
│             competitor-monitor 服务               │
│                                                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│  │ appstore.ts  │ │ webchange.ts│ │ news.ts     │ │
│  │ 应用商店采集  │ │ 网页变化检测 │ │ 新闻/RSS采集 │ │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ │
│         └───────────┬───┴───────────────┘         │
│              ┌──────▼──────┐                      │
│              │  Prisma DB   │                      │
│              └──────┬──────┘                      │
└─────────────────────┼─────────────────────────────┘
                      ▼
       现有 Insights Briefing 管线
       (collector → researcher → parser → storage)
       ── 新增"竞品情报"板块 InsightCard ──
```

---

## 1. 数据模型

### Competitor (竞品基本信息)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String @id | UUID |
| name | String | 竞品名称（如"原神"） |
| company | String? | 公司名（如"米哈游"） |
| appStoreId | String? | App Store app ID |
| googlePlayId | String? | Google Play package name |
| websiteUrl | String? | 官网 URL |
| monitorUrls | Json | 额外监控 URL 列表 `[{url, label}]` |
| rssFeeds | Json | RSS 源列表 `[{url, label}]` |
| keywords | Json | 搜索关键词 `["原神", "Genshin", "miHoYo"]` |
| enabled | Boolean @default(true) | 是否启用监控 |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### CompetitorAppSnapshot (应用商店快照)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String @id | UUID |
| competitorId | String | FK → Competitor |
| platform | String | "appstore" \| "googleplay" |
| rating | Float? | 当前评分 |
| ratingCount | Int? | 评分总数 |
| version | String? | 当前版本号 |
| releaseNotes | String? | 版本更新说明 |
| snapshotData | Json? | 其他快照数据 |
| createdAt | DateTime | 采集时间 |

### CompetitorReview (竞品评论)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String @id | UUID |
| competitorId | String | FK → Competitor |
| platform | String | "appstore" \| "googleplay" |
| externalId | String | 平台评论 ID |
| author | String? | 评论者 |
| rating | Int | 1-5 星 |
| title | String? | 评论标题 |
| content | String | 评论内容 |
| sentiment | Float? | 情感分数 -1~1 |
| tags | Json? | 问题标签 `["bug", "performance"]` |
| reviewDate | DateTime | 评论发布时间 |
| createdAt | DateTime | |

@@unique([platform, externalId])

### CompetitorWebChange (网页变化)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String @id | UUID |
| competitorId | String | FK → Competitor |
| url | String | 监控的 URL |
| changeType | String | "content" \| "major_update" \| "new_page" |
| summary | String? | AI 生成的变化摘要 |
| diffText | String? | 文本 diff |
| previousHash | String? | 上次内容 hash |
| currentHash | String? | 当前内容 hash |
| screenshotUrl | String? | 截图路径（可选） |
| createdAt | DateTime | |

### CompetitorNews (行业新闻)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String @id | UUID |
| competitorId | String? | FK → Competitor（可为 null 表示行业通用新闻） |
| title | String | 标题 |
| url | String | 原文链接 |
| source | String | 来源（如"GameLook"） |
| summary | String? | AI 生成的摘要 |
| impact | String? | AI 评估的影响（"HIGH" \| "MEDIUM" \| "LOW"） |
| category | String? | 分类（"funding" \| "product" \| "partnership" \| "personnel" \| "financial"） |
| publishedAt | DateTime? | 发布时间 |
| createdAt | DateTime | |

@@unique([url])

### CompetitorAlert (告警)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String @id | UUID |
| competitorId | String | FK → Competitor |
| alertType | String | "rating_drop" \| "major_update" \| "big_news" \| "website_change" |
| severity | String | "CRITICAL" \| "HIGH" \| "MEDIUM" |
| title | String | 告警标题 |
| summary | String | 告警摘要 |
| acknowledged | Boolean @default(false) | 是否已确认 |
| createdAt | DateTime | |

---

## 2. 数据采集

### 2a. 应用商店评论+评分 (`collectors/appstore.ts`)

- 复用 sentiment-collector 的 App Store / Google Play 采集逻辑
- 对每个 Competitor 的 appStoreId / googlePlayId 抓取：
  - 评分快照 → `CompetitorAppSnapshot`
  - 最新评论 → `CompetitorReview`（带情感分析）
  - 版本更新说明 → `CompetitorAppSnapshot.releaseNotes`
- **频率**: 每天 2 次（08:00, 20:00）
- **告警触发**: 评分日降 > 0.3 分

### 2b. 官网/产品页变化 (`collectors/webchange.ts`)

- 对每个 Competitor 的 websiteUrl + monitorUrls 抓取页面
- 使用 `fetch` + `cheerio` 提取主要文本内容（去除 header/footer/nav）
- 计算内容 hash，与上次快照比对
- 若变化超过阈值（文本长度变化 > 5%），用 Claude 生成变化摘要
- **频率**: 每 6 小时
- **告警触发**: 重大改版（变化 > 30%）

### 2c. 行业新闻/RSS (`collectors/news.ts`)

- 解析 Competitor.rssFeeds 配置的 RSS 源
- 按 Competitor.keywords 过滤相关新闻
- 对每条匹配的新闻用 Claude 生成摘要 + 影响评估
- **频率**: 每 4 小时
- **告警触发**: impact === "HIGH" 的新闻

---

## 3. AI 分析 & Briefing 融合

### 扩展现有 Insights 管线

**`lib/insights/collector.ts` 扩展**:
- 新增 `collectCompetitorData()` 函数
- 查询最近 24 小时的 CompetitorAppSnapshot、CompetitorWebChange、CompetitorNews
- 返回结构化竞品数据块

**`lib/insights/researcher.ts` 扩展**:
- 新增"竞品动态"topic 类型
- 专用 prompt：从竞品数据中提取 key insights，对比我方产品
- 输出格式与现有 InsightCard 一致

**InsightCard 新增类型**:
- `source: "competitor"` 标识来自竞品监控的卡片
- 在 Briefing 页面中显示为独立的"竞品情报"板块

---

## 4. 告警系统

复用现有 Feishu 通知通道（与 signal-detector 同模式）：

| 告警类型 | 触发条件 | 严重度 |
|----------|----------|--------|
| rating_drop | 竞品评分日降 > 0.3 | HIGH |
| major_update | 竞品发布重大版本 | MEDIUM |
| big_news | 竞品出现 HIGH impact 新闻 | HIGH |
| website_change | 竞品官网重大改版 | MEDIUM |

告警写入 `CompetitorAlert` 并推送到配置的飞书群。

---

## 5. 管理界面

在 Settings 页新增"竞品管理"Tab：
- 添加/编辑/删除竞品（名称、公司、App Store ID、Google Play ID、官网 URL）
- 管理监控 URL 列表和 RSS 源
- 配置搜索关键词
- 查看采集状态（最后采集时间、数据量）
- 手动触发采集

不新建独立导航入口，保持界面精简。

---

## 6. 服务运行

- PM2 管理：`ecosystem.config.cjs` 配置
- 启动命令：`pm2 start ecosystem.config.cjs`
- 与 feishu-listener、sentiment-collector 并行运行
- 共享 Prisma client 和数据库连接
