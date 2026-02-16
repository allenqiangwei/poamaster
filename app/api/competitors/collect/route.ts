import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// POST /api/competitors/collect — Trigger immediate competitor data collection
export async function POST(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const pidFile = join(process.cwd(), 'services/competitor-monitor/.pid');
  if (!existsSync(pidFile)) {
    return NextResponse.json({ error: '竞品监控服务未运行', running: false }, { status: 503 });
  }

  try {
    const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
    process.kill(pid, 0); // Check alive
    process.kill(pid, 'SIGUSR1');
    return NextResponse.json({ success: true, message: '已触发立即采集' });
  } catch {
    return NextResponse.json({ error: '竞品监控服务未响应', running: false }, { status: 503 });
  }
}

// GET /api/competitors/collect — Return last collection times and next schedule
export async function GET(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  try {
    const [lastReview, lastWebChange, lastNews] = await Promise.all([
      prisma.competitorReview.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      prisma.competitorWebChange.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      prisma.competitorNews.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);

    // Next scheduled: reviews 0 8,20; web 0 */6; news 0 */4
    const now = new Date();

    const nextReview = new Date(now);
    const nextReviewHours = [8, 20];
    const nextH = nextReviewHours.find(h => h > now.getHours()) ?? nextReviewHours[0];
    nextReview.setHours(nextH, 0, 0, 0);
    if (nextReview <= now) nextReview.setDate(nextReview.getDate() + 1);

    const nextWeb = new Date(now);
    nextWeb.setMinutes(0, 0, 0);
    nextWeb.setHours(Math.ceil((now.getHours() + 1) / 6) * 6);
    if (nextWeb <= now) nextWeb.setHours(nextWeb.getHours() + 6);

    const nextNews = new Date(now);
    nextNews.setMinutes(0, 0, 0);
    nextNews.setHours(Math.ceil((now.getHours() + 1) / 4) * 4);
    if (nextNews <= now) nextNews.setHours(nextNews.getHours() + 4);

    // Check if service is running
    const pidFile = join(process.cwd(), 'services/competitor-monitor/.pid');
    let serviceRunning = false;
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
      lastCollected: {
        reviews: lastReview?.createdAt ?? null,
        webChanges: lastWebChange?.createdAt ?? null,
        news: lastNews?.createdAt ?? null,
      },
      nextCollection: {
        reviews: nextReview.toISOString(),
        webChanges: nextWeb.toISOString(),
        news: nextNews.toISOString(),
      },
    });
  } catch (error) {
    console.error('[Competitors] Collect status failed:', error);
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
  }
}
