import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

// GET /api/decisions — List all decisions, optionally filtered by status
export async function GET(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');

    const where: any = {};
    if (status) where.status = status;

    const decisions = await prisma.decision.findMany({
      where,
      include: {
        tasks: {
          select: { id: true, title: true, status: true },
        },
      },
      orderBy: { madeAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: decisions });
  } catch (error) {
    console.error('Failed to list decisions:', error);
    return NextResponse.json({ success: false, error: 'Failed to list decisions' }, { status: 500 });
  }
}

// POST /api/decisions — Create a new decision
export async function POST(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  try {
    const body = await req.json();
    const { title, context, outcome, madeAt, madeBy, reviewDate, notes, signalId } = body;

    if (!title?.trim()) {
      return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
    }

    const decision = await prisma.decision.create({
      data: {
        title: title.trim(),
        context: context?.trim() || null,
        outcome: outcome?.trim() || null,
        madeAt: madeAt ? new Date(madeAt) : new Date(),
        madeBy: madeBy?.trim() || null,
        reviewDate: reviewDate ? new Date(reviewDate) : null,
        notes: notes?.trim() || null,
        signalId: signalId || null,
      },
    });

    return NextResponse.json({ success: true, data: decision }, { status: 201 });
  } catch (error) {
    console.error('Failed to create decision:', error);
    return NextResponse.json({ success: false, error: 'Failed to create decision' }, { status: 500 });
  }
}
