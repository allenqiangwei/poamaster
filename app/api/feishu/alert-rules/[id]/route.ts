import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const data: any = {};

    if (body.keyword !== undefined) data.keyword = body.keyword.trim();
    if (body.signalType !== undefined) data.signalType = body.signalType;
    if (body.severity !== undefined) data.severity = body.severity;
    if (body.isEnabled !== undefined) data.isEnabled = body.isEnabled;

    const rule = await prisma.alertRule.update({ where: { id }, data });
    return NextResponse.json({ success: true, rule });
  } catch (error) {
    console.error('[AlertRules] PATCH failed:', error);
    return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { id } = await params;

    // Check if system rule — cannot delete system rules
    const existing = await prisma.alertRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }
    if (existing.isSystem) {
      return NextResponse.json({ error: 'Cannot delete system rules' }, { status: 403 });
    }

    await prisma.alertRule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[AlertRules] DELETE failed:', error);
    return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 });
  }
}
