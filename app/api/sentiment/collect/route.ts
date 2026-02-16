import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// POST /api/sentiment/collect — Trigger immediate collection via SIGUSR1
export async function POST(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const pidFile = join(process.cwd(), 'services/sentiment-collector/.pid');
  if (!existsSync(pidFile)) {
    return NextResponse.json({ error: '采集服务未运行', running: false }, { status: 503 });
  }

  try {
    const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
    // Check if process is alive
    process.kill(pid, 0);
    // Send SIGUSR1 to trigger immediate collection
    process.kill(pid, 'SIGUSR1');
    return NextResponse.json({ success: true, message: '已触发立即采集' });
  } catch {
    return NextResponse.json({ error: '采集服务未响应', running: false }, { status: 503 });
  }
}
