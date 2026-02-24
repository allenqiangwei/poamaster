import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { generateVariationCombo, generateCombosForTopic } from '@/lib/insights/keyword-engine';

/**
 * PUT /api/insights/cards/[id]/feedback
 * Record card feedback (thumbs up or thumbs down).
 * Body: { feedback: 1 | -1 }
 * Also adjusts the related topic's weight accordingly.
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
    const body = await request.json();
    const { feedback } = body;

    if (feedback !== 1 && feedback !== -1) {
      return NextResponse.json(
        { error: 'feedback must be 1 or -1' },
        { status: 400 }
      );
    }

    // Update the card's feedback
    const card = await prisma.insightCard.update({
      where: { id },
      data: { feedback },
    });

    // Update the combo if the card is linked to one
    if (card.comboId) {
      const combo = await prisma.keywordCombo.findUnique({
        where: { id: card.comboId },
      });

      if (feedback === 1) {
        // 👍: Boost combo score (+10, cap at 100)
        await prisma.keywordCombo.update({
          where: { id: card.comboId },
          data: {
            score: { increment: 10 },
            feedback: 1,
          },
        });
        // Cap score at 100
        await prisma.keywordCombo.updateMany({
          where: { id: card.comboId, score: { gt: 100 } },
          data: { score: 100 },
        });

        // Generate a variation combo inspired by the liked one (async, non-blocking)
        if (combo && card.topicId) {
          generateVariationCombo(card.topicId, combo).catch((err) =>
            console.log('[Feedback] Variation combo generation failed:', err)
          );
        }
      } else {
        // 👎: Retire the combo immediately
        await prisma.keywordCombo.update({
          where: { id: card.comboId },
          data: {
            status: 'retired',
            feedback: -1,
          },
        });

        // Generate a replacement combo for this topic (async, non-blocking)
        if (card.topicId) {
          const topic = await prisma.insightTopic.findUnique({
            where: { id: card.topicId },
          });
          if (topic) {
            generateCombosForTopic(topic).catch((err) =>
              console.log('[Feedback] Replacement combo generation failed:', err)
            );
          }
        }
      }
    }

    // Adjust topic weight based on feedback
    if (card.topicId) {
      if (feedback === 1) {
        // 👍: topic weight +5 (cap at 100)
        await prisma.insightTopic.update({
          where: { id: card.topicId },
          data: { weight: { increment: 5 } },
        });
        await prisma.insightTopic.updateMany({
          where: { id: card.topicId, weight: { gt: 100 } },
          data: { weight: 100 },
        });
      } else {
        // 👎: Check if 3 consecutive combos have been retired for this topic
        const recentRetired = await prisma.keywordCombo.count({
          where: {
            topicId: card.topicId,
            status: 'retired',
            updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        });

        if (recentRetired >= 3) {
          // 3+ retired in the last week → decrease topic weight by 10
          const topic = await prisma.insightTopic.findUnique({
            where: { id: card.topicId },
          });
          if (topic) {
            await prisma.insightTopic.update({
              where: { id: card.topicId },
              data: { weight: Math.max(0, topic.weight - 10) },
            });
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }
    console.error('[Cards] Failed to record feedback:', error);
    return NextResponse.json(
      { error: 'Failed to record feedback' },
      { status: 500 }
    );
  }
}
