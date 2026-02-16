import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

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
    const type = searchParams.get('type');

    const where: any = {};
    if (type) where.signalType = type;

    const rules = await prisma.alertRule.findMany({
      where,
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    });

    return NextResponse.json({ success: true, rules });
  } catch (error) {
    console.error('[AlertRules] GET failed:', error);
    return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 });
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

    const { keyword, signalType, severity } = await request.json();
    if (!keyword?.trim() || !signalType || !severity) {
      return NextResponse.json(
        { error: 'keyword, signalType, severity are required' },
        { status: 400 }
      );
    }

    const validTypes = ['RISK', 'BLOCKER', 'ESCALATION'];
    const validSeverities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    if (!validTypes.includes(signalType) || !validSeverities.includes(severity)) {
      return NextResponse.json(
        { error: 'Invalid signalType or severity' },
        { status: 400 }
      );
    }

    const rule = await prisma.alertRule.create({
      data: { keyword: keyword.trim(), signalType, severity, isSystem: false },
    });

    return NextResponse.json({ success: true, rule });
  } catch (error) {
    console.error('[AlertRules] POST failed:', error);
    return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 });
  }
}
