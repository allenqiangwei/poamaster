import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { getOpenAIClient, getOpenAIModel } from '@/lib/openai';
import { BOT_TOOLS, executeBotTool, BOT_SYSTEM_PROMPT } from '@/lib/bot-tools';
import OpenAI from 'openai';

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

    // Build messages for OpenAI
    const systemMsg = BOT_SYSTEM_PROMPT + '\n当前时间: ' + new Date().toLocaleString('zh-CN');

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemMsg },
      ...trimmed.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const openai = await getOpenAIClient();
    const modelName = await getOpenAIModel();

    // First call — model decides which tools to call
    let response = await openai.chat.completions.create({
      model: modelName,
      messages,
      tools: BOT_TOOLS,
      temperature: 0.7,
      max_completion_tokens: 1500,
    });

    let assistantMsg = response.choices[0]?.message;

    // Handle tool calls — execute each, then send results back for synthesis
    if (assistantMsg?.tool_calls && assistantMsg.tool_calls.length > 0) {
      messages.push(assistantMsg as OpenAI.Chat.Completions.ChatCompletionMessageParam);

      for (const tc of assistantMsg.tool_calls) {
        if (tc.type !== 'function') continue;
        const args = JSON.parse(tc.function.arguments || '{}');
        const result = await executeBotTool(tc.function.name, args, prisma);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        });
      }

      // Second call — synthesize tool results into a natural answer
      response = await openai.chat.completions.create({
        model: modelName,
        messages,
        temperature: 0.7,
        max_completion_tokens: 1500,
      });
      assistantMsg = response.choices[0]?.message;
    }

    const reply = assistantMsg?.content || '抱歉，我暂时无法处理这个请求。';

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
      },
      update: {
        messages: savedMessages as any,
        lastActiveAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: { threadId: chatId, reply, title },
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
