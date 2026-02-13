import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalChats, totalMessages, todayMessages, recentChats] = await Promise.all([
      prisma.feishuChat.count(),
      prisma.feishuMessage.count(),
      prisma.feishuMessage.count({
        where: { timestamp: { gte: todayStart } },
      }),
      prisma.feishuChat.findMany({
        orderBy: { lastMessage: 'desc' },
        take: 5,
        include: {
          _count: { select: { messages: true } },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        totalChats,
        totalMessages,
        todayMessages,
        recentChats,
      },
    });
  } catch (error) {
    console.error('[Feishu] Failed to fetch stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
