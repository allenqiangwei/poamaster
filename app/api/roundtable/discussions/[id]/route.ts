import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Next.js 15+ requires awaiting params
    const { id } = await params;

    // 验证 Session
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const discussion = await prisma.roundtableDiscussion.findUnique({
      where: { id },
      include: {
        template: {
          include: {
            roles: { orderBy: { order: 'asc' } },
          },
        },
        rounds: {
          include: {
            messages: { orderBy: { order: 'asc' } },
          },
          orderBy: { roundNumber: 'asc' },
        },
        actions: { orderBy: { priority: 'desc' } },
        risks: { orderBy: { priority: 'desc' } },
        attachments: true,
        assumptions: true,
      },
    });

    if (!discussion) {
      return NextResponse.json(
        { error: 'Discussion not found' },
        { status: 404 }
      );
    }

    if (discussion.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(discussion);
  } catch (error) {
    console.error('Failed to fetch discussion:', error);
    return NextResponse.json(
      { error: 'Failed to fetch discussion' },
      { status: 500 }
    );
  }
}
