import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { generateInitialCombos } from '@/lib/insights/keyword-engine';

/**
 * POST /api/insights/topics/suggested/[id]
 * Accept or dismiss a suggested topic.
 * Body: { action: 'accept' | 'dismiss' }
 */
export async function POST(
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
    const body = await request.json();
    const { action } = body;

    if (action !== 'accept' && action !== 'dismiss') {
      return NextResponse.json(
        { error: 'action must be "accept" or "dismiss"' },
        { status: 400 }
      );
    }

    const suggestion = await prisma.suggestedTopic.findUnique({ where: { id } });
    if (!suggestion) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }
    if (suggestion.status !== 'pending') {
      return NextResponse.json({ error: 'Suggestion already processed' }, { status: 400 });
    }

    if (action === 'dismiss') {
      await prisma.suggestedTopic.update({
        where: { id },
        data: { status: 'dismissed' },
      });
      return NextResponse.json({ success: true });
    }

    // Accept: create topic + generate combos
    const topic = await prisma.insightTopic.create({
      data: {
        name: suggestion.name,
        keywords: [],
        source: 'suggested',
        weight: 60,
      },
    });

    await prisma.suggestedTopic.update({
      where: { id },
      data: { status: 'accepted' },
    });

    // Generate initial combos (non-blocking failure)
    try {
      await generateInitialCombos(topic);
    } catch (err) {
      console.error(`[Topics] Failed to generate combos for suggested topic "${suggestion.name}":`, err);
    }

    return NextResponse.json({ success: true, topic });
  } catch (error) {
    console.error('[Topics] Suggested topic action failed:', error);
    return NextResponse.json(
      { error: 'Failed to process suggestion' },
      { status: 500 }
    );
  }
}
