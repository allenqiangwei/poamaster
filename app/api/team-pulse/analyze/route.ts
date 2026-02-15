import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await verifySession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { runDailyAnalysis } = await import('@/lib/team-pulse/chat-analyzer');
  const result = await runDailyAnalysis();

  return NextResponse.json({
    success: true,
    chatsAnalyzed: result.chatsAnalyzed,
    signalsCreated: result.signalsCreated,
  });
}
