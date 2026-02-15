# Async Chat with Streaming Progress Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the synchronous Claude chat into an async system with background processing, real-time streaming progress, and red dot unread notifications.

**Architecture:** POST /api/chat returns immediately after creating DB records and spawning a background Claude CLI process. The process writes progress and final results to a BotMessage table. Frontend polls for updates every 3s (active) or 10s (background). A Badge on the FAB shows unread count.

**Tech Stack:** Next.js App Router, Prisma/PostgreSQL, Claude CLI (`--output-format stream-json --verbose`), MUI Badge component

---

### Task 1: Prisma Schema — Add BotMessage model and update BotConversation

**Files:**
- Modify: `prisma/schema.prisma:638-651` (BotConversation model)

**Context:** The existing `BotConversation` model stores messages as a single `Json` field. We need a new `BotMessage` table for per-message status tracking, and add `hasUnread` to `BotConversation` for the red dot badge.

**Step 1: Add BotMessage model and update BotConversation in schema.prisma**

Find the `BotConversation` model block (line ~638) and add `hasUnread` field and the `botMessages` relation. Then add the new `BotMessage` model right after `BotConversation`.

```prisma
model BotConversation {
  id              String       @id @default(cuid())
  chatId          String       @unique
  messages        Json         @default("[]")
  lastActiveAt    DateTime     @default(now())
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  title           String?
  source          String       @default("feishu")
  claudeSessionId String?
  hasUnread       Boolean      @default(false)
  botMessages     BotMessage[]

  @@index([lastActiveAt])
  @@index([source])
}

model BotMessage {
  id             String          @id @default(cuid())
  conversationId String
  role           String          // 'user' | 'assistant'
  content        String?         // null while processing, filled on completion
  status         String          @default("pending") // pending | processing | done | error
  progress       String?         // current progress description, e.g. "正在读取文件..."
  errorMessage   String?         // error details when status = error
  unread         Boolean         @default(false) // true for new assistant replies
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  conversation   BotConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId])
  @@index([status])
  @@index([updatedAt])
}
```

**Step 2: Create the migration**

Run:
```bash
cd /Users/allenqiang/poamaster
npx prisma migrate dev --name add_bot_message_async_chat
```

Expected: Migration created successfully, `BotMessage` table exists, `hasUnread` column added to `BotConversation`.

**Step 3: Generate Prisma client**

Run:
```bash
npx prisma generate
```

Expected: Prisma client generated with `BotMessage` model available.

**IMPORTANT:** After `prisma generate`, you MUST restart the dev server — Turbopack caches old Prisma client.

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add BotMessage model for async chat processing"
```

---

### Task 2: Create Claude Worker — lib/claude-worker.ts

**Files:**
- Create: `lib/claude-worker.ts`

**Context:** This module replaces `lib/claude-bridge.ts` as the primary way to invoke Claude. Instead of awaiting a result, it spawns a background process that writes progress and results to the BotMessage table. It uses `--output-format stream-json --verbose` to get per-line JSON events from the CLI.

**CRITICAL:** Claude CLI (Bun binary) requires `spawn()` with `detached: true` and `stdio: ['ignore', 'pipe', 'pipe']` — it hangs otherwise. Also requires `--verbose` when using `--output-format stream-json`. Must include `--permission-mode bypassPermissions` or tool uses get denied.

**Step 1: Create lib/claude-worker.ts**

```typescript
import { spawn, ChildProcess } from 'child_process';
import { prisma } from './prisma';

const CLAUDE_PATH = '/opt/homebrew/bin/claude';
const DEFAULT_MODEL = 'sonnet';
const MAX_TURNS = '15';
const TIMEOUT_MS = 300000; // 5 minutes for async — more generous than sync
const SYSTEM_PROMPT = '你是 POA Master 的 AI 助手。直接回答用户的问题，不要使用 AskUserQuestion 工具，不要反问用户。如果信息不足，做出合理假设后直接给出答案。用中文回答。';

// In-memory tracking of active jobs (supplements DB state)
const activeJobs = new Map<string, ChildProcess>();

// Progress mapping: tool name → Chinese description
const TOOL_PROGRESS: Record<string, string> = {
  Read: '正在读取文件...',
  Grep: '正在搜索代码...',
  Bash: '正在执行命令...',
  Write: '正在编辑文件...',
  Edit: '正在编辑文件...',
  Glob: '正在查找文件...',
  WebSearch: '正在搜索网络...',
  WebFetch: '正在获取网页...',
  Task: '正在执行子任务...',
};

/**
 * Start a background Claude CLI job for a given assistant BotMessage.
 * Updates the BotMessage row with progress and final result.
 */
export function startClaudeJob(
  messageId: string,
  prompt: string,
  claudeSessionId?: string | null,
): void {
  const args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--max-turns', MAX_TURNS,
    '--model', DEFAULT_MODEL,
    '--append-system-prompt', SYSTEM_PROMPT,
    '--permission-mode', 'bypassPermissions',
    ...(claudeSessionId ? ['--resume', claudeSessionId] : []),
  ];

  const child = spawn(CLAUDE_PATH, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });

  activeJobs.set(messageId, child);

  // Mark as processing in DB
  prisma.botMessage.update({
    where: { id: messageId },
    data: { status: 'processing', progress: '正在思考...' },
  }).catch((err) => console.error('[claude-worker] DB update failed:', err));

  let buffer = '';
  let lastResult = '';
  let sessionId: string | undefined;
  let totalCost = 0;

  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();

    // Process complete lines
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        handleStreamEvent(messageId, event);

        // Capture result data
        if (event.type === 'result') {
          lastResult = event.result || '';
          sessionId = event.session_id;
          totalCost = event.total_cost_usd ?? 0;

          if (!lastResult && event.subtype === 'error_max_turns') {
            lastResult = '抱歉，这个问题比较复杂，我在处理过程中达到了回合数限制。请尝试简化问题或拆分成多个小问题。';
          }
        }
      } catch {
        // Not valid JSON — skip (could be partial line or debug output)
      }
    }
  });

  child.stderr.on('data', (chunk: Buffer) => {
    // Log stderr but don't fail — CLI often writes debug info to stderr
    const text = chunk.toString().trim();
    if (text) console.error('[claude-worker] stderr:', text.slice(0, 200));
  });

  // Timeout protection
  const timer = setTimeout(() => {
    console.warn('[claude-worker] Job timed out:', messageId);
    child.kill('SIGKILL');
    finalizeMessage(messageId, null, '处理超时，请重新发送', sessionId);
  }, TIMEOUT_MS);

  child.on('close', (code) => {
    clearTimeout(timer);
    activeJobs.delete(messageId);

    if (code !== 0 && !lastResult) {
      console.error('[claude-worker] Process exited with code:', code, 'for message:', messageId);
      finalizeMessage(messageId, null, `Claude 处理失败 (退出码: ${code})`, sessionId);
      return;
    }

    if (!lastResult) {
      console.warn('[claude-worker] Empty result for message:', messageId);
      lastResult = '(Claude 未返回内容)';
    }

    console.log('[claude-worker] Job done:', messageId, 'cost: $' + totalCost.toFixed(4), 'result_len:', lastResult.length);
    finalizeMessage(messageId, lastResult, null, sessionId);
  });

  child.on('error', (err) => {
    clearTimeout(timer);
    activeJobs.delete(messageId);
    console.error('[claude-worker] Spawn error:', err.message);
    finalizeMessage(messageId, null, `启动失败: ${err.message}`, sessionId);
  });
}

/**
 * Handle a single stream-json event and update progress in DB.
 */
function handleStreamEvent(messageId: string, event: any): void {
  let progress: string | null = null;

  if (event.type === 'assistant' && event.message?.content) {
    // Check for tool_use blocks in content
    const content = event.message.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'tool_use') {
          const toolName = block.name || '';
          progress = TOOL_PROGRESS[toolName] || `正在使用 ${toolName}...`;
          break;
        }
      }
      // If no tool_use, it's thinking
      if (!progress) {
        progress = '正在思考...';
      }
    }
  }

  if (progress) {
    prisma.botMessage.update({
      where: { id: messageId },
      data: { progress, updatedAt: new Date() },
    }).catch((err) => console.error('[claude-worker] Progress update failed:', err));
  }
}

/**
 * Write the final result (or error) to the BotMessage and update conversation.
 */
async function finalizeMessage(
  messageId: string,
  content: string | null,
  errorMessage: string | null,
  claudeSessionId?: string,
): Promise<void> {
  try {
    const isError = errorMessage !== null;

    // Update the assistant message
    const msg = await prisma.botMessage.update({
      where: { id: messageId },
      data: {
        content: isError ? null : content,
        status: isError ? 'error' : 'done',
        errorMessage: isError ? errorMessage : null,
        progress: null, // Clear progress on completion
        unread: !isError, // Only mark as unread if successful
      },
    });

    // Update conversation: hasUnread flag + claudeSessionId
    const updateData: any = { lastActiveAt: new Date() };
    if (!isError) updateData.hasUnread = true;
    if (claudeSessionId) updateData.claudeSessionId = claudeSessionId;

    await prisma.botConversation.update({
      where: { id: msg.conversationId },
      data: updateData,
    });
  } catch (err) {
    console.error('[claude-worker] finalizeMessage failed:', err);
  }
}

/**
 * Orphan detection: mark messages stuck in 'processing' for > 5 minutes as error.
 * Call this on module load / server startup.
 */
export async function cleanupOrphanedJobs(): Promise<number> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const result = await prisma.botMessage.updateMany({
    where: {
      status: { in: ['pending', 'processing'] },
      updatedAt: { lt: fiveMinAgo },
    },
    data: {
      status: 'error',
      errorMessage: '处理被中断，请重新发送',
      progress: null,
    },
  });
  if (result.count > 0) {
    console.log('[claude-worker] Cleaned up', result.count, 'orphaned jobs');
  }
  return result.count;
}

// Run orphan detection on module load
cleanupOrphanedJobs().catch(console.error);

/**
 * Cancel a running job (if still active in memory).
 */
export function cancelJob(messageId: string): boolean {
  const child = activeJobs.get(messageId);
  if (child) {
    child.kill('SIGKILL');
    activeJobs.delete(messageId);
    return true;
  }
  return false;
}
```

**Step 2: Verify the file compiles**

Run:
```bash
npx tsc --noEmit lib/claude-worker.ts 2>&1 | head -20
```

Note: This may show import errors if not run in the full project context. As long as the Next.js dev server starts, it's fine.

**Step 3: Commit**

```bash
git add lib/claude-worker.ts
git commit -m "feat: add async Claude worker with stream-json progress tracking"
```

---

### Task 3: Rewrite POST /api/chat — Async send

**Files:**
- Modify: `app/api/chat/route.ts` (entire POST handler)

**Context:** The current POST handler calls `callClaude()` synchronously and waits for the result. We need to change it to:
1. Create the user BotMessage
2. Create the assistant BotMessage (status=pending)
3. Create/update BotConversation
4. Call `startClaudeJob()` (fire-and-forget)
5. Return immediately with messageId

**Step 1: Rewrite app/api/chat/route.ts**

Replace the entire file content:

```typescript
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
    const { threadId, message } = body;

    if (!message?.trim()) {
      return NextResponse.json({ success: false, error: 'Message is required' }, { status: 400 });
    }

    // Load or create conversation
    let conv = threadId
      ? await prisma.botConversation.findUnique({ where: { chatId: threadId } })
      : null;

    if (threadId && !conv) {
      return NextResponse.json({ success: false, error: 'Thread not found' }, { status: 404 });
    }

    const chatId = threadId || `web-${crypto.randomUUID()}`;
    const isNew = !conv;

    // Generate title for new conversations
    const title = isNew
      ? message.trim().slice(0, 50) + (message.trim().length > 50 ? '...' : '')
      : conv!.title;

    // Create or update conversation
    conv = await prisma.botConversation.upsert({
      where: { chatId },
      create: {
        chatId,
        title,
        source: 'web',
        lastActiveAt: new Date(),
        claudeSessionId: conv?.claudeSessionId,
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
        content: message.trim(),
        status: 'done',
      },
    });

    // Create assistant message placeholder (pending)
    const assistantMsg = await prisma.botMessage.create({
      data: {
        conversationId: conv.id,
        role: 'assistant',
        status: 'pending',
        progress: '排队中...',
      },
    });

    // Fire-and-forget: start background processing
    startClaudeJob(assistantMsg.id, message.trim(), conv.claudeSessionId);

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
          select: { content: true, role: true },
        },
      },
    });

    const data = threads.map((t) => {
      const lastMsg = t.botMessages[0];
      return {
        id: t.id,
        chatId: t.chatId,
        title: t.title || '新对话',
        lastActiveAt: t.lastActiveAt,
        hasUnread: t.hasUnread,
        preview: lastMsg?.content?.slice(0, 50) || '',
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Failed to list chat threads:', error);
    return NextResponse.json({ success: false, error: 'Failed to list threads' }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat: convert POST /api/chat to async with background processing"
```

---

### Task 4: Create Poll API — GET /api/chat/poll/route.ts

**Files:**
- Create: `app/api/chat/poll/route.ts`

**Context:** Frontend polls this endpoint to get progress updates for pending messages and to check for new completed messages. Returns all BotMessages that changed since the `since` timestamp for a given thread (or globally for unread count).

**Step 1: Create app/api/chat/poll/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

// GET /api/chat/poll?threadId=xxx&since=ISO_DATE
export async function GET(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get('threadId');
    const since = searchParams.get('since');

    const sinceDate = since ? new Date(since) : new Date(Date.now() - 60000); // default: last 60s

    // Build query: messages updated since the given timestamp
    const where: any = {
      updatedAt: { gt: sinceDate },
      conversation: { source: 'web' },
    };

    if (threadId) {
      where.conversation = { ...where.conversation, chatId: threadId };
    }

    const updates = await prisma.botMessage.findMany({
      where,
      select: {
        id: true,
        role: true,
        content: true,
        status: true,
        progress: true,
        errorMessage: true,
        unread: true,
        updatedAt: true,
        conversationId: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Get global unread count (for red dot badge)
    const unreadCount = await prisma.botConversation.count({
      where: { source: 'web', hasUnread: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        updates: updates.map((m) => ({
          messageId: m.id,
          role: m.role,
          content: m.content,
          status: m.status,
          progress: m.progress,
          errorMessage: m.errorMessage,
          unread: m.unread,
          updatedAt: m.updatedAt,
        })),
        unreadCount,
      },
    });
  } catch (error) {
    console.error('Poll API error:', error);
    return NextResponse.json({ success: false, error: 'Failed to poll' }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add app/api/chat/poll/route.ts
git commit -m "feat: add /api/chat/poll endpoint for async message updates"
```

---

### Task 5: Create Unread and Read APIs

**Files:**
- Create: `app/api/chat/unread/route.ts`
- Create: `app/api/chat/read/route.ts`

**Context:** `/api/chat/unread` is a lightweight endpoint that only returns the unread thread count (for red dot badge when chat is closed). `/api/chat/read` marks all messages in a thread as read.

**Step 1: Create app/api/chat/unread/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

// GET /api/chat/unread — lightweight unread count for red dot badge
export async function GET(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  try {
    const count = await prisma.botConversation.count({
      where: { source: 'web', hasUnread: true },
    });

    return NextResponse.json({ success: true, data: { count } });
  } catch (error) {
    console.error('Unread API error:', error);
    return NextResponse.json({ success: false, error: 'Failed to get unread count' }, { status: 500 });
  }
}
```

**Step 2: Create app/api/chat/read/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

// POST /api/chat/read — mark thread messages as read
export async function POST(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  try {
    const body = await req.json();
    const { threadId } = body;

    if (!threadId) {
      return NextResponse.json({ success: false, error: 'threadId is required' }, { status: 400 });
    }

    const conv = await prisma.botConversation.findUnique({
      where: { chatId: threadId },
    });

    if (!conv || conv.source !== 'web') {
      return NextResponse.json({ success: false, error: 'Thread not found' }, { status: 404 });
    }

    // Mark all messages in this conversation as read
    await prisma.botMessage.updateMany({
      where: { conversationId: conv.id, unread: true },
      data: { unread: false },
    });

    // Clear the conversation hasUnread flag
    await prisma.botConversation.update({
      where: { id: conv.id },
      data: { hasUnread: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Read API error:', error);
    return NextResponse.json({ success: false, error: 'Failed to mark as read' }, { status: 500 });
  }
}
```

**Step 3: Commit**

```bash
git add app/api/chat/unread/route.ts app/api/chat/read/route.ts
git commit -m "feat: add /api/chat/unread and /api/chat/read endpoints"
```

---

### Task 6: Update GET /api/chat/[threadId] — Read from BotMessage table

**Files:**
- Modify: `app/api/chat/[threadId]/route.ts:9-58` (GET handler)

**Context:** Currently this endpoint reads messages from `BotConversation.messages` (the legacy Json field). We need to read from the `BotMessage` table instead, and also mark messages as read when the user opens the thread.

**Step 1: Update the GET handler**

Replace the GET function in `app/api/chat/[threadId]/route.ts`:

```typescript
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const token = req.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });
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
      return NextResponse.json({ success: false, error: 'Thread not found' }, { status: 404 });
    }

    // Mark messages as read on open
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
    return NextResponse.json({ success: false, error: 'Failed to fetch thread' }, { status: 500 });
  }
}
```

**Step 2: Also update DELETE handler** — cascade delete handles BotMessages automatically (via `onDelete: Cascade` in schema), so no change needed in the DELETE handler.

**Step 3: Commit**

```bash
git add app/api/chat/[threadId]/route.ts
git commit -m "feat: read from BotMessage table and mark as read on open"
```

---

### Task 7: Rewrite ChatBubble — Async send, polling, red dot Badge

**Files:**
- Modify: `components/ChatBubble.tsx` (full rewrite)

**Context:** This is the biggest change. The ChatBubble needs to:
1. Send messages without blocking (fire-and-forget POST)
2. Allow continuous sending while previous messages process
3. Poll for progress updates and completed messages
4. Show streaming progress per-message ("正在读取文件...")
5. Show red dot Badge on FAB when there are unread replies
6. Mark messages as read when thread is opened

**Step 1: Rewrite components/ChatBubble.tsx**

```tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
  Badge,
  Fade,
  Zoom,
  Divider,
  Button,
} from '@mui/material';
import {
  SmartToy as SmartToyIcon,
  Close as CloseIcon,
  Add as AddIcon,
  ArrowBack as ArrowBackIcon,
  Send as SendIcon,
  Delete as DeleteIcon,
  Refresh as RetryIcon,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { designTokens as dt } from '@/lib/theme';

interface Thread {
  id: string;
  chatId: string;
  title: string;
  lastActiveAt: string;
  hasUnread: boolean;
  preview: string;
}

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string | null;
  status?: string; // pending | processing | done | error
  progress?: string | null;
  errorMessage?: string | null;
}

const POLL_ACTIVE_MS = 3000;   // Poll every 3s when messages are processing
const POLL_IDLE_MS = 10000;    // Poll every 10s when idle (for unread badge)

export default function ChatBubble() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'threads' | 'chat'>('threads');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<{ chatId: string; title: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const lastPollTime = useRef<string>(new Date().toISOString());

  // Has any message currently processing?
  const hasPending = messages.some((m) => m.status === 'pending' || m.status === 'processing');

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load threads when panel opens on threads view
  useEffect(() => {
    if (open && view === 'threads') {
      loadThreads();
    }
  }, [open, view]);

  // Polling logic
  useEffect(() => {
    // Clear any existing poll
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = undefined;
    }

    if (open && view === 'chat' && activeThread) {
      // Active chat view: poll for message updates
      const interval = hasPending ? POLL_ACTIVE_MS : POLL_IDLE_MS;
      pollRef.current = setInterval(() => pollUpdates(), interval);
    } else if (!open) {
      // Chat closed: poll for unread count only
      pollRef.current = setInterval(() => pollUnread(), POLL_IDLE_MS);
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open, view, activeThread, hasPending]);

  // Initial unread check on mount
  useEffect(() => {
    pollUnread();
  }, []);

  async function pollUnread() {
    try {
      const res = await fetch('/api/chat/unread');
      const json = await res.json();
      if (json.success) {
        setUnreadCount(json.data.count);
      }
    } catch {
      // Silently ignore poll errors
    }
  }

  async function pollUpdates() {
    if (!activeThread) return;
    try {
      const res = await fetch(
        `/api/chat/poll?threadId=${activeThread.chatId}&since=${encodeURIComponent(lastPollTime.current)}`
      );
      const json = await res.json();
      if (!json.success) return;

      lastPollTime.current = new Date().toISOString();
      const updates: any[] = json.data.updates;
      setUnreadCount(json.data.unreadCount);

      if (updates.length === 0) return;

      setMessages((prev) => {
        const updated = [...prev];
        for (const u of updates) {
          const idx = updated.findIndex((m) => m.id === u.messageId);
          if (idx >= 0) {
            // Update existing message
            updated[idx] = {
              ...updated[idx],
              content: u.content ?? updated[idx].content,
              status: u.status,
              progress: u.progress,
              errorMessage: u.errorMessage,
            };
          }
          // New messages from poll (e.g., if sent from another tab) are ignored
          // since they'd be loaded on thread open
        }
        return updated;
      });
    } catch {
      // Silently ignore poll errors
    }
  }

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
    lastPollTime.current = new Date().toISOString();
    try {
      const res = await fetch(`/api/chat/${thread.chatId}`);
      const json = await res.json();
      if (json.success) {
        setMessages(json.data.messages || []);
        // Refresh unread count since we just read the thread
        pollUnread();
      }
    } catch (err) {
      console.error('Failed to load thread:', err);
    }
  }

  function startNewChat() {
    setActiveThread(null);
    setMessages([]);
    setView('chat');
    lastPollTime.current = new Date().toISOString();
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setSending(true);

    // Optimistically add user message
    const tempUserId = `temp-${Date.now()}`;
    const tempAssistantId = `temp-assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempUserId, role: 'user', content: text, status: 'done' },
      { id: tempAssistantId, role: 'assistant', content: null, status: 'pending', progress: '排队中...' },
    ]);

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
        // Update temp IDs with real IDs
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === tempUserId) return { ...m, id: json.data.userMessageId };
            if (m.id === tempAssistantId) return { ...m, id: json.data.messageId, status: 'processing', progress: '正在思考...' };
            return m;
          })
        );
        if (!activeThread) {
          setActiveThread({ chatId: json.data.threadId, title: json.data.title });
        }
      } else {
        // Replace assistant placeholder with error
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempAssistantId
              ? { ...m, status: 'error', errorMessage: json.error || '发送失败' }
              : m
          )
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempAssistantId
            ? { ...m, status: 'error', errorMessage: '网络错误，请检查连接后重试。' }
            : m
        )
      );
    } finally {
      setSending(false);
    }
  }

  async function retryMessage(errorMsgId: string) {
    // Find the user message that preceded the error
    const idx = messages.findIndex((m) => m.id === errorMsgId);
    if (idx <= 0) return;
    const userMsg = messages[idx - 1];
    if (userMsg.role !== 'user' || !userMsg.content) return;

    // Remove the error message
    setMessages((prev) => prev.filter((m) => m.id !== errorMsgId));

    // Re-send (setInput + trigger send)
    setInput(userMsg.content);
    // We need to also remove the user message so sendMessage re-adds it
    setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
    // Small delay to let state update then trigger send
    setTimeout(() => {
      const el = document.querySelector('[data-chat-send]') as HTMLButtonElement;
      el?.click();
    }, 100);
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

  function handleOpen() {
    setOpen(true);
    // Refresh unread
    pollUnread();
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

  // Render a single message bubble
  function renderMessage(msg: Message, index: number) {
    const isUser = msg.role === 'user';
    const isProcessing = msg.status === 'pending' || msg.status === 'processing';
    const isError = msg.status === 'error';

    return (
      <Box
        key={msg.id || index}
        sx={{
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
        }}
      >
        <Box
          sx={{
            maxWidth: '80%',
            px: 1.5,
            py: 1,
            borderRadius: 2,
            backgroundColor: isUser
              ? dt.accent.main
              : isError
                ? alpha(dt.danger.main, 0.08)
                : dt.bg.deep,
            color: isUser ? '#fff' : dt.text.primary,
            ...(isError && { border: `1px solid ${alpha(dt.danger.main, 0.2)}` }),
          }}
        >
          {isProcessing ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={14} />
              <Typography variant="caption" color="text.secondary">
                {msg.progress || '处理中...'}
              </Typography>
            </Box>
          ) : isError ? (
            <Box>
              <Typography variant="body2" color="error" sx={{ mb: 0.5 }}>
                {msg.errorMessage || '处理失败'}
              </Typography>
              <Button
                size="small"
                startIcon={<RetryIcon sx={{ fontSize: 14 }} />}
                onClick={() => msg.id && retryMessage(msg.id)}
                sx={{ fontSize: '0.75rem', py: 0 }}
              >
                重试
              </Button>
            </Box>
          ) : (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {msg.content || ''}
            </Typography>
          )}
        </Box>
      </Box>
    );
  }

  return (
    <>
      {/* Floating Action Button with Badge */}
      <Zoom in={!open}>
        <Badge
          badgeContent={unreadCount}
          color="error"
          invisible={unreadCount === 0}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1300,
            '& .MuiBadge-badge': {
              top: 6,
              right: 6,
              minWidth: 18,
              height: 18,
              fontSize: '0.7rem',
            },
          }}
        >
          <Fab
            onClick={handleOpen}
            sx={{
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
        </Badge>
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
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              {t.hasUnread && (
                                <Box
                                  sx={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    bgcolor: dt.danger.main,
                                    flexShrink: 0,
                                  }}
                                />
                              )}
                              <Typography variant="body2" fontWeight={600} noWrap>
                                {t.title}
                              </Typography>
                            </Box>
                          }
                          secondary={`${t.preview} · ${formatTime(t.lastActiveAt)}`}
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
                {messages.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                    有什么我可以帮你的？
                  </Typography>
                )}
                {messages.map((msg, i) => renderMessage(msg, i))}
                <div ref={messagesEndRef} />
              </Box>

              {/* Input — NOT disabled while processing (async!) */}
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
                  disabled={sending}
                  multiline
                  maxRows={3}
                />
                <IconButton
                  data-chat-send
                  onClick={sendMessage}
                  disabled={!input.trim() || sending}
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

**Key changes from old ChatBubble:**
- `loading` boolean replaced with per-message `status` tracking
- Input is NOT disabled while messages process (only while the POST is in flight via `sending`)
- Polling replaces synchronous await for responses
- MUI `Badge` wraps the FAB for unread count
- Each message bubble shows its own progress or error state
- Retry button on error messages
- Thread list shows red dot for unread threads

**Step 2: Commit**

```bash
git add components/ChatBubble.tsx
git commit -m "feat: rewrite ChatBubble for async chat with polling and red dot badge"
```

---

### Task 8: Manual Testing & Edge Case Fixes

**Files:**
- Potentially: `lib/claude-worker.ts`, `app/api/chat/route.ts`, `components/ChatBubble.tsx`

**Context:** After all pieces are in place, test the full flow end-to-end and fix any issues.

**Step 1: Restart the dev server** (required after Prisma generate)

Run:
```bash
# Stop the dev server if running, then restart
cd /Users/allenqiang/poamaster
npm run dev
```

The server should start on port 3030.

**Step 2: Test the happy path**

1. Open http://localhost:3030
2. Click the AI assistant FAB (bottom-right)
3. Click "新对话"
4. Type "你好" and press Enter
5. Verify: user message appears immediately, assistant shows "排队中..." then "正在思考..."
6. Verify: after a few seconds, the progress updates and eventually shows the full reply
7. Close the chat window
8. Send another message (open chat → new thread → send)
9. Close the window before the reply arrives
10. Verify: red dot Badge appears on the FAB when the reply is ready

**Step 3: Test continuous sending**

1. Open a chat thread
2. Send a message
3. While it's still processing, send another message
4. Verify: both messages process independently, replies arrive separately

**Step 4: Test error handling**

1. Send a very complex message that might hit max-turns
2. Verify: error message appears with retry button
3. Click retry → verify it re-sends

**Step 5: Test orphan detection**

1. Send a message, then stop the dev server while processing
2. Restart the server
3. Verify: the stuck message is marked as error with "处理被中断" message

**Step 6: Fix any issues found and commit**

```bash
git add -u
git commit -m "fix: address edge cases found during async chat testing"
```

---

## Summary of Files

| Action | File | Description |
|---|---|---|
| Modify | `prisma/schema.prisma` | Add BotMessage model, hasUnread to BotConversation |
| Create | `lib/claude-worker.ts` | Async Claude CLI worker with stream-json parsing |
| Modify | `app/api/chat/route.ts` | POST returns immediately, GET uses BotMessage |
| Create | `app/api/chat/poll/route.ts` | Polling endpoint for progress + unread |
| Create | `app/api/chat/unread/route.ts` | Lightweight unread count endpoint |
| Create | `app/api/chat/read/route.ts` | Mark thread as read |
| Modify | `app/api/chat/[threadId]/route.ts` | GET reads from BotMessage table |
| Modify | `components/ChatBubble.tsx` | Full rewrite: async send, polling, Badge |

## Dependency Order

```
Task 1 (Schema) → Task 2 (Worker) → Task 3 (POST API) → Task 4 (Poll API)
                                                        → Task 5 (Unread/Read APIs)
                                                        → Task 6 (Thread API)
                                   → Task 7 (ChatBubble frontend)
                                   → Task 8 (Testing)
```

Tasks 3-6 can be done in any order after Task 2. Task 7 depends on all API tasks (3-6). Task 8 is last.
