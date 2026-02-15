import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

/**
 * POST /api/chat/read
 * Mark all messages in a conversation as read
 * Body: { threadId: string }
 */
export async function POST(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  try {
    const body = await req.json();
    const { threadId } = body;

    if (!threadId) {
      return NextResponse.json({ success: false, error: 'threadId is required' }, { status: 400 });
    }

    const conv = await prisma.botConversation.findUnique({
      where: { chatId: threadId },
    });

    if (!conv || conv.source !== 'web') {
      return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 });
    }

    // Mark all unread messages as read
    await prisma.botMessage.updateMany({
      where: { conversationId: conv.id, unread: true },
      data: { unread: false },
    });

    // Mark conversation as no longer having unread messages
    await prisma.botConversation.update({
      where: { id: conv.id },
      data: { hasUnread: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to mark conversation as read:', error);
    return NextResponse.json({ success: false, error: 'Failed to mark as read' }, { status: 500 });
  }
}
