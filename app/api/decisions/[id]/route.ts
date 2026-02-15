import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

// GET /api/decisions/[id] — Get a single decision with its linked tasks
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  try {
    const { id } = await params;

    const decision = await prisma.decision.findUnique({
      where: { id },
      include: {
        tasks: {
          include: { assignee: { select: { id: true, name: true } } },
        },
      },
    });

    if (!decision) {
      return NextResponse.json({ success: false, error: 'Decision not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: decision });
  } catch (error) {
    console.error('Failed to get decision:', error);
    return NextResponse.json({ success: false, error: 'Failed to get decision' }, { status: 500 });
  }
}

// PATCH /api/decisions/[id] — Update a decision
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json();
    const { title, context, outcome, status, madeBy, reviewDate, notes } = body;

    const data: any = {};
    if (title !== undefined) data.title = title.trim();
    if (context !== undefined) data.context = context?.trim() || null;
    if (outcome !== undefined) data.outcome = outcome?.trim() || null;
    if (status !== undefined) data.status = status;
    if (madeBy !== undefined) data.madeBy = madeBy?.trim() || null;
    if (reviewDate !== undefined) data.reviewDate = reviewDate ? new Date(reviewDate) : null;
    if (notes !== undefined) data.notes = notes?.trim() || null;

    const decision = await prisma.decision.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, data: decision });
  } catch (error) {
    console.error('Failed to update decision:', error);
    return NextResponse.json({ success: false, error: 'Failed to update decision' }, { status: 500 });
  }
}

// DELETE /api/decisions/[id] — Delete a decision
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  try {
    const { id } = await params;
    await prisma.decision.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete decision:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete decision' }, { status: 500 });
  }
}
