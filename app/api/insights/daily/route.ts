import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { collectDailyData } from '@/lib/insights/collector';
import { generateBriefing } from '@/lib/insights/summarizer';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });
  }

  try {
    const data = await collectDailyData();
    const briefing = await generateBriefing(data);
    const suggestedTopics = await getPendingSuggestions();

    return NextResponse.json({
      success: true,
      briefing,
      data,
      suggestedTopics,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Daily insights error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate insights' },
      { status: 500 }
    );
  }
}

/** POST forces a cache refresh */
export async function POST(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });
  }

  try {
    const data = await collectDailyData();
    const briefing = await generateBriefing(data, true);
    const suggestedTopics = await getPendingSuggestions();

    return NextResponse.json({
      success: true,
      briefing,
      data,
      suggestedTopics,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Daily insights refresh error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate insights' },
      { status: 500 }
    );
  }
}

/** Get pending topic suggestions from any briefing */
async function getPendingSuggestions() {
  try {
    return await prisma.suggestedTopic.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  } catch {
    return [];
  }
}
