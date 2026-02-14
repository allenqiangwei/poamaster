import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

// GET /api/sentiment/games/[id] — Get a single game with counts
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const { id } = await params;

  try {
    const game = await prisma.monitoredGame.findUnique({
      where: { id },
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

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, game });
  } catch (error) {
    console.error('Failed to get game:', error);
    return NextResponse.json({ error: 'Failed to get game' }, { status: 500 });
  }
}

// PUT /api/sentiment/games/[id] — Partial update a game
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const { id } = await params;

  try {
    const body = await request.json();
    const allowedFields = ['name', 'appStoreId', 'googlePlayId', 'xKeywords', 'fbKeywords', 'iconUrl', 'isActive'];
    const data: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (field in body) {
        if (field === 'name') {
          if (typeof body.name !== 'string' || body.name.trim().length === 0) {
            return NextResponse.json({ error: 'Game name cannot be empty' }, { status: 400 });
          }
          data.name = body.name.trim();
        } else {
          data[field] = body[field];
        }
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const game = await prisma.monitoredGame.update({
      where: { id },
      data,
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

    return NextResponse.json({ success: true, game });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }
    console.error('Failed to update game:', error);
    return NextResponse.json({ error: 'Failed to update game' }, { status: 500 });
  }
}

// DELETE /api/sentiment/games/[id] — Delete a game (cascade handles related data)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const { id } = await params;

  try {
    await prisma.monitoredGame.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }
    console.error('Failed to delete game:', error);
    return NextResponse.json({ error: 'Failed to delete game' }, { status: 500 });
  }
}
