import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { startClaudeJob } from '@/lib/claude-worker';

// POST /api/chat — Send a message (async: returns immediately, processes in background)
export async function POST(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  try {
    const body = await req.json();
    const { threadId, message, files } = body;

    if (!message?.trim()) {
      return NextResponse.json({ success: false, error: 'Message is required' }, { status: 400 });
    }

    // Build prompt: append file references so Claude CLI can read them
    let trimmedMessage = message.trim();
    const attachedFiles: Array<{ name: string; path: string }> = files || [];
    if (attachedFiles.length > 0) {
      const fileList = attachedFiles
        .map((f: { name: string; path: string }) => `- ${f.name}: ${f.path}`)
        .join('\n');
      trimmedMessage += `\n\n[附件 — 请用 Read 工具读取以下文件进行分析]\n${fileList}`;
    }

    // Load or create conversation
    let chatId = threadId;
    let conv = threadId
      ? await prisma.botConversation.findUnique({ where: { chatId: threadId } })
      : null;

    if (threadId && !conv) {
      return NextResponse.json({ success: false, error: 'Thread not found' }, { status: 404 });
    }

    const isNew = !conv;
    if (!chatId) {
      chatId = `web-${crypto.randomUUID()}`;
    }

    // Generate title for new conversations (first 50 chars of message)
    let title = conv?.title || null;
    if (isNew) {
      title = trimmedMessage.slice(0, 50) + (trimmedMessage.length > 50 ? '...' : '');
    }

    // Upsert conversation
    conv = await prisma.botConversation.upsert({
      where: { chatId },
      create: {
        chatId,
        title,
        source: 'web',
        lastActiveAt: new Date(),
      },
      update: {
        lastActiveAt: new Date(),
      },
    });

    // Create user message
    const userMsg = await prisma.botMessage.create({
      data: {
        conversationId: conv.id,
        role: 'user',
        content: trimmedMessage,
        status: 'done',
      },
    });

    // Create assistant message (pending — will be filled by background worker)
    const assistantMsg = await prisma.botMessage.create({
      data: {
        conversationId: conv.id,
        role: 'assistant',
        status: 'pending',
        progress: '排队中...',
      },
    });

    // Fire-and-forget: start Claude background job
    startClaudeJob(assistantMsg.id, trimmedMessage, conv.claudeSessionId);

    return NextResponse.json({
      success: true,
      data: {
        threadId: chatId,
        messageId: assistantMsg.id,
        userMessageId: userMsg.id,
        status: 'processing',
        title,
      },
    });
  } catch (error: any) {
    console.error('Chat API error:', error?.message || error);
    return NextResponse.json({ success: false, error: 'Failed to process message' }, { status: 500 });
  }
}

// GET /api/chat — List all web chat threads
export async function GET(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  try {
    const threads = await prisma.botConversation.findMany({
      where: { source: 'web' },
      orderBy: { lastActiveAt: 'desc' },
      select: {
        id: true,
        chatId: true,
        title: true,
        lastActiveAt: true,
        hasUnread: true,
        botMessages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            content: true,
            role: true,
          },
        },
      },
    });

    const data = threads.map((t) => {
      const lastMsg = t.botMessages[0] || null;
      return {
        id: t.id,
        chatId: t.chatId,
        title: t.title || '新对话',
        lastActiveAt: t.lastActiveAt,
        hasUnread: t.hasUnread,
        preview: lastMsg?.content ? lastMsg.content.slice(0, 50) : '',
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Failed to list chat threads:', error);
    return NextResponse.json({ success: false, error: 'Failed to list threads' }, { status: 500 });
  }
}
