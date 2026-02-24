import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = await verifySession(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');

    let targetDate: Date;
    if (dateParam) {
      targetDate = new Date(dateParam);
      if (isNaN(targetDate.getTime())) {
        return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD.' }, { status: 400 });
      }
      targetDate = new Date(targetDate.toISOString().split('T')[0]);
    } else {
      targetDate = new Date(new Date().toISOString().split('T')[0]);
    }

    const episode = await prisma.cooMemoryEpisode.findUnique({
      where: { date: targetDate },
    });

    const core = await prisma.cooMemoryCore.findFirst({
      orderBy: { version: 'desc' },
      select: { content: true, version: true, updatedAt: true },
    });

    // Find available dates for navigation
    const availableDates = await prisma.cooMemoryEpisode.findMany({
      select: { date: true },
      orderBy: { date: 'desc' },
      take: 30,
    });

    return NextResponse.json({
      episode: episode ? {
        date: episode.date,
        narrative: episode.narrative,
        changes: episode.changes,
        actions: episode.actions,
        snapshot: JSON.parse(episode.snapshot),
      } : null,
      core: core ? { content: core.content, version: core.version, updatedAt: core.updatedAt } : null,
      availableDates: availableDates.map(d => d.date.toISOString().split('T')[0]),
    });
  } catch (error) {
    console.error('[COO API] Failed to fetch briefing:', error);
    return NextResponse.json({ error: 'Failed to fetch briefing' }, { status: 500 });
  }
}
