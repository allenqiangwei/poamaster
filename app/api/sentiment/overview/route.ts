import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

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

    // Global stats + last collection time per platform
    const [gameCount, todayReviews, todayMentions, pendingAlerts, lastAppStore, lastGooglePlay, lastX] = await Promise.all([
      prisma.monitoredGame.count({ where: { isActive: true } }),
      prisma.sentimentReview.count({ where: { collectedAt: { gte: todayStart } } }),
      prisma.sentimentMention.count({ where: { collectedAt: { gte: todayStart } } }),
      prisma.sentimentAlert.count({ where: { isRead: false } }),
      prisma.sentimentReview.findFirst({
        where: { platform: 'APP_STORE' },
        orderBy: { collectedAt: 'desc' },
        select: { collectedAt: true },
      }),
      prisma.sentimentReview.findFirst({
        where: { platform: 'GOOGLE_PLAY' },
        orderBy: { collectedAt: 'desc' },
        select: { collectedAt: true },
      }),
      prisma.sentimentMention.findFirst({
        where: { platform: 'X' },
        orderBy: { collectedAt: 'desc' },
        select: { collectedAt: true },
      }),
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

    // Next scheduled collections
    const now = new Date();
    // Reviews: cron 0 6 * * * (daily 6:00 AM)
    const nextReview = new Date(now);
    nextReview.setHours(6, 0, 0, 0);
    if (nextReview <= now) nextReview.setDate(nextReview.getDate() + 1);
    // Tweets: cron 0 */4 * * * (every 4 hours)
    const nextTweet = new Date(now);
    nextTweet.setMinutes(0, 0, 0);
    nextTweet.setHours(Math.ceil((now.getHours() + 1) / 4) * 4);
    if (nextTweet <= now) nextTweet.setHours(nextTweet.getHours() + 4);

    // Check if sentiment-collector service is running
    let serviceRunning = false;
    const pidFile = join(process.cwd(), 'services/sentiment-collector/.pid');
    if (existsSync(pidFile)) {
      try {
        const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
        process.kill(pid, 0);
        serviceRunning = true;
      } catch {}
    }

    return NextResponse.json({
      success: true,
      serviceRunning,
      stats: {
        gameCount,
        todayReviews,
        todayMentions,
        pendingAlerts,
      },
      lastCollected: {
        APP_STORE: lastAppStore?.collectedAt ?? null,
        GOOGLE_PLAY: lastGooglePlay?.collectedAt ?? null,
        X: lastX?.collectedAt ?? null,
      },
      nextCollection: {
        reviews: nextReview.toISOString(),
        tweets: nextTweet.toISOString(),
      },
      gameStats,
    });
  } catch (error) {
    console.error('Failed to get sentiment overview:', error);
    return NextResponse.json({ error: 'Failed to get overview' }, { status: 500 });
  }
}
