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
