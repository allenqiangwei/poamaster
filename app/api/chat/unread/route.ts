import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

/**
 * GET /api/chat/unread
 * Count web conversations that have unread messages
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  try {
    const count = await prisma.botConversation.count({
      where: { source: 'web', hasUnread: true },
    });

    return NextResponse.json({ success: true, data: { count } });
  } catch (error) {
    console.error('Failed to count unread conversations:', error);
    return NextResponse.json({ success: false, error: 'Failed to count unread' }, { status: 500 });
  }
}
