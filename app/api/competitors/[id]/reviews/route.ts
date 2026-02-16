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
