import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

/**
 * GET /api/feishu/messages
 * Cross-chat message query with time range, sender, and type filters.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = await verifySession(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const startTime = searchParams.get('startTime');
    const endTime = searchParams.get('endTime');
    const chatIds = searchParams.get('chatIds');
    const senderIds = searchParams.get('senderIds');
    const msgType = searchParams.get('msgType');

    const where: any = {};

    if (startTime) {
      const d = new Date(startTime);
      if (!isNaN(d.getTime())) where.timestamp = { ...where.timestamp, gte: d };
    }
    if (endTime) {
      const d = new Date(endTime);
      if (!isNaN(d.getTime())) where.timestamp = { ...where.timestamp, lte: d };
    }
    if (chatIds) {
      const ids = chatIds.split(',').filter(Boolean);
      if (ids.length > 0) where.chatId = { in: ids };
    }
    if (senderIds) {
      const ids = senderIds.split(',').filter(Boolean);
      if (ids.length > 0) where.senderId = { in: ids };
    }
    if (msgType) {
      where.msgType = msgType;
    }

    const [messages, total] = await Promise.all([
      prisma.feishuMessage.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          messageId: true,
          chatId: true,
          senderId: true,
          senderName: true,
          content: true,
          msgType: true,
          timestamp: true,
          chat: { select: { name: true, chatType: true } },
        },
      }),
      prisma.feishuMessage.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      messages: messages.map((m) => ({
        ...m,
        chatName: m.chat?.name || null,
        chatType: m.chat?.chatType || null,
        chat: undefined,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('[Feishu] Failed to fetch messages:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}
