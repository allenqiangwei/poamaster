import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const PID_FILE = join(process.cwd(), 'services/feishu-listener/.pid');
const LISTENER_DIR = join(process.cwd(), 'services/feishu-listener');

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

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

    // Check if cookie is configured
    const cookie = await getConfig('feishu.cookie');
    if (!cookie) {
      return NextResponse.json(
        { error: '请先在设置页面配置飞书 Cookie' },
        { status: 400 }
      );
    }

    // Kill existing process if running
    if (existsSync(PID_FILE)) {
      const oldPid = parseInt(readFileSync(PID_FILE, 'utf-8').trim());
      if (oldPid && isProcessRunning(oldPid)) {
        try {
          process.kill(oldPid, 'SIGTERM');
        } catch {
          // Process may have already exited
        }
      }
    }

    // Check listener service exists
    if (!existsSync(join(LISTENER_DIR, 'src/index.ts'))) {
      return NextResponse.json(
        { error: '监听服务文件不存在，请检查 services/feishu-listener/' },
        { status: 500 }
      );
    }

    // Spawn listener process
    const child = spawn('npx', ['tsx', 'src/index.ts'], {
      cwd: LISTENER_DIR,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL,
      },
    });

    child.unref();

    if (child.pid) {
      writeFileSync(PID_FILE, String(child.pid));
    }

    return NextResponse.json({
      success: true,
      message: 'Listener started',
      pid: child.pid,
    });
  } catch (error) {
    console.error('[Feishu] Failed to start listener:', error);
    return NextResponse.json(
      { error: 'Failed to start listener' },
      { status: 500 }
    );
  }
}
