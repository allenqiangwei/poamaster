# Sentiment Monitoring Phase 1 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add sentiment monitoring for 10 mobile games — collect App Store & Google Play reviews, analyze sentiment with LLM, display on dashboard.

**Architecture:** Standalone `services/sentiment-collector/` Node.js service (same pattern as `services/feishu-listener/`) writes reviews to shared PostgreSQL. POA Master provides game config CRUD, LLM analysis API, overview dashboard, and game detail pages.

**Tech Stack:** Next.js 16+ App Router, MUI components, Prisma ORM, PostgreSQL, `app-store-scraper`, `google-play-scraper`, `node-cron`, GPT-5.2 via existing `lib/openai.ts`.

**Key codebase patterns to follow:**
- Auth: cookie-based `verifySession()` from `lib/auth.ts` (see `app/api/feishu/chats/[chatId]/messages/route.ts` for reference)
- API response: `{ success: true, ...data }` or `{ error: '...' }` with status code
- Next.js 15+ params: `params` is a `Promise` — must `await params` in route handlers
- Pagination: `page` + `limit` query params, return `{ total, page, limit, totalPages }` (see feishu messages route)
- Styling: Use `designTokens` from `lib/theme.ts` (imported as `dt`), NOT raw color values
- Navigation: `NAV_ITEMS` array in `components/Header.tsx`
- Service pattern: See `services/feishu-listener/` — uses `tsx` runner, manual `.env` loading, PrismaClient directly, `.pid` file, graceful shutdown
- Port: dev server runs on **3030** (never 3000)

---

### Task 1: Prisma Schema — Add 5 Sentiment Models

**Files:**
- Modify: `prisma/schema.prisma` (append after line 629)
- Create: `prisma/migrations/20260214_add_sentiment_models/migration.sql`

**Step 1: Add models to schema.prisma**

Append the following after the last model in `prisma/schema.prisma`:

```prisma
// ============================================
// Sentiment Monitoring — 舆情监控模块
// ============================================

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

model SentimentReview {
  id              String   @id @default(cuid())
  gameId          String
  platform        String   // APP_STORE | GOOGLE_PLAY
  externalId      String
  author          String?
  rating          Int      // 1-5
  title           String?
  content         String   @db.Text
  language        String?
  sentimentScore  Float?   // -1.0 ~ 1.0
  sentimentLabel  String?  // POSITIVE | NEUTRAL | NEGATIVE
  keyIssues       String[] @default([])
  publishedAt     DateTime
  collectedAt     DateTime @default(now())

  game MonitoredGame @relation(fields: [gameId], references: [id], onDelete: Cascade)

  @@unique([platform, externalId])
  @@index([gameId, publishedAt])
  @@index([sentimentLabel])
}

model SentimentMention {
  id              String   @id @default(cuid())
  gameId          String
  platform        String   // X | FACEBOOK
  externalId      String
  author          String?
  authorFollowers Int?
  content         String   @db.Text
  url             String?
  sentimentScore  Float?
  sentimentLabel  String?
  keyIssues       String[] @default([])
  engagement      Json?
  publishedAt     DateTime
  collectedAt     DateTime @default(now())

  game MonitoredGame @relation(fields: [gameId], references: [id], onDelete: Cascade)

  @@unique([platform, externalId])
  @@index([gameId, publishedAt])
  @@index([sentimentLabel])
}

model SentimentAlert {
  id          String    @id @default(cuid())
  gameId      String
  type        String    // NEGATIVE_SPIKE | RATING_DROP | VIRAL_COMPLAINT
  severity    String    // HIGH | MEDIUM | LOW
  title       String
  summary     String    @db.Text
  dataPoints  Json?
  isRead      Boolean   @default(false)
  notifiedAt  DateTime?
  createdAt   DateTime  @default(now())

  game MonitoredGame @relation(fields: [gameId], references: [id], onDelete: Cascade)

  @@index([gameId, createdAt])
  @@index([isRead])
}

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

  game MonitoredGame @relation(fields: [gameId], references: [id], onDelete: Cascade)

  @@unique([gameId, date])
}
```

**Step 2: Write the migration SQL**

Create `prisma/migrations/20260214_add_sentiment_models/migration.sql`:

```sql
-- CreateTable MonitoredGame
CREATE TABLE "MonitoredGame" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appStoreId" TEXT,
    "googlePlayId" TEXT,
    "xKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fbKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "iconUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MonitoredGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable SentimentReview
CREATE TABLE "SentimentReview" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "author" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "language" TEXT,
    "sentimentScore" DOUBLE PRECISION,
    "sentimentLabel" TEXT,
    "keyIssues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SentimentReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable SentimentMention
CREATE TABLE "SentimentMention" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "author" TEXT,
    "authorFollowers" INTEGER,
    "content" TEXT NOT NULL,
    "url" TEXT,
    "sentimentScore" DOUBLE PRECISION,
    "sentimentLabel" TEXT,
    "keyIssues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "engagement" JSONB,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SentimentMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable SentimentAlert
CREATE TABLE "SentimentAlert" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "dataPoints" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SentimentAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable SentimentDailyStat
CREATE TABLE "SentimentDailyStat" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "mentionCount" INTEGER NOT NULL DEFAULT 0,
    "avgSentiment" DOUBLE PRECISION,
    "avgRating" DOUBLE PRECISION,
    "negativeCount" INTEGER NOT NULL DEFAULT 0,
    "positiveCount" INTEGER NOT NULL DEFAULT 0,
    "topIssues" JSONB,
    "summary" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SentimentDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SentimentReview_platform_externalId_key" ON "SentimentReview"("platform", "externalId");
CREATE INDEX "SentimentReview_gameId_publishedAt_idx" ON "SentimentReview"("gameId", "publishedAt");
CREATE INDEX "SentimentReview_sentimentLabel_idx" ON "SentimentReview"("sentimentLabel");

CREATE UNIQUE INDEX "SentimentMention_platform_externalId_key" ON "SentimentMention"("platform", "externalId");
CREATE INDEX "SentimentMention_gameId_publishedAt_idx" ON "SentimentMention"("gameId", "publishedAt");
CREATE INDEX "SentimentMention_sentimentLabel_idx" ON "SentimentMention"("sentimentLabel");

CREATE INDEX "SentimentAlert_gameId_createdAt_idx" ON "SentimentAlert"("gameId", "createdAt");
CREATE INDEX "SentimentAlert_isRead_idx" ON "SentimentAlert"("isRead");

CREATE UNIQUE INDEX "SentimentDailyStat_gameId_date_key" ON "SentimentDailyStat"("gameId", "date");

-- AddForeignKey
ALTER TABLE "SentimentReview" ADD CONSTRAINT "SentimentReview_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "MonitoredGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SentimentMention" ADD CONSTRAINT "SentimentMention_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "MonitoredGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SentimentAlert" ADD CONSTRAINT "SentimentAlert_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "MonitoredGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SentimentDailyStat" ADD CONSTRAINT "SentimentDailyStat_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "MonitoredGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

**Step 3: Apply migration**

```bash
cd /Users/allenqiang/poamaster
npx prisma db execute --file prisma/migrations/20260214_add_sentiment_models/migration.sql --schema prisma/schema.prisma
npx prisma migrate resolve --applied 20260214_add_sentiment_models --schema prisma/schema.prisma
npx prisma generate
```

Expected: All commands succeed. `npx prisma generate` outputs "Generated Prisma Client".

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260214_add_sentiment_models/
git commit -m "feat(sentiment): add 5 prisma models for sentiment monitoring"
```

---

### Task 2: Game Management API — CRUD

**Files:**
- Create: `app/api/sentiment/games/route.ts`
- Create: `app/api/sentiment/games/[id]/route.ts`

**Step 1: Create games list + create route**

Create `app/api/sentiment/games/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  try {
    const games = await prisma.monitoredGame.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { reviews: true, mentions: true, alerts: { where: { isRead: false } } },
        },
      },
    });
    return NextResponse.json({ success: true, games });
  } catch (error: any) {
    console.error('[Sentiment] Failed to list games:', error);
    return NextResponse.json({ error: 'Failed to list games' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  try {
    const body = await request.json();
    const { name, appStoreId, googlePlayId, xKeywords, fbKeywords, iconUrl } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Game name is required' }, { status: 400 });
    }

    const game = await prisma.monitoredGame.create({
      data: {
        name: name.trim(),
        appStoreId: appStoreId?.trim() || null,
        googlePlayId: googlePlayId?.trim() || null,
        xKeywords: xKeywords || [],
        fbKeywords: fbKeywords || [],
        iconUrl: iconUrl?.trim() || null,
      },
    });

    return NextResponse.json({ success: true, game }, { status: 201 });
  } catch (error: any) {
    console.error('[Sentiment] Failed to create game:', error);
    return NextResponse.json({ error: 'Failed to create game' }, { status: 500 });
  }
}
```

**Step 2: Create single game GET / PUT / DELETE route**

Create `app/api/sentiment/games/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  try {
    const { id } = await params;
    const game = await prisma.monitoredGame.findUnique({
      where: { id },
      include: {
        _count: {
          select: { reviews: true, mentions: true, alerts: { where: { isRead: false } } },
        },
      },
    });

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, game });
  } catch (error: any) {
    console.error('[Sentiment] Failed to get game:', error);
    return NextResponse.json({ error: 'Failed to get game' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, appStoreId, googlePlayId, xKeywords, fbKeywords, iconUrl, isActive } = body;

    const game = await prisma.monitoredGame.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(appStoreId !== undefined && { appStoreId: appStoreId?.trim() || null }),
        ...(googlePlayId !== undefined && { googlePlayId: googlePlayId?.trim() || null }),
        ...(xKeywords !== undefined && { xKeywords }),
        ...(fbKeywords !== undefined && { fbKeywords }),
        ...(iconUrl !== undefined && { iconUrl: iconUrl?.trim() || null }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json({ success: true, game });
  } catch (error: any) {
    console.error('[Sentiment] Failed to update game:', error);
    return NextResponse.json({ error: 'Failed to update game' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  try {
    const { id } = await params;
    await prisma.monitoredGame.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Sentiment] Failed to delete game:', error);
    return NextResponse.json({ error: 'Failed to delete game' }, { status: 500 });
  }
}
```

**Step 3: Verify by running dev server**

```bash
curl -s http://localhost:3030/api/sentiment/games --noproxy '*' -b "session=<valid-token>" | head -c 200
```

Expected: Returns `{"success":true,"games":[]}` (empty list since no games yet).

**Step 4: Commit**

```bash
git add app/api/sentiment/
git commit -m "feat(sentiment): add game CRUD API routes"
```

---

### Task 3: Reviews API + Sentiment Analysis API

**Files:**
- Create: `app/api/sentiment/games/[id]/reviews/route.ts`
- Create: `app/api/sentiment/analyze/route.ts`
- Create: `app/api/sentiment/overview/route.ts`

**Step 1: Create reviews list route (paginated)**

Create `app/api/sentiment/games/[id]/reviews/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const platform = searchParams.get('platform'); // APP_STORE | GOOGLE_PLAY | null
    const sentiment = searchParams.get('sentiment'); // POSITIVE | NEUTRAL | NEGATIVE | null

    const where: any = { gameId: id };
    if (platform) where.platform = platform;
    if (sentiment) where.sentimentLabel = sentiment;

    const [reviews, total] = await Promise.all([
      prisma.sentimentReview.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.sentimentReview.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      reviews,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error('[Sentiment] Failed to list reviews:', error);
    return NextResponse.json({ error: 'Failed to list reviews' }, { status: 500 });
  }
}
```

**Step 2: Create batch sentiment analysis API**

This endpoint is called by the collector service to analyze reviews in batches.

Create `app/api/sentiment/analyze/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOpenAIClient } from '@/lib/openai';

/**
 * POST /api/sentiment/analyze
 * Batch sentiment analysis for reviews/mentions.
 * Called by the sentiment-collector service.
 * Auth: uses a shared secret (SENTIMENT_API_SECRET) instead of session cookie.
 */
export async function POST(request: NextRequest) {
  // Service-to-service auth via shared secret
  const authHeader = request.headers.get('Authorization');
  const expectedSecret = process.env.SENTIMENT_API_SECRET;
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { reviewIds, mentionIds } = await request.json();

    const results: Array<{ id: string; type: string; sentimentScore: number; sentimentLabel: string; keyIssues: string[] }> = [];

    // Load unanalyzed reviews
    if (reviewIds?.length) {
      const reviews = await prisma.sentimentReview.findMany({
        where: { id: { in: reviewIds }, sentimentLabel: null },
        select: { id: true, content: true, title: true, rating: true },
      });

      if (reviews.length > 0) {
        const analyzed = await analyzeBatch(
          reviews.map(r => ({ id: r.id, text: [r.title, r.content].filter(Boolean).join(' — '), rating: r.rating }))
        );

        for (const item of analyzed) {
          await prisma.sentimentReview.update({
            where: { id: item.id },
            data: {
              sentimentScore: item.sentimentScore,
              sentimentLabel: item.sentimentLabel,
              keyIssues: item.keyIssues,
            },
          });
          results.push({ ...item, type: 'review' });
        }
      }
    }

    // Load unanalyzed mentions
    if (mentionIds?.length) {
      const mentions = await prisma.sentimentMention.findMany({
        where: { id: { in: mentionIds }, sentimentLabel: null },
        select: { id: true, content: true },
      });

      if (mentions.length > 0) {
        const analyzed = await analyzeBatch(
          mentions.map(m => ({ id: m.id, text: m.content }))
        );

        for (const item of analyzed) {
          await prisma.sentimentMention.update({
            where: { id: item.id },
            data: {
              sentimentScore: item.sentimentScore,
              sentimentLabel: item.sentimentLabel,
              keyIssues: item.keyIssues,
            },
          });
          results.push({ ...item, type: 'mention' });
        }
      }
    }

    return NextResponse.json({ success: true, analyzed: results.length, results });
  } catch (error: any) {
    console.error('[Sentiment] Analysis failed:', error);
    return NextResponse.json({ error: error.message || 'Analysis failed' }, { status: 500 });
  }
}

async function analyzeBatch(
  items: Array<{ id: string; text: string; rating?: number }>
): Promise<Array<{ id: string; sentimentScore: number; sentimentLabel: string; keyIssues: string[] }>> {
  const client = await getOpenAIClient();

  const itemList = items
    .map((item, i) => `[${i}] ${item.rating ? `(${item.rating}★) ` : ''}${item.text.slice(0, 500)}`)
    .join('\n');

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a game review sentiment analyzer. For each review, return:
- sentimentScore: float from -1.0 (very negative) to 1.0 (very positive)
- sentimentLabel: "POSITIVE" (score > 0.2), "NEGATIVE" (score < -0.2), or "NEUTRAL"
- keyIssues: array of 0-3 short English tags describing key issues/topics (e.g., "crash", "pay-to-win", "great-graphics", "server-lag", "fun-gameplay")

Return JSON: { "results": [ { "index": 0, "sentimentScore": 0.8, "sentimentLabel": "POSITIVE", "keyIssues": ["fun-gameplay"] }, ... ] }`
      },
      { role: 'user', content: itemList },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_completion_tokens: 1500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return [];

  const parsed = JSON.parse(content);
  const llmResults = parsed.results || [];

  return llmResults.map((r: any) => ({
    id: items[r.index]?.id,
    sentimentScore: r.sentimentScore ?? 0,
    sentimentLabel: r.sentimentLabel ?? 'NEUTRAL',
    keyIssues: r.keyIssues ?? [],
  })).filter((r: any) => r.id);
}
```

**Step 3: Create overview stats API**

Create `app/api/sentiment/overview/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      gameCount,
      todayReviews,
      todayMentions,
      pendingAlerts,
      games,
    ] = await Promise.all([
      prisma.monitoredGame.count({ where: { isActive: true } }),
      prisma.sentimentReview.count({ where: { collectedAt: { gte: today } } }),
      prisma.sentimentMention.count({ where: { collectedAt: { gte: today } } }),
      prisma.sentimentAlert.count({ where: { isRead: false } }),
      prisma.monitoredGame.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          iconUrl: true,
          reviews: {
            where: { collectedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
            select: { rating: true, sentimentLabel: true, keyIssues: true },
          },
          alerts: {
            where: { isRead: false },
            select: { id: true, type: true, severity: true, title: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 3,
          },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    // Compute per-game stats
    const gameStats = games.map(game => {
      const reviews = game.reviews;
      const total = reviews.length;
      const avgRating = total > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / total
        : null;
      const positiveCount = reviews.filter(r => r.sentimentLabel === 'POSITIVE').length;
      const positiveRatio = total > 0 ? positiveCount / total : null;

      // Top issues
      const issueCounts: Record<string, number> = {};
      for (const r of reviews) {
        for (const issue of r.keyIssues) {
          issueCounts[issue] = (issueCounts[issue] || 0) + 1;
        }
      }
      const topIssues = Object.entries(issueCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([tag]) => tag);

      return {
        id: game.id,
        name: game.name,
        iconUrl: game.iconUrl,
        avgRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
        positiveRatio: positiveRatio ? Math.round(positiveRatio * 100) : null,
        reviewCount: total,
        topIssues,
        unreadAlerts: game.alerts,
      };
    });

    return NextResponse.json({
      success: true,
      stats: { gameCount, todayReviews, todayMentions, pendingAlerts },
      gameStats,
    });
  } catch (error: any) {
    console.error('[Sentiment] Overview failed:', error);
    return NextResponse.json({ error: 'Failed to get overview' }, { status: 500 });
  }
}
```

**Step 4: Commit**

```bash
git add app/api/sentiment/
git commit -m "feat(sentiment): add reviews, analysis, and overview API routes"
```

---

### Task 4: Navigation — Add Sentiment Entry to Header

**Files:**
- Modify: `components/Header.tsx`

**Step 1: Add sentiment nav item**

In `components/Header.tsx`, add the import for the icon and the nav item.

Add to imports (after the existing icon imports around line 24):
```typescript
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
```

Add to `NAV_ITEMS` array (after the insights entry, before the `];`):
```typescript
{ path: '/sentiment', label: '舆情', icon: <MonitorHeartIcon fontSize="small" /> },
```

**Step 2: Verify visually**

Open `http://localhost:3030` in browser. The header should now show "舆情" tab.

**Step 3: Commit**

```bash
git add components/Header.tsx
git commit -m "feat(sentiment): add sentiment monitoring nav entry"
```

---

### Task 5: Game Management Page

**Files:**
- Create: `app/(dashboard)/sentiment/games/page.tsx`

**Step 1: Create game management page**

Create `app/(dashboard)/sentiment/games/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Typography, Button, Card, CardContent, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Chip, Switch, FormControlLabel, Snackbar, Alert,
  CircularProgress, alpha,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  SportsEsports as GameIcon, Apple as AppleIcon, Android as AndroidIcon,
} from '@mui/icons-material';
import { designTokens as dt } from '@/lib/theme';

interface MonitoredGame {
  id: string;
  name: string;
  appStoreId: string | null;
  googlePlayId: string | null;
  xKeywords: string[];
  fbKeywords: string[];
  iconUrl: string | null;
  isActive: boolean;
  _count: { reviews: number; mentions: number; alerts: number };
}

export default function GamesPage() {
  const router = useRouter();
  const [games, setGames] = useState<MonitoredGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<MonitoredGame | null>(null);
  const [snackbar, setSnackbar] = useState('');

  // Form state
  const [formName, setFormName] = useState('');
  const [formAppStoreId, setFormAppStoreId] = useState('');
  const [formGooglePlayId, setFormGooglePlayId] = useState('');
  const [formXKeywords, setFormXKeywords] = useState('');
  const [formFbKeywords, setFormFbKeywords] = useState('');

  const fetchGames = async () => {
    try {
      const res = await fetch('/api/sentiment/games', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setGames(data.games);
    } catch { setSnackbar('加载失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchGames(); }, []);

  const openCreateDialog = () => {
    setEditingGame(null);
    setFormName(''); setFormAppStoreId(''); setFormGooglePlayId('');
    setFormXKeywords(''); setFormFbKeywords('');
    setDialogOpen(true);
  };

  const openEditDialog = (game: MonitoredGame) => {
    setEditingGame(game);
    setFormName(game.name);
    setFormAppStoreId(game.appStoreId || '');
    setFormGooglePlayId(game.googlePlayId || '');
    setFormXKeywords(game.xKeywords.join(', '));
    setFormFbKeywords(game.fbKeywords.join(', '));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const body = {
      name: formName,
      appStoreId: formAppStoreId || null,
      googlePlayId: formGooglePlayId || null,
      xKeywords: formXKeywords ? formXKeywords.split(',').map(s => s.trim()).filter(Boolean) : [],
      fbKeywords: formFbKeywords ? formFbKeywords.split(',').map(s => s.trim()).filter(Boolean) : [],
    };

    try {
      const url = editingGame
        ? `/api/sentiment/games/${editingGame.id}`
        : '/api/sentiment/games';
      const res = await fetch(url, {
        method: editingGame ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setDialogOpen(false);
        fetchGames();
        setSnackbar(editingGame ? '已更新' : '已添加');
      } else {
        setSnackbar(data.error || '保存失败');
      }
    } catch { setSnackbar('网络错误'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这个游戏及其所有评论数据？')) return;
    try {
      const res = await fetch(`/api/sentiment/games/${id}`, {
        method: 'DELETE', credentials: 'include',
      });
      const data = await res.json();
      if (data.success) { fetchGames(); setSnackbar('已删除'); }
    } catch { setSnackbar('删除失败'); }
  };

  const handleToggleActive = async (game: MonitoredGame) => {
    try {
      await fetch(`/api/sentiment/games/${game.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !game.isActive }),
      });
      fetchGames();
    } catch { setSnackbar('更新失败'); }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>游戏管理</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>
          添加游戏
        </Button>
      </Box>

      {games.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <GameIcon sx={{ fontSize: 48, color: dt.text.muted, mb: 2 }} />
            <Typography color="text.secondary">还没有监控的游戏，点击「添加游戏」开始</Typography>
          </CardContent>
        </Card>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {games.map(game => (
            <Card key={game.id} sx={{ opacity: game.isActive ? 1 : 0.6 }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <GameIcon sx={{ fontSize: 36, color: dt.accent.main }} />
                <Box sx={{ flex: 1 }}>
                  <Typography
                    variant="subtitle1" fontWeight={700}
                    sx={{ cursor: 'pointer', '&:hover': { color: dt.accent.dark } }}
                    onClick={() => router.push(`/sentiment/games/${game.id}`)}
                  >
                    {game.name}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                    {game.appStoreId && (
                      <Chip icon={<AppleIcon />} label="App Store" size="small" variant="outlined" />
                    )}
                    {game.googlePlayId && (
                      <Chip icon={<AndroidIcon />} label="Google Play" size="small" variant="outlined" />
                    )}
                    <Chip label={`${game._count.reviews} 评论`} size="small" variant="outlined" />
                    {game._count.alerts > 0 && (
                      <Chip label={`${game._count.alerts} 预警`} size="small" color="error" />
                    )}
                  </Box>
                </Box>
                <FormControlLabel
                  control={<Switch checked={game.isActive} onChange={() => handleToggleActive(game)} size="small" />}
                  label={game.isActive ? '监控中' : '已暂停'}
                />
                <IconButton size="small" onClick={() => openEditDialog(game)}>
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" color="error" onClick={() => handleDelete(game.id)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingGame ? '编辑游戏' : '添加游戏'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="游戏名称" value={formName} onChange={e => setFormName(e.target.value)} required fullWidth />
          <TextField label="App Store ID" value={formAppStoreId} onChange={e => setFormAppStoreId(e.target.value)}
            placeholder="如: id123456789" fullWidth helperText="App Store 应用链接中的 ID" />
          <TextField label="Google Play Package" value={formGooglePlayId} onChange={e => setFormGooglePlayId(e.target.value)}
            placeholder="如: com.studio.game" fullWidth helperText="Google Play 应用的 package name" />
          <TextField label="X 搜索关键词" value={formXKeywords} onChange={e => setFormXKeywords(e.target.value)}
            placeholder="GameName, #GameName" fullWidth helperText="逗号分隔，用于 Phase 2" />
          <TextField label="Facebook 搜索关键词" value={formFbKeywords} onChange={e => setFormFbKeywords(e.target.value)}
            placeholder="GameName" fullWidth helperText="逗号分隔，用于 Phase 3" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleSave} disabled={!formName.trim()}>
            {editingGame ? '保存' : '添加'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snackbar} autoHideDuration={3000} onClose={() => setSnackbar('')}
        message={snackbar} />
    </Box>
  );
}
```

**Step 2: Verify visually**

Navigate to `http://localhost:3030/sentiment/games`. Should show empty state with "添加游戏" button. Add a test game.

**Step 3: Commit**

```bash
git add app/\(dashboard\)/sentiment/
git commit -m "feat(sentiment): add game management page"
```

---

### Task 6: Overview Dashboard Page

**Files:**
- Create: `app/(dashboard)/sentiment/page.tsx`

**Step 1: Create overview dashboard**

Create `app/(dashboard)/sentiment/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Typography, Card, CardContent, Grid, Chip, Button,
  CircularProgress, alpha,
} from '@mui/material';
import {
  SportsEsports as GameIcon, RateReview as ReviewIcon,
  Campaign as MentionIcon, Warning as AlertIcon,
  Star as StarIcon, Settings as SettingsIcon,
} from '@mui/icons-material';
import { designTokens as dt } from '@/lib/theme';

interface OverviewStats {
  gameCount: number;
  todayReviews: number;
  todayMentions: number;
  pendingAlerts: number;
}

interface GameStat {
  id: string;
  name: string;
  iconUrl: string | null;
  avgRating: number | null;
  positiveRatio: number | null;
  reviewCount: number;
  topIssues: string[];
  unreadAlerts: Array<{ id: string; type: string; severity: string; title: string; createdAt: string }>;
}

export default function SentimentPage() {
  const router = useRouter();
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [gameStats, setGameStats] = useState<GameStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/sentiment/overview', { credentials: 'include' });
        const data = await res.json();
        if (data.success) {
          setStats(data.stats);
          setGameStats(data.gameStats);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;
  }

  const statCards = [
    { label: '监控游戏', value: stats?.gameCount ?? 0, icon: <GameIcon />, color: dt.accent.main },
    { label: '今日评论', value: stats?.todayReviews ?? 0, icon: <ReviewIcon />, color: dt.teal.main },
    { label: '今日提及', value: stats?.todayMentions ?? 0, icon: <MentionIcon />, color: dt.purple.main },
    { label: '待处理预警', value: stats?.pendingAlerts ?? 0, icon: <AlertIcon />, color: stats?.pendingAlerts ? dt.danger.main : dt.success.main },
  ];

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>舆情监控</Typography>
        <Button variant="outlined" startIcon={<SettingsIcon />}
          onClick={() => router.push('/sentiment/games')}>
          管理游戏
        </Button>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {statCards.map(card => (
          <Grid size={{ xs: 6, md: 3 }} key={card.label}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{
                  p: 1, borderRadius: 2,
                  bgcolor: alpha(card.color, 0.1),
                  color: card.color,
                  display: 'flex',
                }}>
                  {card.icon}
                </Box>
                <Box>
                  <Typography variant="h5" fontWeight={800}>{card.value}</Typography>
                  <Typography variant="caption" color="text.secondary">{card.label}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Game Status Cards */}
      {gameStats.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <GameIcon sx={{ fontSize: 48, color: dt.text.muted, mb: 2 }} />
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              还没有监控的游戏
            </Typography>
            <Button variant="contained" onClick={() => router.push('/sentiment/games')}>
              添加游戏
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {gameStats.map(game => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={game.id}>
              <Card
                sx={{ cursor: 'pointer', '&:hover': { borderColor: dt.accent.main } }}
                onClick={() => router.push(`/sentiment/games/${game.id}`)}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <GameIcon sx={{ color: dt.accent.main }} />
                    <Typography variant="subtitle1" fontWeight={700} noWrap>
                      {game.name}
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 2, mb: 1.5 }}>
                    {game.avgRating !== null && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <StarIcon sx={{ fontSize: 18, color: dt.warning.main }} />
                        <Typography variant="body2" fontWeight={600}>{game.avgRating}</Typography>
                      </Box>
                    )}
                    {game.positiveRatio !== null && (
                      <Typography variant="body2" color={game.positiveRatio >= 60 ? 'success.main' : 'error.main'}>
                        {game.positiveRatio}% 正面
                      </Typography>
                    )}
                    <Typography variant="body2" color="text.secondary">
                      {game.reviewCount} 评论
                    </Typography>
                  </Box>

                  {game.topIssues.length > 0 && (
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {game.topIssues.map(issue => (
                        <Chip key={issue} label={issue} size="small" variant="outlined"
                          sx={{ fontSize: '0.7rem' }} />
                      ))}
                    </Box>
                  )}

                  {game.unreadAlerts.length > 0 && (
                    <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px solid ${dt.border.subtle}` }}>
                      {game.unreadAlerts.map(alert => (
                        <Typography key={alert.id} variant="caption" color="error.main" display="block">
                          {alert.severity === 'HIGH' ? '🔴' : '🟡'} {alert.title}
                        </Typography>
                      ))}
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
```

**Step 2: Verify visually**

Navigate to `http://localhost:3030/sentiment`. Should show stat cards and game cards (or empty state).

**Step 3: Commit**

```bash
git add app/\(dashboard\)/sentiment/page.tsx
git commit -m "feat(sentiment): add overview dashboard page"
```

---

### Task 7: Game Detail Page (Reviews + Trends)

**Files:**
- Create: `app/(dashboard)/sentiment/games/[id]/page.tsx`

**Step 1: Create game detail page**

Create `app/(dashboard)/sentiment/games/[id]/page.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Box, Typography, Card, CardContent, Button, Chip, Tabs, Tab,
  CircularProgress, Pagination, IconButton, alpha, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import {
  ArrowBack as BackIcon, Star as StarIcon,
  SentimentSatisfied as PositiveIcon, SentimentNeutral as NeutralIcon,
  SentimentDissatisfied as NegativeIcon, Apple as AppleIcon, Android as AndroidIcon,
} from '@mui/icons-material';
import { designTokens as dt } from '@/lib/theme';

interface GameDetail {
  id: string;
  name: string;
  appStoreId: string | null;
  googlePlayId: string | null;
  isActive: boolean;
  _count: { reviews: number; mentions: number; alerts: number };
}

interface Review {
  id: string;
  platform: string;
  author: string | null;
  rating: number;
  title: string | null;
  content: string;
  sentimentScore: number | null;
  sentimentLabel: string | null;
  keyIssues: string[];
  publishedAt: string;
}

const SENTIMENT_ICONS: Record<string, React.ReactNode> = {
  POSITIVE: <PositiveIcon sx={{ color: '#10b981', fontSize: 18 }} />,
  NEUTRAL: <NeutralIcon sx={{ color: '#f59e0b', fontSize: 18 }} />,
  NEGATIVE: <NegativeIcon sx={{ color: '#ef4444', fontSize: 18 }} />,
};

export default function GameDetailPage() {
  const router = useRouter();
  const { id } = useParams() as { id: string };

  const [game, setGame] = useState<GameDetail | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<string>('all');
  const [sentiment, setSentiment] = useState<string>('all');

  const fetchGame = useCallback(async () => {
    const res = await fetch(`/api/sentiment/games/${id}`, { credentials: 'include' });
    const data = await res.json();
    if (data.success) setGame(data.game);
  }, [id]);

  const fetchReviews = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (platform !== 'all') params.set('platform', platform);
    if (sentiment !== 'all') params.set('sentiment', sentiment);

    const res = await fetch(`/api/sentiment/games/${id}/reviews?${params}`, { credentials: 'include' });
    const data = await res.json();
    if (data.success) {
      setReviews(data.reviews);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    }
  }, [id, page, platform, sentiment]);

  useEffect(() => { fetchGame().finally(() => setLoading(false)); }, [fetchGame]);
  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;
  }

  if (!game) {
    return <Typography>游戏不存在</Typography>;
  }

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <IconButton onClick={() => router.push('/sentiment')}>
          <BackIcon />
        </IconButton>
        <Typography variant="h5" fontWeight={700}>{game.name}</Typography>
        <Chip label={`${game._count.reviews} 评论`} size="small" variant="outlined" />
      </Box>

      {/* Filters */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">平台:</Typography>
          <ToggleButtonGroup size="small" value={platform} exclusive
            onChange={(_, v) => { if (v) { setPlatform(v); setPage(1); } }}>
            <ToggleButton value="all">全部</ToggleButton>
            {game.appStoreId && <ToggleButton value="APP_STORE"><AppleIcon sx={{ fontSize: 16, mr: 0.5 }} />App Store</ToggleButton>}
            {game.googlePlayId && <ToggleButton value="GOOGLE_PLAY"><AndroidIcon sx={{ fontSize: 16, mr: 0.5 }} />Google Play</ToggleButton>}
          </ToggleButtonGroup>

          <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>情感:</Typography>
          <ToggleButtonGroup size="small" value={sentiment} exclusive
            onChange={(_, v) => { if (v) { setSentiment(v); setPage(1); } }}>
            <ToggleButton value="all">全部</ToggleButton>
            <ToggleButton value="POSITIVE">正面</ToggleButton>
            <ToggleButton value="NEUTRAL">中性</ToggleButton>
            <ToggleButton value="NEGATIVE">负面</ToggleButton>
          </ToggleButtonGroup>

          <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
            共 {total} 条
          </Typography>
        </CardContent>
      </Card>

      {/* Review List */}
      {reviews.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <Typography color="text.secondary">暂无评论数据</Typography>
            <Typography variant="caption" color="text.secondary">
              评论将在采集服务运行后自动出现
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {reviews.map(review => (
            <Card key={review.id}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  {/* Rating stars */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <StarIcon key={i} sx={{
                        fontSize: 14,
                        color: i < review.rating ? dt.warning.main : dt.border.default,
                      }} />
                    ))}
                  </Box>

                  {/* Sentiment */}
                  {review.sentimentLabel && SENTIMENT_ICONS[review.sentimentLabel]}

                  {/* Platform */}
                  <Chip
                    label={review.platform === 'APP_STORE' ? 'App Store' : 'Google Play'}
                    size="small" variant="outlined"
                    sx={{ fontSize: '0.65rem', height: 20 }}
                  />

                  {/* Author + date */}
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                    {review.author || 'Anonymous'} &middot; {new Date(review.publishedAt).toLocaleDateString()}
                  </Typography>
                </Box>

                {review.title && (
                  <Typography variant="body2" fontWeight={600} sx={{ mb: 0.25 }}>
                    {review.title}
                  </Typography>
                )}
                <Typography variant="body2" color="text.secondary" sx={{
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {review.content}
                </Typography>

                {review.keyIssues.length > 0 && (
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                    {review.keyIssues.map(issue => (
                      <Chip key={issue} label={issue} size="small"
                        sx={{ fontSize: '0.65rem', height: 18, bgcolor: alpha(dt.accent.main, 0.08) }} />
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Pagination count={totalPages} page={page} onChange={(_, p) => setPage(p)} />
        </Box>
      )}
    </Box>
  );
}
```

**Step 2: Verify visually**

Navigate to `http://localhost:3030/sentiment/games/<game-id>`. Should show empty reviews with filters.

**Step 3: Commit**

```bash
git add app/\(dashboard\)/sentiment/games/\[id\]/
git commit -m "feat(sentiment): add game detail page with review list"
```

---

### Task 8: Collection Service Scaffold

**Files:**
- Create: `services/sentiment-collector/package.json`
- Create: `services/sentiment-collector/tsconfig.json`
- Create: `services/sentiment-collector/src/index.ts`
- Create: `services/sentiment-collector/src/scheduler.ts`

**Step 1: Create package.json**

Create `services/sentiment-collector/package.json`:

```json
{
  "name": "sentiment-collector",
  "version": "1.0.0",
  "description": "App store review and social media collector for POA Master",
  "private": true,
  "scripts": {
    "start": "tsx src/index.ts",
    "dev": "tsx watch src/index.ts",
    "prisma:generate": "prisma generate --schema ../../prisma/schema.prisma"
  },
  "prisma": {
    "schema": "../../prisma/schema.prisma"
  },
  "dependencies": {
    "app-store-scraper": "^0.19.0",
    "google-play-scraper": "^9.1.1",
    "node-cron": "^3.0.0"
  },
  "devDependencies": {
    "@types/node-cron": "^3.0.11",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

**Step 2: Create tsconfig.json**

Create `services/sentiment-collector/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create scheduler.ts**

Create `services/sentiment-collector/src/scheduler.ts`:

```typescript
import cron from 'node-cron';
import { logger } from './logger.js';

type AsyncFn = () => Promise<void>;

interface ScheduledJob {
  name: string;
  schedule: string;
  fn: AsyncFn;
}

const jobs: ScheduledJob[] = [];

export function registerJob(name: string, schedule: string, fn: AsyncFn) {
  jobs.push({ name, schedule, fn });
}

export function startScheduler() {
  for (const job of jobs) {
    cron.schedule(job.schedule, async () => {
      logger.info(`[Scheduler] Running: ${job.name}`);
      try {
        await job.fn();
        logger.info(`[Scheduler] Completed: ${job.name}`);
      } catch (error: any) {
        logger.error(`[Scheduler] Failed: ${job.name}`, error.message);
      }
    });
    logger.info(`[Scheduler] Registered: ${job.name} (${job.schedule})`);
  }
}

/** Run a job immediately (for manual trigger / testing) */
export async function runNow(name: string) {
  const job = jobs.find(j => j.name === name);
  if (!job) throw new Error(`Job not found: ${name}`);
  logger.info(`[Scheduler] Manual run: ${name}`);
  await job.fn();
}
```

**Step 4: Create logger.ts**

Create `services/sentiment-collector/src/logger.ts`:

```typescript
const PREFIX = '[Sentiment]';

export const logger = {
  info: (...args: any[]) => console.log(PREFIX, ...args),
  warn: (...args: any[]) => console.warn(PREFIX, ...args),
  error: (...args: any[]) => console.error(PREFIX, ...args),
};
```

**Step 5: Create index.ts entry point**

Create `services/sentiment-collector/src/index.ts`:

```typescript
/**
 * Sentiment Collector Service — Entry Point
 *
 * Periodically collects app store reviews and (later) social media mentions,
 * sends them for LLM analysis, and stores results in shared PostgreSQL.
 */

import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { registerJob, startScheduler, runNow } from './scheduler.js';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_DIR = resolve(__dirname, '..');
const ROOT_DIR = resolve(SERVICE_DIR, '../..');

// Load .env
const envPath = join(ROOT_DIR, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
  logger.info(`Loaded env from ${envPath}`);
}

const PID_FILE = join(SERVICE_DIR, '.pid');
writeFileSync(PID_FILE, String(process.pid));

export const prisma = new PrismaClient();

async function main() {
  logger.info('Sentiment Collector starting...');
  logger.info(`PID: ${process.pid}`);

  // Register collection jobs
  registerJob('collect-reviews', '0 6 * * *', async () => {
    const { collectAllReviews } = await import('./collectors/appstore.js');
    await collectAllReviews();
    const { collectAllGooglePlayReviews } = await import('./collectors/googleplay.js');
    await collectAllGooglePlayReviews();
  });

  // Start scheduler
  startScheduler();

  // If --run-now flag, collect immediately
  if (process.argv.includes('--run-now')) {
    logger.info('Running immediate collection...');
    await runNow('collect-reviews');
  }

  logger.info('Collector is running. Press Ctrl+C to stop.');
}

async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down...`);
  await prisma.$disconnect();
  try { unlinkSync(PID_FILE); } catch {}
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
```

**Step 6: Install dependencies**

```bash
cd /Users/allenqiang/poamaster/services/sentiment-collector && npm install
```

**Step 7: Generate Prisma client for service**

```bash
cd /Users/allenqiang/poamaster/services/sentiment-collector && npx prisma generate --schema ../../prisma/schema.prisma
```

**Step 8: Commit**

```bash
cd /Users/allenqiang/poamaster
git add services/sentiment-collector/
git commit -m "feat(sentiment): scaffold collector service with scheduler"
```

---

### Task 9: App Store Collector

**Files:**
- Create: `services/sentiment-collector/src/collectors/appstore.ts`

**Step 1: Create App Store collector**

Create `services/sentiment-collector/src/collectors/appstore.ts`:

```typescript
import store from 'app-store-scraper';
import { prisma } from '../index.js';
import { logger } from '../logger.js';
import { analyzeNewReviews } from '../analyzer.js';

export async function collectAllReviews() {
  const games = await prisma.monitoredGame.findMany({
    where: { isActive: true, appStoreId: { not: null } },
    select: { id: true, name: true, appStoreId: true },
  });

  logger.info(`[AppStore] Collecting reviews for ${games.length} games...`);

  for (const game of games) {
    try {
      await collectGameReviews(game.id, game.name, game.appStoreId!);
    } catch (error: any) {
      logger.error(`[AppStore] Failed for ${game.name}:`, error.message);
    }
  }
}

async function collectGameReviews(gameId: string, gameName: string, appStoreId: string) {
  // appStoreId format: "id123456789" → extract numeric part
  const numericId = appStoreId.replace(/\D/g, '');
  if (!numericId) {
    logger.warn(`[AppStore] Invalid App Store ID for ${gameName}: ${appStoreId}`);
    return;
  }

  let newCount = 0;
  const pages = [1, 2, 3, 4, 5]; // Collect up to 5 pages (~50 reviews per page)

  for (const page of pages) {
    try {
      const reviews = await store.reviews({
        id: numericId,
        page,
        sort: store.sort.RECENT,
        country: 'us',
      });

      if (!reviews || reviews.length === 0) break;

      for (const review of reviews) {
        const externalId = String(review.id);

        try {
          await prisma.sentimentReview.create({
            data: {
              gameId,
              platform: 'APP_STORE',
              externalId,
              author: review.userName || null,
              rating: review.score || 3,
              title: review.title || null,
              content: review.text || '',
              publishedAt: review.updated ? new Date(review.updated) : new Date(),
            },
          });
          newCount++;
        } catch (error: any) {
          // Unique constraint violation = already collected
          if (error.code === 'P2002') continue;
          throw error;
        }
      }
    } catch (error: any) {
      logger.warn(`[AppStore] Page ${page} failed for ${gameName}:`, error.message);
      break;
    }
  }

  logger.info(`[AppStore] ${gameName}: ${newCount} new reviews`);

  // Trigger sentiment analysis for unanalyzed reviews
  if (newCount > 0) {
    await analyzeNewReviews(gameId);
  }
}
```

**Step 2: Commit**

```bash
cd /Users/allenqiang/poamaster
git add services/sentiment-collector/src/collectors/appstore.ts
git commit -m "feat(sentiment): add App Store review collector"
```

---

### Task 10: Google Play Collector

**Files:**
- Create: `services/sentiment-collector/src/collectors/googleplay.ts`

**Step 1: Create Google Play collector**

Create `services/sentiment-collector/src/collectors/googleplay.ts`:

```typescript
import gplay from 'google-play-scraper';
import { prisma } from '../index.js';
import { logger } from '../logger.js';
import { analyzeNewReviews } from '../analyzer.js';

export async function collectAllGooglePlayReviews() {
  const games = await prisma.monitoredGame.findMany({
    where: { isActive: true, googlePlayId: { not: null } },
    select: { id: true, name: true, googlePlayId: true },
  });

  logger.info(`[GooglePlay] Collecting reviews for ${games.length} games...`);

  for (const game of games) {
    try {
      await collectGameReviews(game.id, game.name, game.googlePlayId!);
    } catch (error: any) {
      logger.error(`[GooglePlay] Failed for ${game.name}:`, error.message);
    }
  }
}

async function collectGameReviews(gameId: string, gameName: string, googlePlayId: string) {
  let newCount = 0;

  try {
    const reviews = await gplay.reviews({
      appId: googlePlayId,
      sort: gplay.sort.NEWEST,
      num: 200, // max per request
      lang: 'en',
      country: 'us',
    });

    const reviewList = reviews.data || [];

    for (const review of reviewList) {
      const externalId = review.id;
      if (!externalId) continue;

      try {
        await prisma.sentimentReview.create({
          data: {
            gameId,
            platform: 'GOOGLE_PLAY',
            externalId,
            author: review.userName || null,
            rating: review.score || 3,
            title: review.title || null,
            content: review.text || '',
            publishedAt: review.date ? new Date(review.date) : new Date(),
          },
        });
        newCount++;
      } catch (error: any) {
        if (error.code === 'P2002') continue;
        throw error;
      }
    }
  } catch (error: any) {
    logger.error(`[GooglePlay] Collection error for ${gameName}:`, error.message);
  }

  logger.info(`[GooglePlay] ${gameName}: ${newCount} new reviews`);

  if (newCount > 0) {
    await analyzeNewReviews(gameId);
  }
}
```

**Step 2: Commit**

```bash
cd /Users/allenqiang/poamaster
git add services/sentiment-collector/src/collectors/googleplay.ts
git commit -m "feat(sentiment): add Google Play review collector"
```

---

### Task 11: Analyzer — Call POA Master LLM API

**Files:**
- Create: `services/sentiment-collector/src/analyzer.ts`

**Step 1: Create analyzer**

Create `services/sentiment-collector/src/analyzer.ts`:

```typescript
import { prisma } from './index.js';
import { logger } from './logger.js';

const BATCH_SIZE = 20;

// POA Master API base URL
const API_BASE = process.env.POA_MASTER_URL || 'http://localhost:3030';
const API_SECRET = process.env.SENTIMENT_API_SECRET || '';

export async function analyzeNewReviews(gameId: string) {
  const unanalyzed = await prisma.sentimentReview.findMany({
    where: { gameId, sentimentLabel: null },
    select: { id: true },
    take: 200,
  });

  if (unanalyzed.length === 0) return;

  logger.info(`[Analyzer] ${unanalyzed.length} unanalyzed reviews for game ${gameId}`);

  // Process in batches
  for (let i = 0; i < unanalyzed.length; i += BATCH_SIZE) {
    const batch = unanalyzed.slice(i, i + BATCH_SIZE);
    const reviewIds = batch.map(r => r.id);

    try {
      const res = await fetch(`${API_BASE}/api/sentiment/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_SECRET}`,
        },
        body: JSON.stringify({ reviewIds }),
      });

      if (!res.ok) {
        const text = await res.text();
        logger.error(`[Analyzer] API error (${res.status}):`, text);
        continue;
      }

      const data = await res.json();
      logger.info(`[Analyzer] Batch analyzed: ${data.analyzed} items`);
    } catch (error: any) {
      logger.error(`[Analyzer] Request failed:`, error.message);
    }
  }
}
```

**Step 2: Commit**

```bash
cd /Users/allenqiang/poamaster
git add services/sentiment-collector/src/analyzer.ts
git commit -m "feat(sentiment): add analyzer to call POA Master LLM API"
```

---

### Task 12: End-to-End Test — Manual Verification

**Step 1: Add SENTIMENT_API_SECRET to .env**

Append to `/Users/allenqiang/poamaster/.env`:
```
SENTIMENT_API_SECRET=sentiment-dev-secret-2026
```

**Step 2: Ensure dev server is running on port 3030**

```bash
# If not already running:
cd /Users/allenqiang/poamaster && npm run dev
```

**Step 3: Add a test game via the UI**

1. Open `http://localhost:3030/sentiment/games`
2. Click "添加游戏"
3. Fill in a real game — e.g. Name: "Clash of Clans", Google Play ID: "com.supercell.clashofclans", App Store ID: "id529479190"
4. Click "添加"

**Step 4: Run collector manually**

```bash
cd /Users/allenqiang/poamaster/services/sentiment-collector && npm start -- --run-now
```

Expected output: Reviews collected, then analyzed via API call. Something like:
```
[Sentiment] Sentiment Collector starting...
[Sentiment] [AppStore] Collecting reviews for 1 games...
[Sentiment] [AppStore] Clash of Clans: 42 new reviews
[Sentiment] [Analyzer] 42 unanalyzed reviews for game <id>
[Sentiment] [Analyzer] Batch analyzed: 20 items
[Sentiment] [Analyzer] Batch analyzed: 20 items
[Sentiment] [Analyzer] Batch analyzed: 2 items
[Sentiment] [GooglePlay] Collecting reviews for 1 games...
[Sentiment] [GooglePlay] Clash of Clans: 87 new reviews
...
```

**Step 5: Verify in UI**

1. Go to `http://localhost:3030/sentiment` — overview should show stats
2. Click on the game — should see reviews with sentiment labels, stars, and issue tags

**Step 6: Final commit if any tweaks needed**

```bash
git add -A
git commit -m "feat(sentiment): complete Phase 1 end-to-end integration"
```
