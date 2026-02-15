# Web Chat Assistant Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a floating chat bubble to all Dashboard pages that lets users have multi-topic natural language conversations with the POA Master AI assistant, with per-topic memory persistence.

**Architecture:** Extend the existing `BotConversation` model with `title` and `source` fields. Create `lib/bot-tools.ts` with the 5 OpenAI function-calling tools (mirrored from the Feishu bot-agent). Build `POST/GET/DELETE/PATCH /api/chat` routes using the standard session-auth pattern. Add a `ChatBubble` component to the Dashboard layout with thread list + chat views.

**Tech Stack:** Next.js 16 App Router, MUI 6, Prisma, OpenAI API (function calling), TypeScript

---

### Task 1: Extend BotConversation Schema

Add `title`, `source`, and `@@index([source])` to the existing `BotConversation` model.

**Files:**
- Modify: `prisma/schema.prisma:835-844`

**Step 1: Edit the schema**

Change the BotConversation model from:

```prisma
model BotConversation {
  id           String   @id @default(cuid())
  chatId       String   @unique
  messages     Json     @default("[]")
  lastActiveAt DateTime @default(now())
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([lastActiveAt])
}
```

to:

```prisma
model BotConversation {
  id           String   @id @default(cuid())
  chatId       String   @unique
  title        String?
  source       String   @default("feishu")
  messages     Json     @default("[]")
  lastActiveAt DateTime @default(now())
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([lastActiveAt])
  @@index([source])
}
```

**Step 2: Create migration SQL manually**

This project has a known issue where `prisma migrate dev` fails due to shadow database replay of data-only migrations. Write migration SQL manually:

Create directory `prisma/migrations/20260215_add_bot_conversation_fields/` and file `migration.sql`:

```sql
-- AlterTable
ALTER TABLE "BotConversation" ADD COLUMN "title" TEXT;
ALTER TABLE "BotConversation" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'feishu';

-- CreateIndex
CREATE INDEX "BotConversation_source_idx" ON "BotConversation"("source");
```

**Step 3: Apply migration**

Run:
```bash
npx prisma db execute --file prisma/migrations/20260215_add_bot_conversation_fields/migration.sql
npx prisma migrate resolve --applied 20260215_add_bot_conversation_fields
npx prisma generate
```

Expected: Migration applied, Prisma client regenerated with new fields.

**Step 4: Verify**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No new errors.

**Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260215_add_bot_conversation_fields/
git commit -m "feat(schema): add title and source fields to BotConversation"
```

---

### Task 2: Create Shared Bot Tools Module

Create `lib/bot-tools.ts` with the 5 tool definitions and execution logic, mirrored from `services/feishu-listener/src/bot-agent.ts` but adapted for the Next.js server environment (uses `@/lib/prisma` directly instead of module-level init).

**Files:**
- Create: `lib/bot-tools.ts`
- Reference: `services/feishu-listener/src/bot-agent.ts` (lines 55-285 for tool defs + execution)

**Step 1: Create the file**

Create `lib/bot-tools.ts` with the following content:

```typescript
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

export const BOT_SYSTEM_PROMPT = [
  '你是 POA Master AI 助手，帮助COO管理团队。',
  '你可以查询任务、人员状态、团队脉搏、决策日志等数据。',
  '用简洁的中文回答，重点突出，格式清晰。',
].join('');

export const BOT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_today_priorities',
      description: '获取今日优先事项：逾期任务、未处理信号、待执行决策',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_person_status',
      description: '获取某人的状态概要：活跃度、任务进展、情绪状态',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '人员姓名' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_task_list',
      description: '查询任务列表，可按负责人和状态筛选',
      parameters: {
        type: 'object',
        properties: {
          assignee: { type: 'string', description: '负责人姓名（可选）' },
          status: {
            type: 'string',
            enum: ['TODO', 'IN_PROGRESS', 'DONE'],
            description: '任务状态（可选）',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_team_pulse',
      description: '获取团队脉搏概览：消息活跃度、情绪趋势、关键信号',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: '查看最近几天，默认7' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_decisions',
      description: '查询决策日志，可按状态筛选',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['PENDING', 'EXECUTING', 'COMPLETED', 'REVISED'],
            description: '决策状态（可选）',
          },
        },
      },
    },
  },
];

export async function executeBotTool(
  name: string,
  args: Record<string, any>,
  prisma: PrismaClient,
): Promise<string> {
  const days = (args.days as number) || 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  switch (name) {
    case 'get_today_priorities': {
      const [overdue, signals, decisions] = await Promise.all([
        prisma.task.findMany({
          where: { status: { not: 'DONE' }, dueDate: { lt: new Date() } },
          include: { assignee: { select: { name: true } } },
          take: 5,
        }),
        prisma.chatSignal.findMany({
          where: { isResolved: false, severity: { in: ['HIGH', 'CRITICAL'] } },
          include: { chat: { select: { name: true } } },
          take: 5,
          orderBy: { detectedAt: 'desc' },
        }),
        prisma.decision.findMany({
          where: { status: 'PENDING' },
          take: 5,
          orderBy: { madeAt: 'desc' },
        }),
      ]);
      return JSON.stringify({
        overdueTasks: overdue.map((t) => ({
          title: t.title,
          assignee: t.assignee?.name,
          dueDate: t.dueDate,
        })),
        signals: signals.map((s) => ({
          type: s.signalType,
          severity: s.severity,
          title: s.title,
          chat: s.chat.name,
        })),
        pendingDecisions: decisions.map((d) => ({
          title: d.title,
          madeBy: d.madeBy,
        })),
      });
    }

    case 'get_person_status': {
      const assignee = await prisma.assignee.findFirst({
        where: { name: { contains: args.name as string } },
      });
      if (!assignee) {
        return JSON.stringify({ error: `未找到名为"${args.name}"的人员` });
      }
      const [msgCount, tasks] = await Promise.all([
        prisma.feishuMessage.count({
          where: { senderName: assignee.name, timestamp: { gte: since } },
        }),
        prisma.task.findMany({ where: { assigneeId: assignee.id } }),
      ]);
      const byStatus: Record<string, number> = {};
      tasks.forEach((t) => {
        byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      });
      return JSON.stringify({
        name: assignee.name,
        weekMessages: msgCount,
        tasks: byStatus,
        overdue: tasks
          .filter(
            (t) =>
              t.status !== 'DONE' &&
              t.dueDate &&
              new Date(t.dueDate) < new Date(),
          )
          .map((t) => t.title),
      });
    }

    case 'get_task_list': {
      const where: Record<string, any> = {};
      if (args.assignee) {
        const a = await prisma.assignee.findFirst({
          where: { name: { contains: args.assignee as string } },
        });
        if (a) where.assigneeId = a.id;
      }
      if (args.status) where.status = args.status;
      const tasks = await prisma.task.findMany({
        where,
        include: { assignee: { select: { name: true } } },
        take: 15,
        orderBy: { dueDate: 'asc' },
      });
      return JSON.stringify(
        tasks.map((t) => ({
          title: t.title,
          status: t.status,
          assignee: t.assignee?.name,
          dueDate: t.dueDate,
        })),
      );
    }

    case 'get_team_pulse': {
      const [msgCount, signals, sentiment] = await Promise.all([
        prisma.feishuMessage.count({
          where: { timestamp: { gte: since } },
        }),
        prisma.chatSignal.findMany({
          where: { detectedAt: { gte: since } },
          include: { chat: { select: { name: true } } },
          take: 5,
        }),
        prisma.teamPulse.findMany({
          where: { date: { gte: since } },
          select: { sentimentScore: true },
        }),
      ]);
      const avgSentiment =
        sentiment.length > 0
          ? sentiment.reduce((s, p) => s + (p.sentimentScore || 0), 0) /
            sentiment.length
          : null;
      return JSON.stringify({
        totalMessages: msgCount,
        avgSentiment,
        recentSignals: signals.map((s) => ({
          type: s.signalType,
          severity: s.severity,
          title: s.title,
          chat: s.chat.name,
        })),
      });
    }

    case 'get_decisions': {
      const where: Record<string, any> = {};
      if (args.status) where.status = args.status;
      const decisions = await prisma.decision.findMany({
        where,
        take: 10,
        orderBy: { madeAt: 'desc' },
      });
      return JSON.stringify(
        decisions.map((d) => ({
          title: d.title,
          status: d.status,
          madeBy: d.madeBy,
          madeAt: d.madeAt,
        })),
      );
    }

    default:
      return JSON.stringify({ error: 'Unknown tool' });
  }
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No new errors.

**Step 3: Commit**

```bash
git add lib/bot-tools.ts
git commit -m "feat: create shared bot tools module for web chat API"
```

---

### Task 3: Create Chat API — POST /api/chat (Send Message)

The main chat endpoint. Receives a user message (with optional threadId), calls OpenAI with function-calling tools, persists history, returns reply.

**Files:**
- Create: `app/api/chat/route.ts`
- Reference: `lib/bot-tools.ts` (BOT_TOOLS, executeBotTool, BOT_SYSTEM_PROMPT)
- Reference: `lib/openai.ts` (getOpenAIClient, getOpenAIModel)
- Reference: `lib/auth.ts` (verifySession)
- Reference: `app/api/decisions/route.ts` (auth pattern example)

**Step 1: Create the POST handler**

Create `app/api/chat/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { getOpenAIClient, getOpenAIModel } from '@/lib/openai';
import { BOT_TOOLS, executeBotTool, BOT_SYSTEM_PROMPT } from '@/lib/bot-tools';
import { createId } from '@paralleldrive/cuid2';
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
      chatId = `web-${createId()}`;
    }

    const history: Array<{ role: string; content: string }> =
      (conv?.messages as Array<{ role: string; content: string }>) || [];
    history.push({ role: 'user', content: message.trim() });
    const trimmed = history.slice(-MAX_HISTORY);

    // Build messages for OpenAI
    const systemMsg = `${BOT_SYSTEM_PROMPT}\n当前时间: ${new Date().toLocaleString('zh-CN')}`;

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

    // Handle tool calls
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

      // Second call — synthesize tool results
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

    // Generate title for new conversations
    let title = conv?.title || null;
    if (isNew) {
      // Use first user message truncated as title
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
```

**Step 2: Check if `@paralleldrive/cuid2` is already available**

Run: `node -e "require('@paralleldrive/cuid2')"`

If not available, the cuid2 import needs to be replaced with a simple random ID generator. Use `crypto.randomUUID()` instead:

Replace `import { createId } from '@paralleldrive/cuid2';` with nothing, and replace `chatId = \`web-${createId()}\`;` with `chatId = \`web-${crypto.randomUUID()}\`;`.

**Step 3: Verify compilation**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No new errors.

**Step 4: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat: add POST/GET /api/chat for web chat assistant"
```

---

### Task 4: Create Chat Thread Detail API — GET/PATCH/DELETE /api/chat/[threadId]

**Files:**
- Create: `app/api/chat/[threadId]/route.ts`

**Step 1: Create the route**

Create `app/api/chat/[threadId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

// GET /api/chat/[threadId] — Get thread with messages
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  try {
    const { threadId } = await params;
    const thread = await prisma.botConversation.findUnique({
      where: { chatId: threadId },
    });

    if (!thread || thread.source !== 'web') {
      return NextResponse.json({ success: false, error: 'Thread not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: thread.id,
        chatId: thread.chatId,
        title: thread.title || '新对话',
        messages: thread.messages,
      },
    });
  } catch (error) {
    console.error('Failed to get thread:', error);
    return NextResponse.json({ success: false, error: 'Failed to get thread' }, { status: 500 });
  }
}

// PATCH /api/chat/[threadId] — Rename thread
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  try {
    const { threadId } = await params;
    const body = await req.json();
    const { title } = body;

    if (!title?.trim()) {
      return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
    }

    const thread = await prisma.botConversation.findUnique({
      where: { chatId: threadId },
    });

    if (!thread || thread.source !== 'web') {
      return NextResponse.json({ success: false, error: 'Thread not found' }, { status: 404 });
    }

    const updated = await prisma.botConversation.update({
      where: { chatId: threadId },
      data: { title: title.trim() },
    });

    return NextResponse.json({ success: true, data: { title: updated.title } });
  } catch (error) {
    console.error('Failed to rename thread:', error);
    return NextResponse.json({ success: false, error: 'Failed to rename thread' }, { status: 500 });
  }
}

// DELETE /api/chat/[threadId] — Delete thread
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  try {
    const { threadId } = await params;
    const thread = await prisma.botConversation.findUnique({
      where: { chatId: threadId },
    });

    if (!thread || thread.source !== 'web') {
      return NextResponse.json({ success: false, error: 'Thread not found' }, { status: 404 });
    }

    await prisma.botConversation.delete({ where: { chatId: threadId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete thread:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete thread' }, { status: 500 });
  }
}
```

**Important:** `params` is a `Promise` in Next.js 15+ — must `await params` before accessing fields.

**Step 2: Verify compilation**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No new errors.

**Step 3: Commit**

```bash
git add app/api/chat/[threadId]/route.ts
git commit -m "feat: add GET/PATCH/DELETE /api/chat/[threadId] for thread management"
```

---

### Task 5: Create ChatBubble Component — Thread List View

Build the floating chat bubble and thread list view. This is the first half of the UI — showing the bubble button and the thread list when opened.

**Files:**
- Create: `components/ChatBubble.tsx`
- Reference: `lib/theme.ts` (designTokens for styling)

**Step 1: Create ChatBubble.tsx with bubble + thread list**

Create `components/ChatBubble.tsx`:

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Fab,
  Paper,
  Typography,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  ListItemSecondaryAction,
  TextField,
  CircularProgress,
  Fade,
  Zoom,
  Divider,
} from '@mui/material';
import {
  SmartToy as SmartToyIcon,
  Close as CloseIcon,
  Add as AddIcon,
  ArrowBack as ArrowBackIcon,
  Send as SendIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { designTokens as dt } from '@/lib/theme';

interface Thread {
  id: string;
  chatId: string;
  title: string;
  lastActiveAt: string;
  preview: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatBubble() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'threads' | 'chat'>('threads');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<{ chatId: string; title: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load threads when panel opens
  useEffect(() => {
    if (open && view === 'threads') {
      loadThreads();
    }
  }, [open, view]);

  async function loadThreads() {
    setThreadsLoading(true);
    try {
      const res = await fetch('/api/chat');
      const json = await res.json();
      if (json.success) setThreads(json.data);
    } catch (err) {
      console.error('Failed to load threads:', err);
    } finally {
      setThreadsLoading(false);
    }
  }

  async function openThread(thread: Thread) {
    setActiveThread({ chatId: thread.chatId, title: thread.title });
    setView('chat');
    try {
      const res = await fetch(`/api/chat/${thread.chatId}`);
      const json = await res.json();
      if (json.success) {
        setMessages(json.data.messages || []);
      }
    } catch (err) {
      console.error('Failed to load thread:', err);
    }
  }

  function startNewChat() {
    setActiveThread(null);
    setMessages([]);
    setView('chat');
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: activeThread?.chatId || undefined,
          message: text,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessages((prev) => [...prev, { role: 'assistant', content: json.data.reply }]);
        // Update thread reference for subsequent messages
        if (!activeThread) {
          setActiveThread({ chatId: json.data.threadId, title: json.data.title });
        }
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: '抱歉，请求失败，请重试。' }]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: '网络错误，请检查连接后重试。' }]);
    } finally {
      setLoading(false);
    }
  }

  async function deleteThread(chatId: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await fetch(`/api/chat/${chatId}`, { method: 'DELETE' });
      setThreads((prev) => prev.filter((t) => t.chatId !== chatId));
    } catch (err) {
      console.error('Failed to delete thread:', err);
    }
  }

  function goBack() {
    setView('threads');
    setActiveThread(null);
    setMessages([]);
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}小时前`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }

  return (
    <>
      {/* Floating Action Button */}
      <Zoom in={!open}>
        <Fab
          onClick={() => setOpen(true)}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1300,
            background: `linear-gradient(135deg, ${dt.accent.main} 0%, ${dt.purple.main} 100%)`,
            color: '#fff',
            boxShadow: `0 4px 20px ${alpha(dt.accent.main, 0.35)}`,
            '&:hover': {
              background: `linear-gradient(135deg, ${dt.accent.dark} 0%, ${dt.purple.dark} 100%)`,
            },
          }}
        >
          <SmartToyIcon />
        </Fab>
      </Zoom>

      {/* Chat Window */}
      <Fade in={open}>
        <Paper
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 400,
            height: 520,
            zIndex: 1300,
            display: open ? 'flex' : 'none',
            flexDirection: 'column',
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: `0 8px 32px ${alpha('#0f172a', 0.12)}`,
          }}
        >
          {/* Header */}
          <Box
            sx={{
              p: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              background: `linear-gradient(135deg, ${dt.accent.main} 0%, ${dt.purple.main} 100%)`,
              color: '#fff',
              minHeight: 48,
            }}
          >
            {view === 'chat' && (
              <IconButton size="small" onClick={goBack} sx={{ color: '#fff' }}>
                <ArrowBackIcon fontSize="small" />
              </IconButton>
            )}
            <SmartToyIcon fontSize="small" />
            <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 700, color: '#fff' }}>
              {view === 'chat' ? (activeThread?.title || '新对话') : 'AI 助手'}
            </Typography>
            <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: '#fff' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Thread List View */}
          {view === 'threads' && (
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Box sx={{ p: 1.5 }}>
                <ListItemButton
                  onClick={startNewChat}
                  sx={{
                    borderRadius: 2,
                    border: `1px dashed ${dt.border.strong}`,
                    justifyContent: 'center',
                    gap: 1,
                  }}
                >
                  <AddIcon fontSize="small" color="primary" />
                  <Typography variant="body2" color="primary" fontWeight={600}>
                    新对话
                  </Typography>
                </ListItemButton>
              </Box>
              <Divider />
              <Box sx={{ flex: 1, overflow: 'auto' }}>
                {threadsLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress size={24} />
                  </Box>
                ) : threads.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                    还没有对话，开始一个吧
                  </Typography>
                ) : (
                  <List>
                    {threads.map((t) => (
                      <ListItemButton key={t.chatId} onClick={() => openThread(t)} sx={{ pr: 6 }}>
                        <ListItemText
                          primary={t.title}
                          secondary={`${t.preview} · ${formatTime(t.lastActiveAt)}`}
                          primaryTypographyProps={{ variant: 'body2', fontWeight: 600, noWrap: true }}
                          secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
                        />
                        <ListItemSecondaryAction>
                          <IconButton
                            edge="end"
                            size="small"
                            onClick={(e) => deleteThread(t.chatId, e)}
                            sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItemButton>
                    ))}
                  </List>
                )}
              </Box>
            </Box>
          )}

          {/* Chat View */}
          {view === 'chat' && (
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Messages */}
              <Box sx={{ flex: 1, overflow: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {messages.length === 0 && !loading && (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                    有什么我可以帮你的？
                  </Typography>
                )}
                {messages.map((msg, i) => (
                  <Box
                    key={i}
                    sx={{
                      display: 'flex',
                      justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <Box
                      sx={{
                        maxWidth: '80%',
                        px: 1.5,
                        py: 1,
                        borderRadius: 2,
                        backgroundColor:
                          msg.role === 'user'
                            ? dt.accent.main
                            : dt.bg.deep,
                        color:
                          msg.role === 'user'
                            ? '#fff'
                            : dt.text.primary,
                      }}
                    >
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {msg.content}
                      </Typography>
                    </Box>
                  </Box>
                ))}
                {loading && (
                  <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <Box
                      sx={{
                        px: 1.5,
                        py: 1,
                        borderRadius: 2,
                        backgroundColor: dt.bg.deep,
                      }}
                    >
                      <CircularProgress size={16} />
                    </Box>
                  </Box>
                )}
                <div ref={messagesEndRef} />
              </Box>

              {/* Input */}
              <Box sx={{ p: 1.5, borderTop: `1px solid ${dt.border.default}`, display: 'flex', gap: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="输入消息..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  disabled={loading}
                  multiline
                  maxRows={3}
                />
                <IconButton
                  onClick={sendMessage}
                  disabled={!input.trim() || loading}
                  sx={{
                    color: dt.accent.main,
                    '&:hover': { backgroundColor: dt.accent.subtle },
                  }}
                >
                  <SendIcon />
                </IconButton>
              </Box>
            </Box>
          )}
        </Paper>
      </Fade>
    </>
  );
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No new errors.

**Step 3: Commit**

```bash
git add components/ChatBubble.tsx
git commit -m "feat: create ChatBubble component with thread list and chat views"
```

---

### Task 6: Add ChatBubble to Dashboard Layout

Mount the ChatBubble component in the Dashboard layout so it appears on all dashboard pages.

**Files:**
- Modify: `app/(dashboard)/layout.tsx`

**Step 1: Edit the layout**

Change `app/(dashboard)/layout.tsx` from:

```tsx
'use client';

import { Box } from '@mui/material';
import Header from '@/components/Header';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Header />
      <Box component="main" sx={{ px: { xs: 2, sm: 3, md: 4 }, py: 3 }}>
        {children}
      </Box>
    </Box>
  );
}
```

to:

```tsx
'use client';

import { Box } from '@mui/material';
import Header from '@/components/Header';
import ChatBubble from '@/components/ChatBubble';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Header />
      <Box component="main" sx={{ px: { xs: 2, sm: 3, md: 4 }, py: 3 }}>
        {children}
      </Box>
      <ChatBubble />
    </Box>
  );
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No new errors.

**Step 3: Commit**

```bash
git add app/(dashboard)/layout.tsx
git commit -m "feat: mount ChatBubble in dashboard layout for all pages"
```

---

### Task 7: Manual Testing & Final Verification

Test the full flow end-to-end on the running dev server.

**Step 1: Restart dev server (clear caches after schema change)**

Run:
```bash
lsof -ti:3030 | xargs kill -9 2>/dev/null; rm -rf .next; npx next dev -p 3030
```

**Step 2: Verify the bubble appears**

- Navigate to `http://localhost:3030` (dashboard home)
- Confirm: blue/purple floating bubble visible in bottom-right corner
- Click it → chat window opens with "AI 助手" header and thread list
- Navigate to `/todo`, `/decisions`, `/insights` → bubble persists on every page

**Step 3: Test new conversation**

- Click "新对话" button
- Type "今天有什么需要关注的？" → press Enter
- Confirm: loading spinner appears, then AI response with priorities
- Confirm: thread gets a title based on first message

**Step 4: Test thread persistence**

- Click back arrow → return to thread list
- Confirm: the new thread appears in the list with title and preview
- Click the thread → messages reload from server

**Step 5: Test thread deletion**

- Click delete icon on a thread
- Confirm: thread disappears from list

**Step 6: Verify TypeScript compilation**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No new errors from our changes.

**Step 7: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```
