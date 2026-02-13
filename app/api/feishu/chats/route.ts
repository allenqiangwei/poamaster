import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

/** Toggle blacklist status for a chat */
export async function PUT(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { chatId, isBlacklisted } = await request.json();
    if (!chatId || typeof isBlacklisted !== 'boolean') {
      return NextResponse.json(
        { error: 'chatId and isBlacklisted (boolean) are required' },
        { status: 400 }
      );
    }

    await prisma.feishuChat.update({
      where: { chatId },
      data: {
        isBlacklisted,
        blacklistedAt: isBlacklisted ? new Date() : null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Feishu] Failed to toggle blacklist:', error);
    return NextResponse.json({ error: 'Failed to toggle blacklist' }, { status: 500 });
  }
}

/** Rename a chat */
export async function PATCH(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { chatId, name } = await request.json();
    if (!chatId || !name) {
      return NextResponse.json({ error: 'chatId and name are required' }, { status: 400 });
    }

    await prisma.feishuChat.update({
      where: { chatId },
      data: { name, isRenamed: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Feishu] Failed to rename chat:', error);
    return NextResponse.json({ error: 'Failed to rename chat' }, { status: 500 });
  }
}

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

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const type = searchParams.get('type') || '';
    const sort = searchParams.get('sort') || 'lastMessage';
    const blacklisted = searchParams.get('blacklisted');

    const where: any = {};

    // Filter by blacklist status: ?blacklisted=true shows only blacklisted,
    // default (no param) excludes blacklisted chats
    if (blacklisted === 'true') {
      where.isBlacklisted = true;
    } else {
      where.isBlacklisted = false;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { chatId: { contains: search } },
      ];
    }

    if (type === 'group' || type === 'private') {
      where.chatType = type;
    }

    const orderBy: any = sort === 'lastMessage'
      ? { lastMessage: 'desc' }
      : { createdAt: 'desc' };

    const [chats, total] = await Promise.all([
      prisma.feishuChat.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { messages: true } },
        },
      }),
      prisma.feishuChat.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      chats,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('[Feishu] Failed to fetch chats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chats' },
      { status: 500 }
    );
  }
}
