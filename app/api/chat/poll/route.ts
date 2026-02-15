import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

/**
 * GET /api/chat/poll
 * Poll for message updates since a given timestamp.
 *
 * Query params:
 *   threadId — (optional) filter to a specific conversation by chatId
 *   since    — (optional) ISO date string; defaults to 60 seconds ago
 *
 * Returns updated BotMessage records and an unread conversation count.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }

  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Invalid session' },
      { status: 401 },
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get('threadId') || undefined;
    const sinceParam = searchParams.get('since');

    // Default to 60 seconds ago if no `since` provided
    const sinceDate = sinceParam
      ? new Date(sinceParam)
      : new Date(Date.now() - 60_000);

    // Validate the parsed date
    if (isNaN(sinceDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid "since" date format' },
        { status: 400 },
      );
    }

    // Build the where clause for BotMessage
    const messageWhere: Record<string, unknown> = {
      updatedAt: { gt: sinceDate },
      conversation: {
        source: 'web',
        ...(threadId ? { chatId: threadId } : {}),
      },
    };

    // Fetch updated messages and unread count in parallel
    const [updates, unreadCount] = await Promise.all([
      prisma.botMessage.findMany({
        where: messageWhere,
        orderBy: { updatedAt: 'asc' },
        select: {
          id: true,
          role: true,
          content: true,
          status: true,
          progress: true,
          errorMessage: true,
          unread: true,
          updatedAt: true,
        },
      }),
      prisma.botConversation.count({
        where: { source: 'web', hasUnread: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        updates: updates.map((m) => ({
          messageId: m.id,
          role: m.role,
          content: m.content,
          status: m.status,
          progress: m.progress,
          errorMessage: m.errorMessage,
          unread: m.unread,
          updatedAt: m.updatedAt,
        })),
        unreadCount,
      },
    });
  } catch (error) {
    console.error('Poll API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to poll for updates' },
      { status: 500 },
    );
  }
}
