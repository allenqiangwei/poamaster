import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

// GET /api/sentiment/overview — Dashboard overview stats
export async function GET(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Global stats
    const [gameCount, todayReviews, todayMentions, pendingAlerts] = await Promise.all([
      prisma.monitoredGame.count({ where: { isActive: true } }),
      prisma.sentimentReview.count({ where: { collectedAt: { gte: todayStart } } }),
      prisma.sentimentMention.count({ where: { collectedAt: { gte: todayStart } } }),
      prisma.sentimentAlert.count({ where: { isRead: false } }),
    ]);

    // Per-game stats from last 7 days
    const games = await prisma.monitoredGame.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        iconUrl: true,
        _count: {
          select: {
            alerts: { where: { isRead: false } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const gameStats = await Promise.all(
      games.map(async (game) => {
        const reviews = await prisma.sentimentReview.findMany({
          where: {
            gameId: game.id,
            publishedAt: { gte: sevenDaysAgo },
          },
          select: {
            rating: true,
            sentimentLabel: true,
            keyIssues: true,
          },
        });

        const reviewCount = reviews.length;
        const avgRating =
          reviewCount > 0
            ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount) * 100) / 100
            : null;

        const positiveCount = reviews.filter((r) => r.sentimentLabel === 'POSITIVE').length;
        const positiveRatio =
          reviewCount > 0 ? Math.round((positiveCount / reviewCount) * 10000) / 100 : null;

        // Aggregate keyIssues and get top 3
        const issueCounts: Record<string, number> = {};
        for (const review of reviews) {
          for (const issue of review.keyIssues) {
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
          avgRating,
          positiveRatio,
          reviewCount,
          topIssues,
          unreadAlerts: game._count.alerts,
        };
      })
    );

    return NextResponse.json({
      success: true,
      stats: {
        gameCount,
        todayReviews,
        todayMentions,
        pendingAlerts,
      },
      gameStats,
    });
  } catch (error) {
    console.error('Failed to get sentiment overview:', error);
    return NextResponse.json({ error: 'Failed to get overview' }, { status: 500 });
  }
}
