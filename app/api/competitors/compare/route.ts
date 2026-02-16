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
