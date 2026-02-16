import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

/** Get whitelist entries (chat or sender) */
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
    const type = searchParams.get('type') || 'chat';

    if (type === 'sender') {
      const senders = await prisma.alertSenderWhitelist.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json({ success: true, senders });
    }

    // Default: type=chat — return both whitelisted and blacklisted chats
    const [whitelisted, blacklisted] = await Promise.all([
      prisma.feishuChat.findMany({
        where: { isWhitelisted: true },
        orderBy: { whitelistedAt: 'desc' },
        include: { _count: { select: { messages: true } } },
      }),
      prisma.feishuChat.findMany({
        where: { isBlacklisted: true },
        orderBy: { blacklistedAt: 'desc' },
        include: { _count: { select: { messages: true } } },
      }),
    ]);

    return NextResponse.json({ success: true, whitelisted, blacklisted });
  } catch (error) {
    console.error('[Feishu] Failed to fetch alert whitelist:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alert whitelist' },
      { status: 500 }
    );
  }
}

/** Add to whitelist (chat or sender) */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { type, id, name, reason } = await request.json();
    if (!type || !id) {
      return NextResponse.json(
        { error: 'type and id are required' },
        { status: 400 }
      );
    }

    if (type === 'sender') {
      if (!name) {
        return NextResponse.json(
          { error: 'name is required for sender whitelist' },
          { status: 400 }
        );
      }
      await prisma.alertSenderWhitelist.upsert({
        where: { senderId: id },
        update: { senderName: name, reason: reason || null },
        create: { senderId: id, senderName: name, reason: reason || null },
      });
      return NextResponse.json({ success: true });
    }

    if (type === 'chat') {
      await prisma.feishuChat.update({
        where: { chatId: id },
        data: { isWhitelisted: true, whitelistedAt: new Date() },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: 'type must be "chat" or "sender"' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Feishu] Failed to add to alert whitelist:', error);
    return NextResponse.json(
      { error: 'Failed to add to alert whitelist' },
      { status: 500 }
    );
  }
}

/** Remove from whitelist (chat or sender) */
export async function DELETE(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { type, id } = await request.json();
    if (!type || !id) {
      return NextResponse.json(
        { error: 'type and id are required' },
        { status: 400 }
      );
    }

    if (type === 'sender') {
      await prisma.alertSenderWhitelist.delete({
        where: { senderId: id },
      });
      return NextResponse.json({ success: true });
    }

    if (type === 'chat') {
      await prisma.feishuChat.update({
        where: { chatId: id },
        data: { isWhitelisted: false, whitelistedAt: null },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: 'type must be "chat" or "sender"' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Feishu] Failed to remove from alert whitelist:', error);
    return NextResponse.json(
      { error: 'Failed to remove from alert whitelist' },
      { status: 500 }
    );
  }
}
