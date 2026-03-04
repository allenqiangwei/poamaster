import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

const MUTE_DAYS = 7;

/**
 * PUT /api/insights/cards/[id]/mute
 * Mute the topic associated with this card for 1 week.
 * The topic will be skipped during briefing generation until mutedUntil expires.
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

    const card = await prisma.insightCard.findUnique({
      where: { id },
      select: { topicId: true, topic: { select: { name: true } } },
    });

    if (!card) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }

    if (!card.topicId) {
      return NextResponse.json({ error: '该卡片未关联话题，无法静默' }, { status: 400 });
    }

    const mutedUntil = new Date(Date.now() + MUTE_DAYS * 24 * 60 * 60 * 1000);

    await prisma.insightTopic.update({
      where: { id: card.topicId },
      data: { mutedUntil },
    });

    console.log(`[Briefing] Topic "${card.topic?.name}" muted until ${mutedUntil.toISOString()}`);

    return NextResponse.json({
      success: true,
      topicName: card.topic?.name,
      mutedUntil: mutedUntil.toISOString(),
    });
  } catch (error: any) {
    console.error('[Cards] Failed to mute topic:', error);
    return NextResponse.json(
      { error: 'Failed to mute topic' },
      { status: 500 }
    );
  }
}
