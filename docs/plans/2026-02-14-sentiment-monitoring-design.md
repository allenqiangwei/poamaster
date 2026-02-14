# Sentiment Monitoring Module Design

## Goal

为 POA Master 增加舆情监控模块，自动采集 10 款手游在 App Store、Google Play、X (Twitter)、Facebook 上的玩家评论和讨论，通过 LLM 进行情感分析，在仪表盘上展示趋势，异常时通过飞书实时预警。

## Background

- 用户是游戏公司 COO，游戏面向西方市场
- 10 款手游需要监控
- 评论主要是英文，关键词就是游戏名
- 核心需求：危机预警 + 日常趋势追踪 + 竞品对比（全部，按优先级逐步实现）

## Architecture

**方案：独立采集服务 + POA Master 面板**（与 feishu-listener 相同模式）

```
┌─────────────────────────────────────────────────────┐
│                    POA Master (Next.js)               │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ 游戏配置  │  │ 情感仪表盘│  │ LLM 分析 (GPT-5.2)│  │
│  │ /sentiment│  │ 趋势/预警 │  │ 情感打分+摘要     │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
└──────────────────────┬──────────────────────────────┘
                       │ shared PostgreSQL
┌──────────────────────┴──────────────────────────────┐
│           sentiment-collector (standalone Node.js)    │
│  ┌────────────┐ ┌────────────┐ ┌──────────────────┐ │
│  │App Store   │ │Google Play │ │ X API / Facebook │ │
│  │评论采集    │ │评论采集     │ │ 提及采集          │ │
│  └────────────┘ └────────────┘ └──────────────────┘ │
│           Scheduling: reviews daily / social 4h      │
└─────────────────────────────────────────────────────┘
         │
    异常检测 → 飞书通知
```

## Data Model

### MonitoredGame
游戏配置表，存储每款游戏的应用商店 ID、社交媒体关键词等。

```prisma
model MonitoredGame {
  id            String   @id @default(cuid())
  name          String
  appStoreId    String?
  googlePlayId  String?
  xKeywords     String[] @default([])
  fbKeywords    String[] @default([])
  iconUrl       String?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  reviews       SentimentReview[]
  mentions      SentimentMention[]
  alerts        SentimentAlert[]
  dailyStats    SentimentDailyStat[]
}
```

### SentimentReview
应用商店评论，通过 `@@unique([platform, externalId])` 防止重复导入。

```prisma
model SentimentReview {
  id              String   @id @default(cuid())
  gameId          String
  platform        String                        // APP_STORE | GOOGLE_PLAY
  externalId      String
  author          String?
  rating          Int                           // 1-5
  title           String?
  content         String   @db.Text
  language        String?
  sentimentScore  Float?                        // -1.0 ~ 1.0
  sentimentLabel  String?                       // POSITIVE | NEUTRAL | NEGATIVE
  keyIssues       String[] @default([])
  publishedAt     DateTime
  collectedAt     DateTime @default(now())

  game MonitoredGame @relation(fields: [gameId], references: [id])
  @@unique([platform, externalId])
  @@index([gameId, publishedAt])
  @@index([sentimentLabel])
}
```

### SentimentMention
社交媒体提及（X、Facebook），含互动数据。

```prisma
model SentimentMention {
  id              String   @id @default(cuid())
  gameId          String
  platform        String                        // X | FACEBOOK
  externalId      String
  author          String?
  authorFollowers Int?
  content         String   @db.Text
  url             String?
  sentimentScore  Float?
  sentimentLabel  String?
  keyIssues       String[] @default([])
  engagement      Json?                         // { likes, retweets, shares, comments }
  publishedAt     DateTime
  collectedAt     DateTime @default(now())

  game MonitoredGame @relation(fields: [gameId], references: [id])
  @@unique([platform, externalId])
  @@index([gameId, publishedAt])
  @@index([sentimentLabel])
}
```

### SentimentAlert
异常预警记录。

```prisma
model SentimentAlert {
  id          String   @id @default(cuid())
  gameId      String
  type        String                            // NEGATIVE_SPIKE | RATING_DROP | VIRAL_COMPLAINT
  severity    String                            // HIGH | MEDIUM | LOW
  title       String
  summary     String   @db.Text
  dataPoints  Json?
  isRead      Boolean  @default(false)
  notifiedAt  DateTime?
  createdAt   DateTime @default(now())

  game MonitoredGame @relation(fields: [gameId], references: [id])
  @@index([gameId, createdAt])
  @@index([isRead])
}
```

### SentimentDailyStat
每日聚合统计，加速仪表盘查询。

```prisma
model SentimentDailyStat {
  id              String   @id @default(cuid())
  gameId          String
  date            DateTime @db.Date
  reviewCount     Int      @default(0)
  mentionCount    Int      @default(0)
  avgSentiment    Float?
  avgRating       Float?
  negativeCount   Int      @default(0)
  positiveCount   Int      @default(0)
  topIssues       Json?
  summary         String?  @db.Text
  generatedAt     DateTime @default(now())

  game MonitoredGame @relation(fields: [gameId], references: [id])
  @@unique([gameId, date])
}
```

## Collection Service

### Structure

```
services/sentiment-collector/
├── src/
│   ├── index.ts              # entry + scheduler
│   ├── scheduler.ts          # node-cron scheduling
│   ├── collectors/
│   │   ├── appstore.ts       # app-store-scraper
│   │   ├── googleplay.ts     # google-play-scraper
│   │   ├── twitter.ts        # X API v2
│   │   └── facebook.ts       # Facebook Graph API
│   ├── analyzer.ts           # call POA Master LLM API
│   └── notifier.ts           # anomaly detection + Feishu notification
├── package.json
└── tsconfig.json
```

### Schedule

- App Store / Google Play reviews: daily at 06:00
- X mentions: every 4 hours
- Facebook mentions: every 4 hours (offset 30 min)
- Daily stats aggregation: daily at 23:00
- Anomaly detection: after each collection run

### Collection Flow

1. Read all `isActive=true` MonitoredGame from DB
2. For each game, call platform API/scraper
3. Deduplicate by `externalId`, insert only new items
4. Batch LLM sentiment analysis (20 items per batch)
5. Run anomaly detection
6. If anomaly → create SentimentAlert → Feishu notification

### LLM Analysis

Use existing GPT-5.2 integration. Batch 20 reviews per call, return structured JSON with sentimentScore, sentimentLabel, keyIssues.

### Anomaly Detection Rules

- `NEGATIVE_SPIKE`: negative review ratio > 60% in past 24h
- `RATING_DROP`: avg rating drops > 0.5 stars vs 7-day average
- `VIRAL_COMPLAINT`: single negative mention with engagement > 1000

## Frontend

### Routes

```
app/(dashboard)/sentiment/
├── page.tsx                  # overview dashboard
├── games/
│   ├── page.tsx              # game management (CRUD)
│   └── [id]/page.tsx         # single game detail
└── alerts/page.tsx           # alert center
```

### API Routes

```
app/api/sentiment/
├── games/route.ts            # GET list / POST create
├── games/[id]/route.ts       # GET / PUT / DELETE
├── games/[id]/reviews/route.ts  # GET reviews (paginated)
├── analyze/route.ts          # POST batch sentiment analysis
├── overview/route.ts         # GET global overview stats
├── alerts/route.ts           # GET alerts
├── alerts/[id]/route.ts      # PUT mark as read
└── daily-stats/route.ts      # GET daily trend data
```

### Overview Dashboard

- Stats cards: monitored games count, today's reviews, today's mentions, pending alerts
- 7-day sentiment trend chart (one line per game)
- Game status cards: avg rating with delta, positive %, top issue tags
- Recent alerts list

### Game Detail Page

- Sentiment + rating trend charts (7d/30d/90d toggle)
- Platform tabs: All / App Store / Google Play / X / Facebook
- Filterable review list with sentiment labels
- Pagination

### Navigation

Add "舆情监控" entry to sidebar, alongside Insight, Pulse, Todo.

## Feishu Alert Notification

Card message format with game name, alert type, severity, details, sample reviews, and link to detail page. Sent via Feishu webhook or existing bot.

## Implementation Phases

- **Phase 1**: Prisma models + game management + App Store/Google Play collection + LLM analysis + dashboard + detail page
- **Phase 2**: X (Twitter) monitoring
- **Phase 3**: Facebook monitoring
- **Phase 4**: Anomaly detection + Feishu alerts
- **Phase 5**: Competitor comparison + daily summary reports

## Dependencies

- `app-store-scraper` ^0.19.0
- `google-play-scraper` ^9.1.1
- `node-cron` ^3.0.0
- `@prisma/client` (shared with main project)
- X API v2 (fetch-based, Phase 2)
- Facebook Graph API (fetch-based, Phase 3)
