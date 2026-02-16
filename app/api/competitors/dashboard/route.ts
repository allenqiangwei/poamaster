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
