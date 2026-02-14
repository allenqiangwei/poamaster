import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { generateInitialCombos } from '@/lib/insights/keyword-engine';

/**
 * GET /api/insights/topics
 * List insight topics with optional filtering.
 * Query params:
 *   ?search=keyword  — filter by name (case-insensitive contains)
 *   ?paused=true     — show only paused topics
 * Default: return all non-paused topics, ordered by weight desc.
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
    const search = searchParams.get('search') || '';
    const paused = searchParams.get('paused');

    const where: any = {};

    // Filter by paused status: ?paused=true shows only paused,
    // default (no param) excludes paused topics
    if (paused === 'true') {
      where.isPaused = true;
    } else {
      where.isPaused = false;
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const topics = await prisma.insightTopic.findMany({
      where,
      orderBy: { weight: 'desc' },
    });

    // Add combo stats for each topic
    const topicsWithStats = await Promise.all(
      topics.map(async (t) => {
        const [activeCount, retiredCount, newCount] = await Promise.all([
          prisma.keywordCombo.count({ where: { topicId: t.id, status: 'active' } }),
          prisma.keywordCombo.count({ where: { topicId: t.id, status: 'retired' } }),
          prisma.keywordCombo.count({ where: { topicId: t.id, status: 'new' } }),
        ]);
        return {
          ...t,
          comboStats: { active: activeCount, retired: retiredCount, new: newCount },
        };
      })
    );

    return NextResponse.json({ success: true, topics: topicsWithStats });
  } catch (error) {
    console.error('[Topics] Failed to fetch topics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch topics' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/insights/topics
 * Create a new insight topic.
 * Body: { name: string, keywords?: string[], source?: string }
 * Default weight: 80 for manual, 50 for auto.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const body = await request.json();
    const { name, keywords, source } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'name is required and must be a string' },
        { status: 400 }
      );
    }

    const resolvedSource = source || 'manual';
    const weight = resolvedSource === 'manual' ? 80 : 50;

    const topic = await prisma.insightTopic.create({
      data: {
        name,
        keywords: [], // No more manual keywords — AI generates combos
        source: resolvedSource,
        weight,
      },
    });

    // Auto-generate initial keyword combos for the new topic
    try {
      await generateInitialCombos(topic);
    } catch (err) {
      console.error(`[Topics] Failed to generate initial combos for "${name}":`, err);
      // Topic is still created, combos can be generated later
    }

    return NextResponse.json({ success: true, topic });
  } catch (error) {
    console.error('[Topics] Failed to create topic:', error);
    return NextResponse.json(
      { error: 'Failed to create topic' },
      { status: 500 }
    );
  }
}
