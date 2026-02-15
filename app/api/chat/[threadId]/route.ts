import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

/**
 * GET /api/chat/[threadId]
 * Get thread with messages
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const token = req.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Invalid session' },
        { status: 401 }
      );
    }

    const { threadId } = await params;

    const thread = await prisma.botConversation.findUnique({
      where: { chatId: threadId },
      include: {
        botMessages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            content: true,
            status: true,
            progress: true,
            errorMessage: true,
            unread: true,
            createdAt: true,
          },
        },
      },
    });

    if (!thread || thread.source !== 'web') {
      return NextResponse.json(
        { success: false, error: 'Thread not found' },
        { status: 404 }
      );
    }

    // Mark all unread messages as read when the thread is opened
    if (thread.hasUnread) {
      await prisma.botMessage.updateMany({
        where: { conversationId: thread.id, unread: true },
        data: { unread: false },
      });
      await prisma.botConversation.update({
        where: { id: thread.id },
        data: { hasUnread: false },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: thread.id,
        chatId: thread.chatId,
        title: thread.title,
        messages: thread.botMessages,
      },
    });
  } catch (error) {
    console.error('Get thread error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch thread' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/chat/[threadId]
 * Rename thread
 * Body: { title: string }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const token = req.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Invalid session' },
        { status: 401 }
      );
    }

    const { threadId } = await params;

    const body = await req.json();
    const { title } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Title is required and cannot be empty' },
        { status: 400 }
      );
    }

    const thread = await prisma.botConversation.findUnique({
      where: { chatId: threadId },
    });

    if (!thread || thread.source !== 'web') {
      return NextResponse.json(
        { success: false, error: 'Thread not found' },
        { status: 404 }
      );
    }

    await prisma.botConversation.update({
      where: { chatId: threadId },
      data: { title: title.trim() },
    });

    return NextResponse.json({
      success: true,
      data: { title: title.trim() },
    });
  } catch (error) {
    console.error('Rename thread error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to rename thread' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/chat/[threadId]
 * Delete thread
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const token = req.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Invalid session' },
        { status: 401 }
      );
    }

    const { threadId } = await params;

    const thread = await prisma.botConversation.findUnique({
      where: { chatId: threadId },
    });

    if (!thread || thread.source !== 'web') {
      return NextResponse.json(
        { success: false, error: 'Thread not found' },
        { status: 404 }
      );
    }

    await prisma.botConversation.delete({
      where: { chatId: threadId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete thread error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete thread' },
      { status: 500 }
    );
  }
}
