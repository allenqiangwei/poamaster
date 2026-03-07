import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

/**
 * GET /api/feishu/messages/latest
 * Poll for new messages since a given timestamp.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = await verifySession(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const since = searchParams.get('since');
    if (!since) {
      return NextResponse.json({ error: 'since 参数必填 (ISO 8601)' }, { status: 400 });
    }
    const sinceDate = new Date(since);
    if (isNaN(sinceDate.getTime())) {
      return NextResponse.json({ error: 'since 日期格式无效' }, { status: 400 });
    }

    const chatIds = searchParams.get('chatIds');
    const where: any = { timestamp: { gt: sinceDate } };

    if (chatIds) {
      const ids = chatIds.split(',').filter(Boolean);
      if (ids.length > 0) where.chatId = { in: ids };
    }

    const messages = await prisma.feishuMessage.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      take: 200,
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
    });

    const latestTimestamp = messages.length > 0
      ? messages[messages.length - 1].timestamp.toISOString()
      : since;

    return NextResponse.json({
      success: true,
      messages: messages.map((m) => ({
        ...m,
        chatName: m.chat?.name || null,
        chatType: m.chat?.chatType || null,
        chat: undefined,
      })),
      count: messages.length,
      latestTimestamp,
    });
  } catch (error) {
    console.error('[Feishu] Latest messages poll failed:', error);
    return NextResponse.json({ error: 'Poll failed' }, { status: 500 });
  }
}
