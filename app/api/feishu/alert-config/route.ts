import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

const DEFAULTS: Record<string, string> = {
  'alert.minNotifySeverity': 'HIGH',
  'alert.silentStart': '22:00',
  'alert.silentEnd': '08:00',
  'alert.cooldownMinutes': '30',
  'alert.batchIntervalMinutes': '5',
};

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

    const rows = await prisma.config.findMany({
      where: { key: { startsWith: 'alert.' } },
    });

    const mergedConfig: Record<string, string> = { ...DEFAULTS };
    for (const row of rows) {
      mergedConfig[row.key] = row.value;
    }

    // Fallback: use feishu.chatId for alert.notifyTargetChat if not set
    if (!mergedConfig['alert.notifyTargetChat']) {
      const chatIdConfig = await prisma.config.findUnique({
        where: { key: 'feishu.chatId' },
      });
      if (chatIdConfig) {
        mergedConfig['alert.notifyTargetChat'] = chatIdConfig.value;
      }
    }

    return NextResponse.json({ success: true, config: mergedConfig });
  } catch (error) {
    console.error('[AlertConfig] Failed to fetch alert config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alert config' },
      { status: 500 }
    );
  }
}

const FIELD_TO_KEY: Record<string, string> = {
  minNotifySeverity: 'alert.minNotifySeverity',
  silentStart: 'alert.silentStart',
  silentEnd: 'alert.silentEnd',
  cooldownMinutes: 'alert.cooldownMinutes',
  batchIntervalMinutes: 'alert.batchIntervalMinutes',
};

export async function PUT(request: NextRequest) {
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

    const upserts = [];
    for (const [field, key] of Object.entries(FIELD_TO_KEY)) {
      if (body[field] !== undefined) {
        const value = String(body[field]);
        upserts.push(
          prisma.config.upsert({
            where: { key },
            create: { key, value },
            update: { value },
          })
        );
      }
    }

    if (upserts.length > 0) {
      await Promise.all(upserts);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[AlertConfig] Failed to update alert config:', error);
    return NextResponse.json(
      { error: 'Failed to update alert config' },
      { status: 500 }
    );
  }
}
