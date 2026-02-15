import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get('days') || '7');
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Chat health cards (latest pulse per chat)
  const pulses = await prisma.teamPulse.findMany({
    where: { date: { gte: since } },
    include: { chat: { select: { name: true, chatId: true } } },
    orderBy: { date: 'desc' },
  });

  // Group by chatId, latest first
  const chatMap = new Map<string, any[]>();
  for (const p of pulses) {
    const arr = chatMap.get(p.chatId) || [];
    arr.push(p);
    chatMap.set(p.chatId, arr);
  }

  const chatHealth = Array.from(chatMap.entries()).map(([chatId, records]) => {
    const latest = records[0];
    const totalMessages = records.reduce((sum: number, r: any) => sum + r.messageCount, 0);
    const withSentiment = records.filter((r: any) => r.sentimentScore !== null);
    const avgSentiment = withSentiment.length > 0
      ? withSentiment.reduce((sum: number, r: any) => sum + (r.sentimentScore || 0), 0) / withSentiment.length
      : null;
    return {
      chatId,
      chatName: latest.chat.name || chatId,
      totalMessages,
      avgSentiment: avgSentiment !== null ? Math.round(avgSentiment * 100) / 100 : null,
      latestDate: latest.date,
      trend: records.map((r: any) => ({
        date: r.date,
        messages: r.messageCount,
        sentiment: r.sentimentScore,
      })),
    };
  });

  // Unresolved signal counts
  const unresolvedSignals = await prisma.chatSignal.count({
    where: { isResolved: false, detectedAt: { gte: since } },
  });

  // Trend data (daily totals)
  const dailyPulses = await prisma.teamPulse.groupBy({
    by: ['date'],
    where: { date: { gte: since } },
    _sum: { messageCount: true, activeUserCount: true },
    _avg: { sentimentScore: true },
    orderBy: { date: 'asc' },
  });

  const trend = dailyPulses.map(d => ({
    date: d.date,
    messages: d._sum.messageCount || 0,
    activeUsers: d._sum.activeUserCount || 0,
    sentiment: d._avg.sentimentScore !== null ? Math.round(d._avg.sentimentScore! * 100) / 100 : null,
  }));

  return NextResponse.json({
    chatHealth: chatHealth.sort((a, b) => b.totalMessages - a.totalMessages),
    unresolvedSignals,
    trend,
  });
}
