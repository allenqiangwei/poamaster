import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = await verifySession(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const [core, latestEpisode, episodeCount] = await Promise.all([
      prisma.cooMemoryCore.findFirst({ orderBy: { version: 'desc' } }),
      prisma.cooMemoryEpisode.findFirst({ orderBy: { date: 'desc' } }),
      prisma.cooMemoryEpisode.count(),
    ]);

    return NextResponse.json({
      core: core ? { version: core.version, updatedAt: core.updatedAt, contentLength: core.content.length } : null,
      latestEpisode: latestEpisode ? { date: latestEpisode.date, createdAt: latestEpisode.createdAt } : null,
      totalEpisodes: episodeCount,
    });
  } catch (error) {
    console.error('[COO API] Failed to fetch memory state:', error);
    return NextResponse.json({ error: 'Failed to fetch memory state' }, { status: 500 });
  }
}
