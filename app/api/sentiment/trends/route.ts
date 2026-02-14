import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

// GET /api/sentiment/trends?days=7&gameIds=a,b&platform=APP_STORE
export async function GET(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const searchParams = request.nextUrl.searchParams;
  const days = Math.min(90, Math.max(1, parseInt(searchParams.get('days') || '7', 10)));
  const gameIdsParam = searchParams.get('gameIds');
  const platformParam = searchParams.get('platform');

  try {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    // Get active games
    const games = await prisma.monitoredGame.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    const gameIds = gameIdsParam
      ? gameIdsParam.split(',').filter(id => games.some(g => g.id === id))
      : games.map(g => g.id);

    // Build where clause
    const where: any = {
      gameId: { in: gameIds },
      publishedAt: { gte: since },
    };
    if (platformParam) where.platform = platformParam;

    // Fetch all reviews in range
    const reviews = await prisma.sentimentReview.findMany({
      where,
      select: {
        gameId: true,
        platform: true,
        rating: true,
        sentimentLabel: true,
        publishedAt: true,
      },
      orderBy: { publishedAt: 'asc' },
    });

    // Aggregate by date + game
    const dailyMap = new Map<string, {
      date: string;
      gameId: string;
      positive: number;
      neutral: number;
      negative: number;
      unanalyzed: number;
      total: number;
      ratingSum: number;
      appStore: number;
      googlePlay: number;
    }>();

    for (const r of reviews) {
      const dateStr = r.publishedAt.toISOString().split('T')[0];
      const key = `${dateStr}|${r.gameId}`;

      if (!dailyMap.has(key)) {
        dailyMap.set(key, {
          date: dateStr,
          gameId: r.gameId,
          positive: 0, neutral: 0, negative: 0, unanalyzed: 0,
          total: 0, ratingSum: 0,
          appStore: 0, googlePlay: 0,
        });
      }

      const entry = dailyMap.get(key)!;
      entry.total++;
      entry.ratingSum += r.rating;
      if (r.sentimentLabel === 'POSITIVE') entry.positive++;
      else if (r.sentimentLabel === 'NEGATIVE') entry.negative++;
      else if (r.sentimentLabel === 'NEUTRAL') entry.neutral++;
      else entry.unanalyzed++;

      if (r.platform === 'APP_STORE') entry.appStore++;
      else if (r.platform === 'GOOGLE_PLAY') entry.googlePlay++;
    }

    // Build date range (fill missing dates with zeros)
    const trendData: Array<{
      date: string;
      gameId: string;
      gameName: string;
      positive: number;
      neutral: number;
      negative: number;
      total: number;
      avgRating: number | null;
      appStore: number;
      googlePlay: number;
    }> = [];

    for (let d = new Date(since); d <= new Date(); d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      for (const gid of gameIds) {
        const key = `${dateStr}|${gid}`;
        const entry = dailyMap.get(key);
        const gameName = games.find(g => g.id === gid)?.name || '';

        trendData.push({
          date: dateStr,
          gameId: gid,
          gameName,
          positive: entry?.positive ?? 0,
          neutral: entry?.neutral ?? 0,
          negative: entry?.negative ?? 0,
          total: entry?.total ?? 0,
          avgRating: entry && entry.total > 0
            ? Math.round((entry.ratingSum / entry.total) * 100) / 100
            : null,
          appStore: entry?.appStore ?? 0,
          googlePlay: entry?.googlePlay ?? 0,
        });
      }
    }

    // Platform summary per game (for bar chart)
    const platformSummary = gameIds.map(gid => {
      const gameName = games.find(g => g.id === gid)?.name || '';
      const gameReviews = reviews.filter(r => r.gameId === gid);
      return {
        gameId: gid,
        gameName,
        appStore: gameReviews.filter(r => r.platform === 'APP_STORE').length,
        googlePlay: gameReviews.filter(r => r.platform === 'GOOGLE_PLAY').length,
        total: gameReviews.length,
      };
    });

    return NextResponse.json({
      success: true,
      games: games.map(g => ({ id: g.id, name: g.name })),
      trendData,
      platformSummary,
      days,
    });
  } catch (error) {
    console.error('Failed to get sentiment trends:', error);
    return NextResponse.json({ error: 'Failed to get trends' }, { status: 500 });
  }
}
