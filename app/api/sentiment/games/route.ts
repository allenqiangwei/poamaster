import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

// GET /api/sentiment/games — List all monitored games with counts
export async function GET(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  try {
    const games = await prisma.monitoredGame.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            reviews: true,
            mentions: true,
            alerts: { where: { isRead: false } },
          },
        },
      },
    });

    return NextResponse.json({ success: true, games });
  } catch (error) {
    console.error('Failed to list games:', error);
    return NextResponse.json({ error: 'Failed to list games' }, { status: 500 });
  }
}

// POST /api/sentiment/games — Create a new monitored game
export async function POST(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  try {
    const body = await request.json();
    const { name, appStoreId, googlePlayId, xKeywords, fbKeywords, iconUrl } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Game name is required' }, { status: 400 });
    }

    const game = await prisma.monitoredGame.create({
      data: {
        name: name.trim(),
        appStoreId: appStoreId || null,
        googlePlayId: googlePlayId || null,
        xKeywords: Array.isArray(xKeywords) ? xKeywords : [],
        fbKeywords: Array.isArray(fbKeywords) ? fbKeywords : [],
        iconUrl: iconUrl || null,
      },
      include: {
        _count: {
          select: {
            reviews: true,
            mentions: true,
            alerts: { where: { isRead: false } },
          },
        },
      },
    });

    return NextResponse.json({ success: true, game }, { status: 201 });
  } catch (error) {
    console.error('Failed to create game:', error);
    return NextResponse.json({ error: 'Failed to create game' }, { status: 500 });
  }
}
