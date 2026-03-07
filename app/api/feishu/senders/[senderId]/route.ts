import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

/**
 * GET /api/feishu/senders/[senderId]
 * Sender details with message statistics.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ senderId: string }> }
) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = await verifySession(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { senderId } = await params;

    const [
      totalMessages,
      timeRange,
      chatActivity,
      typeBreakdown,
      recentMessages,
      assignee,
    ] = await Promise.all([
      prisma.feishuMessage.count({ where: { senderId } }),
      prisma.feishuMessage.aggregate({
        where: { senderId },
        _min: { timestamp: true },
        _max: { timestamp: true },
      }),
      prisma.feishuMessage.groupBy({
        by: ['chatId'],
        where: { senderId },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 20,
      }),
      prisma.feishuMessage.groupBy({
        by: ['msgType'],
        where: { senderId },
        _count: { id: true },
      }),
      prisma.feishuMessage.findMany({
        where: { senderId },
        orderBy: { timestamp: 'desc' },
        take: 10,
        select: {
          id: true,
          messageId: true,
          chatId: true,
          senderName: true,
          content: true,
          msgType: true,
          timestamp: true,
          chat: { select: { name: true, chatType: true } },
        },
      }),
      prisma.assignee.findFirst({
        where: { feishuUserId: senderId },
        select: { id: true, name: true },
      }),
    ]);

    if (totalMessages === 0) {
      return NextResponse.json({ error: '未找到该发送者' }, { status: 404 });
    }

    // Resolve chat names for activity list
    const chatIdList = chatActivity.map((c) => c.chatId);
    const chats = await prisma.feishuChat.findMany({
      where: { chatId: { in: chatIdList } },
      select: { chatId: true, name: true, chatType: true },
    });
    const chatMap = new Map(chats.map((c) => [c.chatId, c]));

    // Get sender name from most recent message
    const senderName = recentMessages[0]?.senderName || senderId;

    return NextResponse.json({
      success: true,
      sender: {
        senderId,
        senderName,
        assignee,
        stats: {
          totalMessages,
          firstMessageAt: timeRange._min.timestamp,
          lastMessageAt: timeRange._max.timestamp,
          activeChats: chatActivity.map((c) => ({
            chatId: c.chatId,
            chatName: chatMap.get(c.chatId)?.name || c.chatId,
            chatType: chatMap.get(c.chatId)?.chatType || 'unknown',
            messageCount: c._count.id,
          })),
          messagesByType: Object.fromEntries(
            typeBreakdown.map((t) => [t.msgType, t._count.id])
          ),
        },
        recentMessages: recentMessages.map((m) => ({
          ...m,
          chatName: m.chat?.name || null,
          chatType: m.chat?.chatType || null,
          chat: undefined,
        })),
      },
    });
  } catch (error) {
    console.error('[Feishu] Sender detail failed:', error);
    return NextResponse.json({ error: 'Failed to fetch sender details' }, { status: 500 });
  }
}
