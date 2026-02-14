import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

// GET /api/sentiment/games/[id]/reviews — Paginated reviews for a game
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

  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
  const platform = searchParams.get('platform'); // APP_STORE | GOOGLE_PLAY
  const sentiment = searchParams.get('sentiment'); // POSITIVE | NEUTRAL | NEGATIVE

  try {
    // Verify game exists
    const game = await prisma.monitoredGame.findUnique({ where: { id } });
    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Build where clause
    const where: Record<string, unknown> = { gameId: id };
    if (platform) {
      where.platform = platform;
    }
    if (sentiment) {
      where.sentimentLabel = sentiment;
    }

    const [reviews, total] = await Promise.all([
      prisma.sentimentReview.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.sentimentReview.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      reviews,
      total,
      page,
      limit,
      totalPages,
    });
  } catch (error) {
    console.error('Failed to list reviews:', error);
    return NextResponse.json({ error: 'Failed to list reviews' }, { status: 500 });
  }
}
