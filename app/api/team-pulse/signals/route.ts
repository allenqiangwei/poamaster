import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifySession } from '@/lib/auth';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const session = await verifySession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const resolved = url.searchParams.get('resolved');
  const days = parseInt(url.searchParams.get('days') || '7');

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where: any = { detectedAt: { gte: since } };
  if (type) where.signalType = type;
  if (resolved === 'true') where.isResolved = true;
  if (resolved === 'false') where.isResolved = false;

  const signals = await prisma.chatSignal.findMany({
    where,
    orderBy: { detectedAt: 'desc' },
    include: { chat: { select: { name: true, chatType: true } } },
    take: 100,
  });

  const counts = await prisma.chatSignal.groupBy({
    by: ['signalType'],
    where: { detectedAt: { gte: since }, isResolved: false },
    _count: true,
  });

  return NextResponse.json({
    signals,
    unresolvedCounts: Object.fromEntries(counts.map(c => [c.signalType, c._count])),
  });
}
