import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { UNDO_WINDOW_MS } from '@/lib/pulse/constants';

interface Params {
  params: Promise<{ id: string }>;
}

// POST /api/pulse/entries/[id]/undo
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { undoToken } = body;

    if (!undoToken) {
      return NextResponse.json(
        { success: false, error: 'Undo token is required' },
        { status: 400 }
      );
    }

    const entry = await prisma.pulseEntry.findUnique({
      where: { id }
    });

    if (!entry) {
      return NextResponse.json(
        { success: false, error: 'Entry not found' },
        { status: 404 }
      );
    }

    if (entry.deleteToken !== undoToken) {
      return NextResponse.json(
        { success: false, error: 'Invalid undo token' },
        { status: 400 }
      );
    }

    if (!entry.deletedAt) {
      return NextResponse.json(
        { success: false, error: 'Entry is not deleted' },
        { status: 400 }
      );
    }

    const elapsed = Date.now() - entry.deletedAt.getTime();
    if (elapsed > UNDO_WINDOW_MS) {
      return NextResponse.json(
        { success: false, error: 'Undo window expired' },
        { status: 400 }
      );
    }

    await prisma.pulseEntry.update({
      where: { id },
      data: {
        deletedAt: null,
        deleteToken: null
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to undo delete:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to undo delete' },
      { status: 500 }
    );
  }
}
