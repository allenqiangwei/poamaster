import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

/**
 * GET /api/insights/briefing
 * Get the latest briefing or a briefing by date.
 * Query params:
 *   ?date=2026-02-15 (optional, defaults to today)
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');

    // Parse date param or default to today (midnight UTC)
    let targetDate: Date;
    if (dateParam) {
      targetDate = new Date(dateParam);
      if (isNaN(targetDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format. Use YYYY-MM-DD.' },
          { status: 400 }
        );
      }
      // Normalize to midnight UTC
      targetDate = new Date(targetDate.toISOString().split('T')[0]);
    } else {
      targetDate = new Date(new Date().toISOString().split('T')[0]);
    }

    // Find briefing by date, include cards and suggested topics
    const briefing = await prisma.insightBriefing.findUnique({
      where: { date: targetDate },
      include: {
        cards: {},
        suggestedTopics: {
          where: { status: 'pending' },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!briefing) {
      return NextResponse.json({ success: true, briefing: null });
    }

    // Sort cards by priority: high first, then medium, then low
    const priorityOrder: Record<string, number> = {
      high: 0,
      medium: 1,
      low: 2,
    };

    briefing.cards.sort((a, b) => {
      const aOrder = priorityOrder[a.priority] ?? 1;
      const bOrder = priorityOrder[b.priority] ?? 1;
      return aOrder - bOrder;
    });

    return NextResponse.json({ success: true, briefing });
  } catch (error) {
    console.error('[Briefing] Failed to fetch briefing:', error);
    return NextResponse.json(
      { error: 'Failed to fetch briefing' },
      { status: 500 }
    );
  }
}
