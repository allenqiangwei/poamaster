import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

/**
 * GET /api/feishu/messages/search
 * Search message content by keyword with filters.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = await verifySession(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ error: '搜索关键词至少 2 个字符' }, { status: 400 });
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const startTime = searchParams.get('startTime');
    const endTime = searchParams.get('endTime');
    const chatIds = searchParams.get('chatIds');
    const senderIds = searchParams.get('senderIds');

    const where: any = {
      content: { contains: q, mode: 'insensitive' },
    };

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
      query: q,
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
    console.error('[Feishu] Message search failed:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
