import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const PID_FILE = join(process.cwd(), 'services/feishu-listener/.pid');
const STATUS_FILE = join(process.cwd(), 'services/feishu-listener/.status');

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

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

    let status = 'stopped';
    let connectedAt: string | null = null;
    let messageCount: number | null = null;

    // Check PID file
    if (existsSync(PID_FILE)) {
      const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim());
      if (pid && isProcessRunning(pid)) {
        status = 'running';
      }
    }

    // Read status file for additional info
    if (existsSync(STATUS_FILE)) {
      try {
        const statusData = JSON.parse(readFileSync(STATUS_FILE, 'utf-8'));
        connectedAt = statusData.connectedAt || null;
        messageCount = statusData.messageCount || null;
      } catch {
        // Ignore parse errors
      }
    }

    return NextResponse.json({
      success: true,
      status,
      connectedAt,
      messageCount,
    });
  } catch (error) {
    console.error('[Feishu] Failed to check listener status:', error);
    return NextResponse.json(
      { error: 'Failed to check status' },
      { status: 500 }
    );
  }
}
