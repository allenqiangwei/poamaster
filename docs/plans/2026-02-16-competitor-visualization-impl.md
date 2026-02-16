# Competitor Visualization System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a 4-page competitor intelligence visualization system with dashboard overview, single-competitor detail, multi-competitor comparison, and news feed.

**Architecture:** 8 new API routes returning aggregated data from 5 Prisma models (Competitor, CompetitorAppSnapshot, CompetitorReview, CompetitorWebChange, CompetitorNews, CompetitorAlert). 3 new frontend pages + 1 refactored page using Recharts for charts. All pages are `'use client'` components following the existing sentiment page pattern.

**Tech Stack:** Next.js App Router, MUI, Recharts (already installed), Prisma, TypeScript

---

## Conventions Reference

Before implementing, note these project conventions:

- **Auth pattern**: Every API route starts with cookie → `verifySession()` check (see `app/api/competitors/route.ts`)
- **Design tokens**: Import `{ designTokens as dt } from '@/lib/theme'` — use `dt.accent.main`, `dt.teal.main`, `dt.purple.main`, `dt.danger.main`, `dt.text.muted`, `dt.bg.elevated`, etc.
- **Next.js 15+ params**: Dynamic route params are `Promise` — must `await params` (see `app/api/competitors/[id]/route.ts:14`)
- **Port**: Dev server runs on **3030** (`next dev -p 3030`)
- **Color palette for multi-series charts**: `[dt.accent.main, dt.teal.main, dt.purple.main, '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6']`

---

## Task 1: Dashboard API (`/api/competitors/dashboard`)

**Files:**
- Create: `app/api/competitors/dashboard/route.ts`

**Step 1: Create the dashboard API route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // KPI stats
    const [
      competitorCount,
      thisWeekReviews,
      lastWeekReviews,
      unacknowledgedAlerts,
    ] = await Promise.all([
      prisma.competitor.count({ where: { enabled: true } }),
      prisma.competitorReview.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.competitorReview.count({
        where: { createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
      }),
      prisma.competitorAlert.count({ where: { acknowledged: false } }),
    ]);

    // Per-competitor card data
    const competitors = await prisma.competitor.findMany({
      where: { enabled: true },
      select: {
        id: true, name: true, company: true,
        appStoreId: true, googlePlayId: true,
        _count: { select: { alerts: { where: { acknowledged: false } } } },
      },
      orderBy: { name: 'asc' },
    });

    const cardData = await Promise.all(
      competitors.map(async (c) => {
        // Latest rating
        const latestSnapshot = await prisma.competitorAppSnapshot.findFirst({
          where: { competitorId: c.id },
          orderBy: { createdAt: 'desc' },
          select: { rating: true, createdAt: true },
        });
        // Rating 7 days ago
        const weekAgoSnapshot = await prisma.competitorAppSnapshot.findFirst({
          where: { competitorId: c.id, createdAt: { lte: sevenDaysAgo } },
          orderBy: { createdAt: 'desc' },
          select: { rating: true },
        });
        // Review count + positive ratio last 7 days
        const recentReviews = await prisma.competitorReview.findMany({
          where: { competitorId: c.id, createdAt: { gte: sevenDaysAgo } },
          select: { sentiment: true },
        });
        const reviewCount = recentReviews.length;
        const positiveCount = recentReviews.filter(
          (r) => r.sentiment !== null && r.sentiment > 0.3
        ).length;

        return {
          id: c.id,
          name: c.name,
          company: c.company,
          platforms: [
            c.appStoreId ? 'App Store' : null,
            c.googlePlayId ? 'Google Play' : null,
          ].filter(Boolean),
          currentRating: latestSnapshot?.rating ?? null,
          ratingTrend: latestSnapshot?.rating && weekAgoSnapshot?.rating
            ? Math.round((latestSnapshot.rating - weekAgoSnapshot.rating) * 100) / 100
            : null,
          reviewCount,
          positiveRatio: reviewCount > 0
            ? Math.round((positiveCount / reviewCount) * 100)
            : null,
          unreadAlerts: c._count.alerts,
        };
      })
    );

    // Average rating across all competitors (latest snapshots)
    const avgRatingResult = await prisma.$queryRaw<[{ avg: number | null }]>`
      SELECT AVG(sub.rating) as avg FROM (
        SELECT DISTINCT ON ("competitorId") rating
        FROM "CompetitorAppSnapshot"
        WHERE rating IS NOT NULL
        ORDER BY "competitorId", "createdAt" DESC
      ) sub
    `;
    const avgRating = avgRatingResult[0]?.avg
      ? Math.round(avgRatingResult[0].avg * 10) / 10
      : null;

    // Rating trend chart data (last 30 days)
    const snapshots = await prisma.competitorAppSnapshot.findMany({
      where: { createdAt: { gte: thirtyDaysAgo }, rating: { not: null } },
      select: { competitorId: true, rating: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date+competitor, take last rating per day
    const ratingByDay = new Map<string, number>();
    for (const s of snapshots) {
      const dateStr = s.createdAt.toISOString().split('T')[0];
      const key = `${dateStr}|${s.competitorId}`;
      ratingByDay.set(key, s.rating!);
    }

    // Build chart series: { date, [competitorName]: rating }
    const compNames = new Map(competitors.map((c) => [c.id, c.name]));
    const dateSet = new Set<string>();
    for (const s of snapshots) {
      dateSet.add(s.createdAt.toISOString().split('T')[0]);
    }
    const sortedDates = [...dateSet].sort();
    const ratingTrend = sortedDates.map((date) => {
      const point: Record<string, any> = { date };
      for (const c of competitors) {
        const key = `${date}|${c.id}`;
        point[c.name] = ratingByDay.get(key) ?? null;
      }
      return point;
    });

    // Recent alerts (latest 5 unacknowledged)
    const recentAlerts = await prisma.competitorAlert.findMany({
      where: { acknowledged: false },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { competitor: { select: { name: true } } },
    });

    return NextResponse.json({
      success: true,
      kpi: {
        competitorCount,
        thisWeekReviews,
        reviewChange: thisWeekReviews - lastWeekReviews,
        avgRating,
        unacknowledgedAlerts,
      },
      cardData,
      ratingTrend,
      competitorNames: competitors.map((c) => c.name),
      recentAlerts: recentAlerts.map((a) => ({
        id: a.id,
        severity: a.severity,
        title: a.title,
        competitorName: a.competitor.name,
        createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    console.error('Failed to get competitor dashboard:', error);
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
```

**Step 2: Verify API responds**

Run: `curl -s --noproxy '*' -o /dev/null -w '%{http_code}' http://127.0.0.1:3030/api/competitors/dashboard`
Expected: `401` (auth required, confirms route compiles)

**Step 3: Commit**

```bash
git add 'app/api/competitors/dashboard/route.ts'
git commit -m "feat: add competitor dashboard overview API"
```

---

## Task 2: Alerts API (`/api/competitors/alerts`)

**Files:**
- Create: `app/api/competitors/alerts/route.ts`

**Step 1: Create alerts API with GET + PATCH**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const searchParams = request.nextUrl.searchParams;
  const competitorId = searchParams.get('competitorId');
  const acknowledged = searchParams.get('acknowledged');

  const where: any = {};
  if (competitorId) where.competitorId = competitorId;
  if (acknowledged !== null) where.acknowledged = acknowledged === 'true';

  const alerts = await prisma.competitorAlert.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { competitor: { select: { name: true } } },
  });

  return NextResponse.json({ success: true, alerts });
}

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const { id, acknowledged } = await request.json();
  if (!id) return NextResponse.json({ error: 'Missing alert id' }, { status: 400 });

  await prisma.competitorAlert.update({
    where: { id },
    data: { acknowledged: acknowledged ?? true },
  });

  return NextResponse.json({ success: true });
}
```

**Step 2: Commit**

```bash
git add 'app/api/competitors/alerts/route.ts'
git commit -m "feat: add competitor alerts API (list + acknowledge)"
```

---

## Task 3: Refactor Dashboard Page (`/insights/competitors`)

**Files:**
- Modify: `app/(dashboard)/insights/competitors/page.tsx` (full rewrite)

This is the largest task. Replace the current CRUD-only page with the full dashboard.

**Step 1: Rewrite the page**

The page should:
1. Fetch from `/api/competitors/dashboard` and `/api/competitors/collect`
2. Show 4 KPI stat cards in a Grid row
3. Show a Recharts LineChart for rating trends (30 days)
4. Show enhanced competitor cards in a Grid (clickable → detail page)
5. Show recent unacknowledged alerts panel at the bottom
6. Add sub-navigation tabs: [总览] [对比] [新闻] [管理]
7. Keep the existing CRUD dialog for "管理" tab
8. Keep the existing "立即获取" button + service status + countdown

**Key imports:**
```ts
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
```

**KPI cards pattern** (follow sentiment page `statCards` array):
```ts
const kpiCards = [
  { key: 'competitorCount', label: '监控竞品', icon: GroupsIcon, color: dt.accent.main, subtle: dt.accent.subtle },
  { key: 'thisWeekReviews', label: '本周评论', icon: RateReviewIcon, color: dt.teal.main, subtle: dt.teal.subtle },
  { key: 'avgRating', label: '平均评分', icon: StarIcon, color: dt.purple.main, subtle: dt.purple.subtle },
  { key: 'unacknowledgedAlerts', label: '待处理告警', icon: WarningIcon, color: dt.danger.main, subtle: dt.danger.subtle },
];
```

**Tab navigation** — Use MUI `ToggleButtonGroup` or `Tabs` at top:
```tsx
const [activeTab, setActiveTab] = useState('overview');
// Tabs: overview | compare | news | manage
// compare and news navigate to their pages via router.push()
```

**Competitor card** — wrap in `CardActionArea` linking to `/insights/competitors/${c.id}`:
- Show currentRating as large Typography (variant="h4")
- Show ratingTrend as colored arrow (green ↑ / red ↓)
- Show reviewCount + positiveRatio
- Platform chips
- Alert badge
- Menu button (3-dot) → edit, delete, toggle enabled

**Rating trend chart:**
```tsx
<ResponsiveContainer width="100%" height={300}>
  <LineChart data={ratingTrend}>
    <CartesianGrid strokeDasharray="3 3" stroke={dt.border.default} />
    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
    <YAxis domain={[1, 5]} tick={{ fontSize: 12 }} />
    <Tooltip />
    <Legend />
    {competitorNames.map((name, i) => (
      <Line key={name} type="monotone" dataKey={name}
        stroke={COLORS[i % COLORS.length]} strokeWidth={2}
        dot={false} connectNulls />
    ))}
  </LineChart>
</ResponsiveContainer>
```

**Alerts panel:**
```tsx
{recentAlerts.map(alert => (
  <Box key={alert.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
    <Chip label={alert.severity} size="small"
      color={alert.severity === 'HIGH' ? 'error' : alert.severity === 'MEDIUM' ? 'warning' : 'default'} />
    <Typography variant="body2" sx={{ flex: 1 }}>{alert.title}</Typography>
    <Typography variant="caption" color="text.secondary">{alert.competitorName}</Typography>
    <IconButton size="small" onClick={() => acknowledgeAlert(alert.id)}>
      <CheckIcon fontSize="small" />
    </IconButton>
  </Box>
))}
```

**Step 2: Verify page loads**

Open `http://localhost:3030/insights/competitors` in browser. Should see:
- KPI cards row
- Rating trend chart (may be empty if no data)
- Competitor cards with ratings
- Alerts panel

**Step 3: Commit**

```bash
git add 'app/(dashboard)/insights/competitors/page.tsx'
git commit -m "feat: refactor competitor page into dashboard with KPIs, trends, and alerts"
```

---

## Task 4: Single Competitor Detail API (`/api/competitors/[id]/detail`)

**Files:**
- Create: `app/api/competitors/[id]/detail/route.ts`

**Step 1: Create the detail API**

This route returns all data needed for the detail page's Tab 1 (charts) and Tab 3 (versions).

```ts
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

  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;
  const days = Math.min(90, Math.max(7, parseInt(searchParams.get('days') || '30', 10)));

  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    const competitor = await prisma.competitor.findUnique({
      where: { id },
      select: { id: true, name: true, company: true, appStoreId: true, googlePlayId: true },
    });
    if (!competitor) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Rating trend
    const snapshots = await prisma.competitorAppSnapshot.findMany({
      where: { competitorId: id, createdAt: { gte: since } },
      select: { rating: true, createdAt: true, version: true },
      orderBy: { createdAt: 'asc' },
    });

    const ratingTrend = snapshots
      .filter((s) => s.rating !== null)
      .map((s) => ({
        date: s.createdAt.toISOString().split('T')[0],
        rating: s.rating,
      }));

    // Current rating + 7-day trend
    const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const weekAgoSnapshot = await prisma.competitorAppSnapshot.findFirst({
      where: { competitorId: id, createdAt: { lte: sevenDaysAgo } },
      orderBy: { createdAt: 'desc' },
      select: { rating: true },
    });

    // Sentiment distribution
    const reviews = await prisma.competitorReview.findMany({
      where: { competitorId: id, createdAt: { gte: since } },
      select: { rating: true, sentiment: true, tags: true, createdAt: true },
    });

    let positive = 0, neutral = 0, negative = 0;
    for (const r of reviews) {
      if (r.sentiment !== null) {
        if (r.sentiment > 0.3) positive++;
        else if (r.sentiment < -0.3) negative++;
        else neutral++;
      }
    }

    // Review volume by date (grouped by rating category)
    const reviewVolume: Record<string, { date: string; good: number; mid: number; bad: number }> = {};
    for (const r of reviews) {
      const date = r.createdAt.toISOString().split('T')[0];
      if (!reviewVolume[date]) reviewVolume[date] = { date, good: 0, mid: 0, bad: 0 };
      if (r.rating >= 4) reviewVolume[date].good++;
      else if (r.rating === 3) reviewVolume[date].mid++;
      else reviewVolume[date].bad++;
    }

    // Tag aggregation (top 10)
    const tagCounts: Record<string, number> = {};
    for (const r of reviews) {
      const tags = (r.tags as string[]) || [];
      for (const tag of tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    // Version timeline (deduplicate by version)
    const versionMap = new Map<string, {
      version: string; date: string; releaseNotes: string | null; rating: number | null;
    }>();
    const allSnapshots = await prisma.competitorAppSnapshot.findMany({
      where: { competitorId: id, version: { not: null } },
      select: { version: true, releaseNotes: true, rating: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    for (const s of allSnapshots) {
      if (s.version && !versionMap.has(s.version)) {
        versionMap.set(s.version, {
          version: s.version,
          date: s.createdAt.toISOString().split('T')[0],
          releaseNotes: s.releaseNotes,
          rating: s.rating,
        });
      }
    }
    const versions = [...versionMap.values()].reverse(); // oldest first

    return NextResponse.json({
      success: true,
      competitor,
      currentRating: latestSnapshot?.rating ?? null,
      ratingTrend: latestSnapshot?.rating && weekAgoSnapshot?.rating
        ? Math.round((latestSnapshot.rating - weekAgoSnapshot.rating) * 100) / 100
        : null,
      charts: {
        ratingTrend,
        sentiment: { positive, neutral, negative, total: reviews.length },
        reviewVolume: Object.values(reviewVolume).sort((a, b) => a.date.localeCompare(b.date)),
        topTags,
      },
      versions,
    });
  } catch (error) {
    console.error('Failed to get competitor detail:', error);
    return NextResponse.json({ error: 'Failed to load detail' }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add 'app/api/competitors/[id]/detail/route.ts'
git commit -m "feat: add single competitor detail API with charts and versions"
```

---

## Task 5: Reviews API (`/api/competitors/[id]/reviews`)

**Files:**
- Create: `app/api/competitors/[id]/reviews/route.ts`

**Step 1: Create paginated reviews endpoint**

```ts
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

  const { id } = await params;
  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
  const pageSize = 20;
  const platform = sp.get('platform'); // 'appstore' | 'googleplay'
  const ratingFilter = sp.get('rating'); // '1-2' | '3' | '4-5'
  const sentimentFilter = sp.get('sentiment'); // 'positive' | 'neutral' | 'negative'
  const days = parseInt(sp.get('days') || '30', 10);
  const sortBy = sp.get('sort') || 'date'; // 'date' | 'rating'

  const since = new Date();
  since.setDate(since.getDate() - days);

  const where: any = { competitorId: id, createdAt: { gte: since } };
  if (platform) where.platform = platform;
  if (ratingFilter === '1-2') where.rating = { lte: 2 };
  else if (ratingFilter === '3') where.rating = 3;
  else if (ratingFilter === '4-5') where.rating = { gte: 4 };
  if (sentimentFilter === 'positive') where.sentiment = { gt: 0.3 };
  else if (sentimentFilter === 'negative') where.sentiment = { lt: -0.3 };
  else if (sentimentFilter === 'neutral') where.sentiment = { gte: -0.3, lte: 0.3 };

  const orderBy = sortBy === 'rating'
    ? { rating: 'desc' as const }
    : { reviewDate: 'desc' as const };

  const [reviews, total] = await Promise.all([
    prisma.competitorReview.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, platform: true, rating: true, title: true,
        content: true, sentiment: true, tags: true, reviewDate: true,
      },
    }),
    prisma.competitorReview.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    reviews,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}
```

**Step 2: Commit**

```bash
git add 'app/api/competitors/[id]/reviews/route.ts'
git commit -m "feat: add paginated competitor reviews API with filters"
```

---

## Task 6: Web Changes API (`/api/competitors/[id]/webchanges`)

**Files:**
- Create: `app/api/competitors/[id]/webchanges/route.ts`

**Step 1: Create web changes endpoint**

```ts
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

  const { id } = await params;

  const changes = await prisma.competitorWebChange.findMany({
    where: { competitorId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, url: true, changeType: true,
      summary: true, diffText: true, createdAt: true,
      previousHash: true, currentHash: true,
    },
  });

  return NextResponse.json({ success: true, changes });
}
```

**Step 2: Commit**

```bash
git add 'app/api/competitors/[id]/webchanges/route.ts'
git commit -m "feat: add competitor web changes API"
```

---

## Task 7: Compare API (`/api/competitors/compare`)

**Files:**
- Create: `app/api/competitors/compare/route.ts`

**Step 1: Create comparison API**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const ids = (sp.get('ids') || '').split(',').filter(Boolean);
  const days = Math.min(90, Math.max(7, parseInt(sp.get('days') || '30', 10)));

  if (ids.length < 2) {
    return NextResponse.json({ error: '至少选择 2 个竞品' }, { status: 400 });
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    const competitors = await prisma.competitor.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(competitors.map((c) => [c.id, c.name]));

    // Rating trends
    const snapshots = await prisma.competitorAppSnapshot.findMany({
      where: { competitorId: { in: ids }, createdAt: { gte: since }, rating: { not: null } },
      select: { competitorId: true, rating: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const ratingByDay = new Map<string, number>();
    const dateSet = new Set<string>();
    for (const s of snapshots) {
      const date = s.createdAt.toISOString().split('T')[0];
      dateSet.add(date);
      ratingByDay.set(`${date}|${s.competitorId}`, s.rating!);
    }

    const ratingTrend = [...dateSet].sort().map((date) => {
      const point: Record<string, any> = { date };
      for (const c of competitors) {
        point[c.name] = ratingByDay.get(`${date}|${c.id}`) ?? null;
      }
      return point;
    });

    // Sentiment distribution per competitor
    const reviews = await prisma.competitorReview.findMany({
      where: { competitorId: { in: ids }, createdAt: { gte: since } },
      select: { competitorId: true, rating: true, sentiment: true, tags: true },
    });

    const sentimentData = competitors.map((c) => {
      const compReviews = reviews.filter((r) => r.competitorId === c.id);
      let positive = 0, neutral = 0, negative = 0;
      for (const r of compReviews) {
        if (r.sentiment !== null) {
          if (r.sentiment > 0.3) positive++;
          else if (r.sentiment < -0.3) negative++;
          else neutral++;
        }
      }
      const total = positive + neutral + negative;
      return {
        name: c.name,
        positive: total > 0 ? Math.round((positive / total) * 100) : 0,
        neutral: total > 0 ? Math.round((neutral / total) * 100) : 0,
        negative: total > 0 ? Math.round((negative / total) * 100) : 0,
      };
    });

    // Review volume per competitor (by rating category)
    const volumeData = competitors.map((c) => {
      const compReviews = reviews.filter((r) => r.competitorId === c.id);
      return {
        name: c.name,
        good: compReviews.filter((r) => r.rating >= 4).length,
        mid: compReviews.filter((r) => r.rating === 3).length,
        bad: compReviews.filter((r) => r.rating <= 2).length,
      };
    });

    // Tag heatmap: aggregate tags across all selected competitors
    const allTags = new Map<string, Map<string, number>>();
    for (const r of reviews) {
      const compName = nameMap.get(r.competitorId) || '';
      const tags = (r.tags as string[]) || [];
      for (const tag of tags) {
        if (!allTags.has(tag)) allTags.set(tag, new Map());
        const tagMap = allTags.get(tag)!;
        tagMap.set(compName, (tagMap.get(compName) || 0) + 1);
      }
    }

    // Top 15 tags by total count
    const tagTotals = [...allTags.entries()]
      .map(([tag, counts]) => ({
        tag,
        total: [...counts.values()].reduce((a, b) => a + b, 0),
        counts,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    const heatmapData = tagTotals.map(({ tag, counts }) => {
      const row: Record<string, any> = { tag };
      for (const c of competitors) {
        row[c.name] = counts.get(c.name) || 0;
      }
      return row;
    });

    return NextResponse.json({
      success: true,
      competitors: competitors.map((c) => c.name),
      ratingTrend,
      sentimentData,
      volumeData,
      heatmapData,
    });
  } catch (error) {
    console.error('Failed to get comparison data:', error);
    return NextResponse.json({ error: 'Failed to load comparison' }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add 'app/api/competitors/compare/route.ts'
git commit -m "feat: add multi-competitor comparison API with heatmap"
```

---

## Task 8: News Feed API (`/api/competitors/news`)

**Files:**
- Create: `app/api/competitors/news/route.ts`

**Step 1: Create news feed API**

Merges `CompetitorNews` and `CompetitorWebChange` into a unified feed.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const competitorId = sp.get('competitorId');
  const type = sp.get('type'); // 'news' | 'webchange' | null (all)
  const days = parseInt(sp.get('days') || '30', 10);
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
  const pageSize = 20;

  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    const items: Array<{
      id: string;
      type: 'news' | 'webchange';
      competitorId: string | null;
      competitorName: string;
      title: string;
      summary: string | null;
      url: string | null;
      source: string;
      isHighImpact: boolean;
      createdAt: Date;
    }> = [];

    if (type !== 'webchange') {
      const newsWhere: any = { createdAt: { gte: since } };
      if (competitorId) newsWhere.competitorId = competitorId;

      const news = await prisma.competitorNews.findMany({
        where: newsWhere,
        orderBy: { createdAt: 'desc' },
        include: { competitor: { select: { name: true } } },
      });

      const highImpactTerms = ['融资', '收购', '合并', 'IPO', '上市', '裁员', '关闭', '倒闭'];

      for (const n of news) {
        const text = `${n.title} ${n.summary || ''}`.toLowerCase();
        items.push({
          id: n.id,
          type: 'news',
          competitorId: n.competitorId,
          competitorName: n.competitor?.name || '未知',
          title: n.title,
          summary: n.summary,
          url: n.url,
          source: n.source,
          isHighImpact: highImpactTerms.some((t) => text.includes(t)),
          createdAt: n.createdAt,
        });
      }
    }

    if (type !== 'news') {
      const changeWhere: any = { createdAt: { gte: since } };
      if (competitorId) changeWhere.competitorId = competitorId;

      const changes = await prisma.competitorWebChange.findMany({
        where: changeWhere,
        orderBy: { createdAt: 'desc' },
        include: { competitor: { select: { name: true } } },
      });

      for (const c of changes) {
        items.push({
          id: c.id,
          type: 'webchange',
          competitorId: c.competitorId,
          competitorName: c.competitor.name,
          title: c.summary || `${c.url} ${c.changeType}`,
          summary: c.diffText,
          url: c.url,
          source: c.changeType,
          isHighImpact: c.changeType === 'major_update',
          createdAt: c.createdAt,
        });
      }
    }

    // Sort by date descending
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Paginate
    const total = items.length;
    const paged = items.slice((page - 1) * pageSize, page * pageSize);

    // Stats: news count per competitor (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const newsStats = await prisma.competitorNews.groupBy({
      by: ['competitorId'],
      where: { createdAt: { gte: weekAgo }, competitorId: { not: null } },
      _count: true,
    });

    const competitors = await prisma.competitor.findMany({
      where: { enabled: true },
      select: { id: true, name: true },
    });
    const nameMap = new Map(competitors.map((c) => [c.id, c.name]));

    const newsCountByCompetitor = newsStats.map((s) => ({
      name: nameMap.get(s.competitorId!) || '未知',
      count: s._count,
    }));

    return NextResponse.json({
      success: true,
      items: paged,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      newsCountByCompetitor,
      competitors: competitors.map((c) => ({ id: c.id, name: c.name })),
    });
  } catch (error) {
    console.error('Failed to get news feed:', error);
    return NextResponse.json({ error: 'Failed to load news' }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add 'app/api/competitors/news/route.ts'
git commit -m "feat: add unified news feed API (news + web changes)"
```

---

## Task 9: Single Competitor Detail Page

**Files:**
- Create: `app/(dashboard)/insights/competitors/[id]/page.tsx`

**Step 1: Create the detail page**

This is a large `'use client'` component with 4 tabs. Key structure:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box, Typography, Button, Card, CardContent, Chip, Tabs, Tab,
  CircularProgress, ToggleButtonGroup, ToggleButton,
  Table, TableHead, TableBody, TableRow, TableCell,
  IconButton, Select, MenuItem, FormControl, InputLabel, Pagination,
} from '@mui/material';
import {
  ArrowBack, Edit as EditIcon, Star as StarIcon,
  TrendingUp, TrendingDown,
} from '@mui/icons-material';
import { designTokens as dt } from '@/lib/theme';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
```

**Tab 1: Rating & Sentiment** — 4 charts in a 2x2 Grid:
- Rating trend LineChart (top-left)
- Sentiment PieChart (top-right)
- Review volume stacked BarChart (bottom-left)
- Top tags horizontal BarChart (bottom-right)

**Tab 2: Reviews List** — Filter bar + paginated table:
- Filters: platform Select, rating ToggleButtonGroup, sentiment ToggleButtonGroup, days ToggleButtonGroup
- Table with columns: rating (star icons), title, content (truncated 100 chars), sentiment Chip, tags Chips, date
- MUI Pagination component at bottom

**Tab 3: Version Timeline** — Custom vertical timeline using Box:
```tsx
{versions.map((v, i) => (
  <Box key={v.version} sx={{ display: 'flex', gap: 2, pb: 3 }}>
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 40 }}>
      <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: dt.accent.main }} />
      {i < versions.length - 1 && <Box sx={{ width: 2, flex: 1, bgcolor: dt.border.default }} />}
    </Box>
    <Card sx={{ flex: 1 }}>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={600}>v{v.version}</Typography>
        <Typography variant="caption" color="text.secondary">{v.date}</Typography>
        {v.rating && <Chip label={`评分 ${v.rating.toFixed(1)}`} size="small" sx={{ ml: 1 }} />}
        {v.releaseNotes && (
          <Typography variant="body2" sx={{ mt: 1 }}>{v.releaseNotes.slice(0, 200)}</Typography>
        )}
      </CardContent>
    </Card>
  </Box>
))}
```

**Tab 4: Web Changes** — Similar timeline layout with changeType Chips.

**Step 2: Verify page loads**

Navigate to any competitor card from the dashboard → detail page should load.

**Step 3: Commit**

```bash
git add 'app/(dashboard)/insights/competitors/[id]/page.tsx'
git commit -m "feat: add single competitor detail page with 4 tabs"
```

---

## Task 10: Compare Page

**Files:**
- Create: `app/(dashboard)/insights/competitors/compare/page.tsx`

**Step 1: Create the compare page**

Key components:
- **Competitor selector**: MUI `Autocomplete` with `multiple`, fetching competitor list from `/api/competitors`
- **Time range**: `ToggleButtonGroup` (7/30/90 days)
- **4 chart sections**: rating trend LineChart, sentiment grouped BarChart, volume grouped BarChart, heatmap table

**Heatmap table implementation:**
```tsx
{heatmapData.map((row) => (
  <TableRow key={row.tag}>
    <TableCell sx={{ fontWeight: 600 }}>{row.tag}</TableCell>
    {competitorNames.map((name) => {
      const value = row[name] || 0;
      const intensity = maxValue > 0 ? value / maxValue : 0;
      return (
        <TableCell key={name} sx={{
          bgcolor: `rgba(239, 68, 68, ${intensity * 0.7})`,
          color: intensity > 0.5 ? '#fff' : 'inherit',
          textAlign: 'center', fontWeight: 600,
        }}>
          {value || '-'}
        </TableCell>
      );
    })}
  </TableRow>
))}
```

**URL params persistence**: Read `ids` and `range` from `useSearchParams()`, update URL on selection change via `router.replace()`. Wrap in `Suspense` to avoid build errors:
```tsx
import { Suspense } from 'react';
// Wrap the component that uses useSearchParams in Suspense
```

**Step 2: Verify page loads**

Navigate to `http://localhost:3030/insights/competitors/compare`, select 2+ competitors, verify charts render.

**Step 3: Commit**

```bash
git add 'app/(dashboard)/insights/competitors/compare/page.tsx'
git commit -m "feat: add multi-competitor comparison page with heatmap"
```

---

## Task 11: News Feed Page

**Files:**
- Create: `app/(dashboard)/insights/competitors/news/page.tsx`

**Step 1: Create the news page**

Layout: left side (8 cols) = feed, right side (4 cols) = stats.

**Feed cards:**
```tsx
{items.map((item) => (
  <Card key={item.id} sx={{
    mb: 1.5,
    borderLeft: item.isHighImpact ? `4px solid ${dt.danger.main}` : 'none',
  }}>
    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
      <Box sx={{ display: 'flex', gap: 1, mb: 0.5, alignItems: 'center' }}>
        <Chip label={item.type === 'news' ? 'Google Search' : item.source}
          size="small" color={item.type === 'news' ? 'primary' : 'warning'} variant="outlined" />
        <Chip label={item.competitorName} size="small" variant="outlined" />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          {formatRelativeTime(item.createdAt)}
        </Typography>
      </Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        {item.url && item.type === 'news' ? (
          <a href={item.url} target="_blank" rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'none' }}>
            {item.title}
          </a>
        ) : item.title}
      </Typography>
      {item.summary && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {item.summary.slice(0, 200)}
        </Typography>
      )}
    </CardContent>
  </Card>
))}
```

**Right side stats:**
- `BarChart` for news count by competitor
- Recent high-impact alerts list

**Pagination**: MUI `Pagination` at bottom of feed.

**Step 2: Verify page loads**

Navigate to `http://localhost:3030/insights/competitors/news`, verify feed renders with filters.

**Step 3: Commit**

```bash
git add 'app/(dashboard)/insights/competitors/news/page.tsx'
git commit -m "feat: add news and activity feed page"
```

---

## Task 12: Build Verification & Final Polish

**Step 1: Run build**

```bash
npx next build 2>&1 | tail -20
```

Fix any TypeScript errors. Known issue: `/roundtable/new` Suspense boundary error is pre-existing and unrelated.

**Step 2: Manual test**

Navigate through all 4 pages:
1. `/insights/competitors` — KPI cards, rating trend chart, competitor cards, alerts
2. Click a competitor card → `/insights/competitors/[id]` — 4 tabs with charts
3. Navigate to "对比" → `/insights/competitors/compare` — select competitors, verify charts
4. Navigate to "新闻" → `/insights/competitors/news` — feed with filters

**Step 3: Final commit**

```bash
git add -A
git commit -m "fix: address build errors and polish competitor visualization"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Dashboard API | `app/api/competitors/dashboard/route.ts` |
| 2 | Alerts API | `app/api/competitors/alerts/route.ts` |
| 3 | Dashboard Page (refactor) | `app/(dashboard)/insights/competitors/page.tsx` |
| 4 | Detail API | `app/api/competitors/[id]/detail/route.ts` |
| 5 | Reviews API | `app/api/competitors/[id]/reviews/route.ts` |
| 6 | Web Changes API | `app/api/competitors/[id]/webchanges/route.ts` |
| 7 | Compare API | `app/api/competitors/compare/route.ts` |
| 8 | News Feed API | `app/api/competitors/news/route.ts` |
| 9 | Detail Page | `app/(dashboard)/insights/competitors/[id]/page.tsx` |
| 10 | Compare Page | `app/(dashboard)/insights/competitors/compare/page.tsx` |
| 11 | News Feed Page | `app/(dashboard)/insights/competitors/news/page.tsx` |
| 12 | Build Verification | All files |
