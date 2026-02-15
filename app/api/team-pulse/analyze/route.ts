import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const { runDailyAnalysis } = await import('@/lib/team-pulse/chat-analyzer');
  const result = await runDailyAnalysis();

  return NextResponse.json({
    success: true,
    chatsAnalyzed: result.chatsAnalyzed,
    signalsCreated: result.signalsCreated,
  });
}
