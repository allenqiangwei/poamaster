import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

/**
 * PUT /api/insights/cards/[id]/view
 * Record that a card has been viewed.
 * Sets the card's viewedAt timestamp to now.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { id } = await params;

    await prisma.insightCard.update({
      where: { id },
      data: { viewedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }
    console.error('[Cards] Failed to record view:', error);
    return NextResponse.json(
      { error: 'Failed to record view' },
      { status: 500 }
    );
  }
}
