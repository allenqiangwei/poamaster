import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

/** Rename a sender — updates senderName on all messages from this senderId,
 *  and upserts an Assignee record with the feishuUserId linked. */
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

    const { senderId, name } = await request.json();
    if (!senderId || !name) {
      return NextResponse.json({ error: 'senderId and name are required' }, { status: 400 });
    }

    const trimmedName = name.trim();

    // 1. Update all messages from this sender
    const result = await prisma.feishuMessage.updateMany({
      where: { senderId },
      data: { senderName: trimmedName },
    });

    // 2. Update private chat names where this sender appears
    await prisma.feishuChat.updateMany({
      where: {
        chatType: 'private',
        messages: { some: { senderId } },
      },
      data: { name: trimmedName },
    });

    // 3. Upsert Assignee: create if new name, link feishuUserId
    try {
      const existing = await prisma.assignee.findUnique({
        where: { name: trimmedName },
      });
      if (existing) {
        // Link feishuUserId if not already set
        if (!existing.feishuUserId) {
          await prisma.assignee.update({
            where: { id: existing.id },
            data: { feishuUserId: senderId },
          });
        }
      } else {
        // Create new assignee with feishuUserId
        await prisma.assignee.create({
          data: { name: trimmedName, feishuUserId: senderId },
        });
      }
    } catch (e: any) {
      // P2002 = unique constraint race condition, safe to ignore
      if (e?.code !== 'P2002') {
        console.error('[Feishu] Failed to upsert assignee:', e);
      }
    }

    return NextResponse.json({ success: true, updated: result.count });
  } catch (error) {
    console.error('[Feishu] Failed to rename sender:', error);
    return NextResponse.json({ error: 'Failed to rename sender' }, { status: 500 });
  }
}
