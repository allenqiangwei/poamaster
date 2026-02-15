import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { callClaude } from '@/lib/claude-bridge';

const MAX_HISTORY = 20;

// POST /api/chat — Send a message (creates thread if no threadId)
export async function POST(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  try {
    const body = await req.json();
    const { threadId, message } = body;

    if (!message?.trim()) {
      return NextResponse.json({ success: false, error: 'Message is required' }, { status: 400 });
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

    const history: Array<{ role: string; content: string }> =
      (conv?.messages as Array<{ role: string; content: string }>) || [];
    history.push({ role: 'user', content: message.trim() });
    const trimmed = history.slice(-MAX_HISTORY);

    // Call Claude CLI
    const claudeResult = await callClaude(
      message.trim(),
      conv?.claudeSessionId,
    );

    const reply = claudeResult.result || '(Claude 未返回内容)';

    // Save history
    trimmed.push({ role: 'assistant', content: reply });
    const savedMessages = trimmed.slice(-MAX_HISTORY);

    // Generate title for new conversations (first message truncated to 50 chars)
    let title = conv?.title || null;
    if (isNew) {
      title = message.trim().slice(0, 50) + (message.trim().length > 50 ? '...' : '');
    }

    await prisma.botConversation.upsert({
      where: { chatId },
      create: {
        chatId,
        title,
        source: 'web',
        messages: savedMessages as any,
        lastActiveAt: new Date(),
        claudeSessionId: claudeResult.sessionId,
      },
      update: {
        messages: savedMessages as any,
        lastActiveAt: new Date(),
        claudeSessionId: claudeResult.sessionId,
      },
    });

    return NextResponse.json({
      success: true,
      data: { threadId: chatId, reply, title },
    });
  } catch (error: any) {
    console.error('Chat API error:', error?.message || error);
    const isTimeout = error?.message?.includes('timed out');
    const msg = isTimeout
      ? 'Claude 响应超时，请稍后重试或缩短问题'
      : 'Failed to process message';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
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
        messages: true,
      },
    });

    const data = threads.map((t) => {
      const msgs = t.messages as Array<{ role: string; content: string }>;
      const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
      return {
        id: t.id,
        chatId: t.chatId,
        title: t.title || '新对话',
        lastActiveAt: t.lastActiveAt,
        preview: lastMsg ? lastMsg.content.slice(0, 50) : '',
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Failed to list chat threads:', error);
    return NextResponse.json({ success: false, error: 'Failed to list threads' }, { status: 500 });
  }
}
