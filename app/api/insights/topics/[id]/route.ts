import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

/**
 * PUT /api/insights/topics/[id]
 * Update an existing insight topic.
 * Body: any of { name?, keywords?, weight?, isPaused? }
 * Updates only the provided fields.
 */
export async function PUT(
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
    const { name, keywords, weight, isPaused } = body;

    // Build update data with only provided fields
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (keywords !== undefined) data.keywords = keywords;
    if (weight !== undefined) data.weight = weight;
    if (isPaused !== undefined) data.isPaused = isPaused;

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const topic = await prisma.insightTopic.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, topic });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    }
    console.error('[Topics] Failed to update topic:', error);
    return NextResponse.json(
      { error: 'Failed to update topic' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/insights/topics/[id]
 * Delete an insight topic.
 */
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

    await prisma.insightTopic.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    }
    console.error('[Topics] Failed to delete topic:', error);
    return NextResponse.json(
      { error: 'Failed to delete topic' },
      { status: 500 }
    );
  }
}
