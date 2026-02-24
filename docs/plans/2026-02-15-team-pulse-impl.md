# Team Pulse (飞书对话→运营智能) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract operational signals from Feishu chat messages (risk, blockers, escalations, decisions, actions, sentiment), generate daily chat digests, and display a Team Pulse dashboard at `/feishu/pulse`.

**Architecture:** Hybrid processing — real-time keyword matching in the feishu-listener service for urgent signals (RISK/BLOCKER/ESCALATION) with immediate Feishu alerts, plus a daily scheduled LLM batch analysis for deeper signal extraction (DECISION/ACTION/SENTIMENT) and chat digests. All data exposed via Next.js API routes and displayed in a MUI dashboard.

**Tech Stack:** Next.js 16+ App Router, Prisma ORM, PostgreSQL, MUI 7, Recharts, OpenAI GPT (via `lib/openai.ts`), Feishu Bot API (via `lib/feishu.ts`), node-cron scheduler.

**Design doc:** `docs/plans/2026-02-15-team-pulse-design.md`

---

### Task 1: Add Prisma Models

Add three new models to the schema and create a migration.

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add models to schema**

Add the following after the `FeishuMessage` model (around line 540) in `prisma/schema.prisma`:

```prisma
// ==================== Team Pulse (运营智能) ====================

// 运营信号 — 从飞书消息中提取的结构化信号
model ChatSignal {
  id          String    @id @default(cuid())
  chatId      String
  signalType  String                      // RISK / BLOCKER / ESCALATION / DECISION / ACTION / SENTIMENT
  severity    String    @default("MEDIUM") // LOW / MEDIUM / HIGH / CRITICAL
  title       String
  summary     String    @db.Text
  messageIds  String[]                    // 关联的 FeishuMessage.messageId
  relatedUser String?                     // 相关责任人名称
  isResolved  Boolean   @default(false)
  resolvedAt  DateTime?
  source      String    @default("batch") // realtime / batch
  detectedAt  DateTime  @default(now())
  createdAt   DateTime  @default(now())

  chat        FeishuChat @relation(fields: [chatId], references: [chatId])

  @@index([chatId])
  @@index([signalType])
  @@index([detectedAt])
  @@index([isResolved])
}

// 群聊每日摘要 — LLM 生成的每日群聊总结
model ChatDigest {
  id           String   @id @default(cuid())
  chatId       String
  date         DateTime @db.Date
  summary      String   @db.Text
  keyTopics    String[]
  messageCount Int
  activeUsers  String[]
  signalCount  Json?                      // { RISK: 1, ACTION: 2, ... }
  createdAt    DateTime @default(now())

  chat         FeishuChat @relation(fields: [chatId], references: [chatId])

  @@unique([chatId, date])
  @@index([date])
}

// 团队脉搏 — 按天聚合的群聊活跃度/情绪
model TeamPulse {
  id              String   @id @default(cuid())
  chatId          String
  date            DateTime @db.Date
  messageCount    Int      @default(0)
  activeUserCount Int      @default(0)
  sentimentScore  Float?                  // -1.0 to 1.0
  avgResponseTime Float?                  // 平均回复间隔（分钟）
  peakHour        Int?                    // 消息最多的小时 (0-23)
  createdAt       DateTime @default(now())

  chat            FeishuChat @relation(fields: [chatId], references: [chatId])

  @@unique([chatId, date])
  @@index([date])
}
```

Also add the reverse relations to `FeishuChat`. Find the line `messages FeishuMessage[]` inside `model FeishuChat` and add after it:

```prisma
  signals       ChatSignal[]
  digests       ChatDigest[]
  pulses        TeamPulse[]
```

**Step 2: Create and apply migration**

Run:
```bash
cd /Users/allenqiang/poamaster
npx prisma migrate dev --name add_team_pulse_models
```

Expected: Migration created and applied. Three new tables: `ChatSignal`, `ChatDigest`, `TeamPulse`.

**Step 3: Regenerate Prisma client for feishu-listener**

Run:
```bash
cd /Users/allenqiang/poamaster/services/feishu-listener
npx prisma generate --schema ../../prisma/schema.prisma
```

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(team-pulse): add ChatSignal, ChatDigest, TeamPulse models"
```

---

### Task 2: Real-time Signal Detector in Feishu Listener

Create a keyword-based signal detector that runs on every incoming message in the feishu-listener service.

**Files:**
- Create: `services/feishu-listener/src/signal-detector.ts`
- Modify: `services/feishu-listener/src/message-handler.ts` (hook after message save, ~line 148)

**Step 1: Create signal-detector.ts**

```typescript
/**
 * Real-time signal detector — scans each incoming Feishu message
 * for keyword patterns that indicate operational signals (RISK,
 * BLOCKER, ESCALATION). Matches create ChatSignal records and
 * trigger Feishu notifications for HIGH+ severity.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';
import { sendCookieExpiryAlert } from './notifier.js';

let prisma: PrismaClient;

export function initSignalDetector(prismaClient: PrismaClient) {
  prisma = prismaClient;
}

interface SignalRule {
  patterns: string[];
  type: string;
  severity: string;
}

const RULES: SignalRule[] = [
  // RISK — 项目/业务风险
  { patterns: ['CRITICAL', '严重', '崩溃', '宕机', '故障', '事故'], type: 'RISK', severity: 'CRITICAL' },
  { patterns: ['报警', '异常', '风险', '警告', '告警'], type: 'RISK', severity: 'HIGH' },
  // BLOCKER — 进度阻塞
  { patterns: ['延期', '卡住', '阻塞', '等待审批', '搞不定', '无法推进'], type: 'BLOCKER', severity: 'MEDIUM' },
  // ESCALATION — 需上级关注
  { patterns: ['紧急', '急需', '尽快处理', '升级处理'], type: 'ESCALATION', severity: 'HIGH' },
];

interface MessageInfo {
  messageId: string;
  chatId: string;
  senderName: string;
  content: string;
  chatType: string;
}

/**
 * Detect signals in a message. Called after message is saved to DB.
 * Only processes text/post messages from group chats.
 */
export async function detectSignals(msg: MessageInfo): Promise<void> {
  if (!prisma) return;
  // Only scan group chats with text content
  if (msg.chatType !== 'group' || !msg.content) return;

  const contentLower = msg.content.toLowerCase();

  for (const rule of RULES) {
    const matched = rule.patterns.some(p => contentLower.includes(p.toLowerCase()));
    if (!matched) continue;

    // Find the first matching pattern for the title
    const matchedPattern = rule.patterns.find(p => contentLower.includes(p.toLowerCase())) || '';
    const preview = msg.content.length > 80 ? msg.content.substring(0, 80) + '...' : msg.content;

    try {
      await prisma.chatSignal.create({
        data: {
          chatId: msg.chatId,
          signalType: rule.type,
          severity: rule.severity,
          title: `[${matchedPattern}] ${msg.senderName}`,
          summary: preview,
          messageIds: [msg.messageId],
          relatedUser: msg.senderName,
          source: 'realtime',
        },
      });

      logger.info(`[Signal] ${rule.type}/${rule.severity} detected in ${msg.chatId}: ${matchedPattern}`);

      // Notify COO for HIGH+ severity
      if (rule.severity === 'HIGH' || rule.severity === 'CRITICAL') {
        await sendSignalAlert(rule.type, rule.severity, msg.senderName, preview, msg.chatId);
      }
    } catch (err: any) {
      logger.error(`[Signal] Failed to create signal: ${err.message}`);
    }

    // Only create one signal per message (highest severity wins since rules are ordered)
    break;
  }
}

/** Send signal alert to COO via Feishu bot */
async function sendSignalAlert(
  type: string, severity: string, sender: string, preview: string, chatId: string
): Promise<void> {
  try {
    const chat = await prisma.feishuChat.findUnique({ where: { chatId }, select: { name: true } });
    const chatName = chat?.name || chatId;
    const icon = severity === 'CRITICAL' ? '🔴' : '🟡';
    const text = `${icon} 运营信号 [${type}/${severity}]\n\n群聊: ${chatName}\n发送人: ${sender}\n内容: ${preview}\n\n时间: ${new Date().toLocaleString('zh-CN')}`;

    // Reuse the same bot API as notifier.ts
    const appIdRaw = await prisma.config.findUnique({ where: { key: 'feishu.appId' } });
    const appSecretRaw = await prisma.config.findUnique({ where: { key: 'feishu.appSecret' } });
    const chatIdRaw = await prisma.config.findUnique({ where: { key: 'feishu.chatId' } });

    const appId = appIdRaw?.value || '';
    const appSecret = appSecretRaw?.value || '';
    const targetChatId = chatIdRaw?.value || '';

    if (!appId || !appSecret || !targetChatId) return;

    // Decrypt appSecret (same pattern as notifier.ts)
    const { createDecipheriv } = await import('crypto');
    const secret = process.env.SESSION_SECRET;
    let decryptedSecret = appSecret;
    if (secret && appSecret.split(':').length === 3) {
      const key = Buffer.from(secret.padEnd(32, '0').slice(0, 32));
      const [ivH, tagH, enc] = appSecret.split(':');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivH, 'hex'));
      decipher.setAuthTag(Buffer.from(tagH, 'hex'));
      decryptedSecret = decipher.update(enc, 'hex', 'utf8') + decipher.final('utf8');
    }

    const BASE = 'https://open.feishu.cn/open-apis';
    const tokenResp = await fetch(`${BASE}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: decryptedSecret }),
    });
    const tokenData = (await tokenResp.json()) as any;
    if (tokenData.code !== 0) return;

    await fetch(`${BASE}/im/v1/messages?receive_id_type=chat_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenData.tenant_access_token}`,
      },
      body: JSON.stringify({
        receive_id: targetChatId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      }),
    });

    logger.info(`[Signal] Alert sent to Feishu for ${type}/${severity}`);
  } catch (err: any) {
    logger.error(`[Signal] Failed to send alert: ${err.message}`);
  }
}
```

**Step 2: Hook into message-handler.ts**

In `services/feishu-listener/src/message-handler.ts`, add import at the top (after existing imports):

```typescript
import { detectSignals } from './signal-detector.js';
```

Then, after the `messageCount++` line (~line 148), and before the `logger.info(...)` line, add:

```typescript
    // Detect real-time operational signals
    detectSignals({
      messageId: msg.messageId,
      chatId: msg.chatId,
      senderName: displayName,
      content: msg.content,
      chatType: msg.chatType,
    });
```

Note: `detectSignals` is called without `await` — fire-and-forget so it doesn't block message processing.

**Step 3: Initialize detector in index.ts**

In `services/feishu-listener/src/index.ts`, add after the `initNotifier(prisma)` call:

```typescript
import { initSignalDetector } from './signal-detector.js';
// ... after initNotifier(prisma):
initSignalDetector(prisma);
```

**Step 4: Commit**

```bash
git add services/feishu-listener/src/signal-detector.ts services/feishu-listener/src/message-handler.ts services/feishu-listener/src/index.ts
git commit -m "feat(team-pulse): add real-time signal detector to feishu-listener"
```

---

### Task 3: Batch Chat Analyzer (LLM Analysis)

Create the batch analysis module that runs daily to analyze chat messages with LLM, generate digests, extract signals, and compute team pulse metrics.

**Files:**
- Create: `lib/team-pulse/chat-analyzer.ts`

**Step 1: Create chat-analyzer.ts**

```typescript
/**
 * Batch Chat Analyzer — runs daily to:
 * 1. Aggregate messages per chat for the last 24 hours
 * 2. Send to LLM for deep analysis (digests + signals)
 * 3. Compute TeamPulse metrics (activity, sentiment)
 * 4. Store results in ChatDigest, ChatSignal, TeamPulse
 */

import { PrismaClient } from '@prisma/client';
import { getOpenAIClient } from '@/lib/openai';

const prisma = new PrismaClient();

interface AnalysisResult {
  summary: string;
  keyTopics: string[];
  signals: Array<{
    type: 'DECISION' | 'ACTION' | 'SENTIMENT';
    title: string;
    summary: string;
    relatedUser?: string;
    severity: string;
  }>;
  sentimentScore: number; // -1 to 1
}

/**
 * Run the full daily analysis pipeline.
 * Called by the scheduler at 8:30 AM.
 */
export async function runDailyAnalysis(): Promise<{
  chatsAnalyzed: number;
  signalsCreated: number;
}> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Get all active (non-blacklisted) group chats
  const chats = await prisma.feishuChat.findMany({
    where: { isBlacklisted: false, chatType: 'group' },
    select: { chatId: true, name: true },
  });

  let chatsAnalyzed = 0;
  let signalsCreated = 0;

  for (const chat of chats) {
    // 2. Get messages from last 24h
    const messages = await prisma.feishuMessage.findMany({
      where: {
        chatId: chat.chatId,
        timestamp: { gte: since },
        msgType: { in: ['text', 'post'] },
        content: { not: '' },
      },
      orderBy: { timestamp: 'asc' },
      select: { messageId: true, senderName: true, content: true, timestamp: true },
    });

    // Skip chats with too few messages
    if (messages.length < 3) continue;

    try {
      // 3. LLM analysis
      const analysis = await analyzeChat(chat.name || chat.chatId, messages);

      // 4. Store ChatDigest (upsert for idempotency)
      await prisma.chatDigest.upsert({
        where: { chatId_date: { chatId: chat.chatId, date: today } },
        create: {
          chatId: chat.chatId,
          date: today,
          summary: analysis.summary,
          keyTopics: analysis.keyTopics,
          messageCount: messages.length,
          activeUsers: [...new Set(messages.map(m => m.senderName))],
          signalCount: countSignalsByType(analysis.signals),
        },
        update: {
          summary: analysis.summary,
          keyTopics: analysis.keyTopics,
          messageCount: messages.length,
          activeUsers: [...new Set(messages.map(m => m.senderName))],
          signalCount: countSignalsByType(analysis.signals),
        },
      });

      // 5. Store ChatSignals from LLM analysis
      for (const signal of analysis.signals) {
        await prisma.chatSignal.create({
          data: {
            chatId: chat.chatId,
            signalType: signal.type,
            severity: signal.severity,
            title: signal.title,
            summary: signal.summary,
            messageIds: [],
            relatedUser: signal.relatedUser || null,
            source: 'batch',
          },
        });
        signalsCreated++;
      }

      // 6. Compute and store TeamPulse metrics
      await computeTeamPulse(chat.chatId, today, messages, analysis.sentimentScore);

      chatsAnalyzed++;
    } catch (err: any) {
      console.error(`[TeamPulse] Failed to analyze chat ${chat.name}: ${err.message}`);
    }
  }

  await prisma.$disconnect();
  return { chatsAnalyzed, signalsCreated };
}

/** Send messages to LLM for deep analysis */
async function analyzeChat(
  chatName: string,
  messages: Array<{ senderName: string; content: string; timestamp: Date }>
): Promise<AnalysisResult> {
  const openai = await getOpenAIClient();

  // Format messages for LLM (limit to ~4000 chars to control cost)
  const formatted = messages.map(m => {
    const time = m.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const text = m.content.length > 200 ? m.content.substring(0, 200) + '...' : m.content;
    return `[${time}] ${m.senderName}: ${text}`;
  });

  // Truncate if too long
  let transcript = formatted.join('\n');
  if (transcript.length > 4000) {
    transcript = transcript.substring(0, 4000) + '\n... (truncated)';
  }

  const systemPrompt = `你是一个运营分析助手。分析工作群聊对话，提取运营信号。

请以JSON格式返回分析结果：
{
  "summary": "3-5句话总结今天的主要讨论内容",
  "keyTopics": ["话题1", "话题2"],
  "signals": [
    {
      "type": "DECISION|ACTION|SENTIMENT",
      "title": "简短标题",
      "summary": "具体描述",
      "relatedUser": "相关人员（可选）",
      "severity": "LOW|MEDIUM|HIGH"
    }
  ],
  "sentimentScore": 0.0
}

信号类型说明：
- DECISION: 群里做出的决策或确认的方案
- ACTION: 需要跟进的待办事项
- SENTIMENT: 从对话语气感受到的团队情绪（正面/负面/压力）

sentimentScore: -1.0（非常负面）到 1.0（非常正面），0为中性

注意：
- 只提取有实际内容的信号，不要凭空编造
- 如果没有某类信号，signals数组中就不包含该类型
- 关注实际的运营价值，忽略闲聊`;

  const userPrompt = `群聊名称: ${chatName}\n对话记录（过去24小时）:\n\n${transcript}`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_completion_tokens: 1000,
    });

    const content = resp.choices[0]?.message?.content;
    if (!content) throw new Error('Empty LLM response');

    const parsed = JSON.parse(content);
    return {
      summary: parsed.summary || '',
      keyTopics: parsed.keyTopics || [],
      signals: (parsed.signals || []).map((s: any) => ({
        type: s.type || 'ACTION',
        title: s.title || '',
        summary: s.summary || '',
        relatedUser: s.relatedUser || undefined,
        severity: s.severity || 'MEDIUM',
      })),
      sentimentScore: typeof parsed.sentimentScore === 'number'
        ? Math.max(-1, Math.min(1, parsed.sentimentScore))
        : 0,
    };
  } catch (err: any) {
    console.error(`[TeamPulse] LLM analysis failed: ${err.message}`);
    // Fallback: no signals, neutral sentiment
    return {
      summary: `${chatName} 今日共 ${messages.length} 条消息。`,
      keyTopics: [],
      signals: [],
      sentimentScore: 0,
    };
  }
}

/** Compute and store TeamPulse metrics (no LLM needed) */
async function computeTeamPulse(
  chatId: string,
  date: Date,
  messages: Array<{ senderName: string; timestamp: Date }>,
  sentimentScore: number,
): Promise<void> {
  const uniqueUsers = new Set(messages.map(m => m.senderName));

  // Calculate peak hour
  const hourCounts = new Array(24).fill(0);
  for (const m of messages) {
    hourCounts[m.timestamp.getHours()]++;
  }
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

  // Calculate average response time (minutes between consecutive messages)
  let totalGap = 0;
  let gapCount = 0;
  for (let i = 1; i < messages.length; i++) {
    const gap = (messages[i].timestamp.getTime() - messages[i - 1].timestamp.getTime()) / 60000;
    if (gap < 120) { // Only count gaps under 2 hours (filter out overnight)
      totalGap += gap;
      gapCount++;
    }
  }
  const avgResponseTime = gapCount > 0 ? Math.round(totalGap / gapCount * 10) / 10 : null;

  await prisma.teamPulse.upsert({
    where: { chatId_date: { chatId, date } },
    create: {
      chatId,
      date,
      messageCount: messages.length,
      activeUserCount: uniqueUsers.size,
      sentimentScore,
      avgResponseTime,
      peakHour,
    },
    update: {
      messageCount: messages.length,
      activeUserCount: uniqueUsers.size,
      sentimentScore,
      avgResponseTime,
      peakHour,
    },
  });
}

function countSignalsByType(signals: AnalysisResult['signals']): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of signals) {
    counts[s.type] = (counts[s.type] || 0) + 1;
  }
  return counts;
}
```

**Step 2: Commit**

```bash
git add lib/team-pulse/chat-analyzer.ts
git commit -m "feat(team-pulse): add batch chat analyzer with LLM analysis"
```

---

### Task 4: API Routes — Signals

Create API routes for fetching and managing operational signals.

**Files:**
- Create: `app/api/team-pulse/signals/route.ts`
- Create: `app/api/team-pulse/signals/[id]/resolve/route.ts`

**Step 1: Create signals list route**

`app/api/team-pulse/signals/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifySession } from '@/lib/auth';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const session = await verifySession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const type = url.searchParams.get('type'); // filter by signal type
  const resolved = url.searchParams.get('resolved'); // 'true' | 'false'
  const days = parseInt(url.searchParams.get('days') || '7');

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where: any = { detectedAt: { gte: since } };
  if (type) where.signalType = type;
  if (resolved === 'true') where.isResolved = true;
  if (resolved === 'false') where.isResolved = false;

  const signals = await prisma.chatSignal.findMany({
    where,
    orderBy: { detectedAt: 'desc' },
    include: { chat: { select: { name: true, chatType: true } } },
    take: 100,
  });

  // Summary counts
  const counts = await prisma.chatSignal.groupBy({
    by: ['signalType'],
    where: { detectedAt: { gte: since }, isResolved: false },
    _count: true,
  });

  return NextResponse.json({
    signals,
    unresolvedCounts: Object.fromEntries(counts.map(c => [c.signalType, c._count])),
  });
}
```

**Step 2: Create resolve signal route**

`app/api/team-pulse/signals/[id]/resolve/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifySession } from '@/lib/auth';

const prisma = new PrismaClient();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const signal = await prisma.chatSignal.update({
    where: { id },
    data: { isResolved: true, resolvedAt: new Date() },
  });

  return NextResponse.json({ success: true, signal });
}
```

**Step 3: Commit**

```bash
git add app/api/team-pulse/
git commit -m "feat(team-pulse): add signals API routes"
```

---

### Task 5: API Routes — Digests & Pulse Data

Create API routes for chat digests and team pulse overview data.

**Files:**
- Create: `app/api/team-pulse/digests/route.ts`
- Create: `app/api/team-pulse/overview/route.ts`
- Create: `app/api/team-pulse/analyze/route.ts`

**Step 1: Create digests route**

`app/api/team-pulse/digests/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifySession } from '@/lib/auth';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const session = await verifySession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const dateStr = url.searchParams.get('date');
  const chatId = url.searchParams.get('chatId');

  // Default to today
  const date = dateStr ? new Date(dateStr) : new Date();
  date.setHours(0, 0, 0, 0);

  const where: any = { date };
  if (chatId) where.chatId = chatId;

  const digests = await prisma.chatDigest.findMany({
    where,
    include: { chat: { select: { name: true, chatType: true } } },
    orderBy: { messageCount: 'desc' },
  });

  return NextResponse.json({ digests });
}
```

**Step 2: Create overview route**

`app/api/team-pulse/overview/route.ts` — aggregated data for the dashboard:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifySession } from '@/lib/auth';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const session = await verifySession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get('days') || '7');
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Chat health cards (latest pulse per chat)
  const pulses = await prisma.teamPulse.findMany({
    where: { date: { gte: since } },
    include: { chat: { select: { name: true, chatId: true } } },
    orderBy: { date: 'desc' },
  });

  // Group by chatId, latest first
  const chatMap = new Map<string, any[]>();
  for (const p of pulses) {
    const arr = chatMap.get(p.chatId) || [];
    arr.push(p);
    chatMap.set(p.chatId, arr);
  }

  const chatHealth = Array.from(chatMap.entries()).map(([chatId, records]) => {
    const latest = records[0];
    const totalMessages = records.reduce((sum, r) => sum + r.messageCount, 0);
    const avgSentiment = records.filter(r => r.sentimentScore !== null).length > 0
      ? records.reduce((sum, r) => sum + (r.sentimentScore || 0), 0) / records.filter(r => r.sentimentScore !== null).length
      : null;
    return {
      chatId,
      chatName: latest.chat.name || chatId,
      totalMessages,
      avgSentiment: avgSentiment !== null ? Math.round(avgSentiment * 100) / 100 : null,
      latestDate: latest.date,
      trend: records.map(r => ({
        date: r.date,
        messages: r.messageCount,
        sentiment: r.sentimentScore,
      })),
    };
  });

  // Unresolved signal counts
  const unresolvedSignals = await prisma.chatSignal.count({
    where: { isResolved: false, detectedAt: { gte: since } },
  });

  // Trend data (daily totals)
  const dailyPulses = await prisma.teamPulse.groupBy({
    by: ['date'],
    where: { date: { gte: since } },
    _sum: { messageCount: true, activeUserCount: true },
    _avg: { sentimentScore: true },
    orderBy: { date: 'asc' },
  });

  const trend = dailyPulses.map(d => ({
    date: d.date,
    messages: d._sum.messageCount || 0,
    activeUsers: d._sum.activeUserCount || 0,
    sentiment: d._avg.sentimentScore !== null ? Math.round(d._avg.sentimentScore! * 100) / 100 : null,
  }));

  return NextResponse.json({
    chatHealth: chatHealth.sort((a, b) => b.totalMessages - a.totalMessages),
    unresolvedSignals,
    trend,
  });
}
```

**Step 3: Create analyze trigger route**

`app/api/team-pulse/analyze/route.ts` — manually trigger batch analysis:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await verifySession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { runDailyAnalysis } = await import('@/lib/team-pulse/chat-analyzer');
  const result = await runDailyAnalysis();

  return NextResponse.json({
    success: true,
    chatsAnalyzed: result.chatsAnalyzed,
    signalsCreated: result.signalsCreated,
  });
}
```

**Step 4: Commit**

```bash
git add app/api/team-pulse/
git commit -m "feat(team-pulse): add digests, overview, and analyze API routes"
```

---

### Task 6: Register Daily Analysis in Scheduler

Add the daily team pulse analysis job to the main app scheduler.

**Files:**
- Modify: `services/scheduler.ts`

**Step 1: Add team pulse job**

In `services/scheduler.ts`, add after the existing cron job registrations:

```typescript
// Team Pulse — daily chat analysis at 8:30 AM
cron.schedule('30 8 * * *', async () => {
  console.log('[Scheduler] Running daily team pulse analysis...');
  try {
    const { runDailyAnalysis } = await import('@/lib/team-pulse/chat-analyzer');
    const result = await runDailyAnalysis();
    console.log(`[Scheduler] Team pulse complete: ${result.chatsAnalyzed} chats, ${result.signalsCreated} signals`);

    // Send daily pulse summary to Feishu
    try {
      const { sendFeishuTextMessage } = await import('@/lib/feishu');
      const msg = `📊 每日团队脉搏\n\n分析群聊: ${result.chatsAnalyzed} 个\n发现信号: ${result.signalsCreated} 条\n\n查看详情: /feishu/pulse`;
      await sendFeishuTextMessage(msg);
    } catch (e: any) {
      console.error('[Scheduler] Failed to send pulse to Feishu:', e.message);
    }
  } catch (error: any) {
    console.error('[Scheduler] Team pulse analysis failed:', error.message);
  }
}, { timezone: 'Asia/Shanghai' });
```

**Step 2: Commit**

```bash
git add services/scheduler.ts
git commit -m "feat(team-pulse): register daily analysis job in scheduler"
```

---

### Task 7: Team Pulse Dashboard UI

Create the main dashboard page at `/feishu/pulse`.

**Files:**
- Create: `app/feishu/pulse/page.tsx`

**Step 1: Create the page**

`app/feishu/pulse/page.tsx`:

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Chip, Button,
  CircularProgress, Alert, IconButton, ToggleButtonGroup, ToggleButton,
  Divider, Stack, Tooltip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CheckCircle as ResolvedIcon,
  Warning as RiskIcon,
  Block as BlockerIcon,
  NotificationsActive as EscalationIcon,
  Lightbulb as DecisionIcon,
  Assignment as ActionIcon,
  Mood as SentimentIcon,
  TrendingUp as TrendIcon,
} from '@mui/icons-material';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as ReTooltip, Legend,
  BarChart, Bar,
} from 'recharts';
import { designTokens as dt } from '@/lib/theme';

interface Signal {
  id: string;
  chatId: string;
  signalType: string;
  severity: string;
  title: string;
  summary: string;
  relatedUser: string | null;
  isResolved: boolean;
  source: string;
  detectedAt: string;
  chat: { name: string | null };
}

interface ChatHealth {
  chatId: string;
  chatName: string;
  totalMessages: number;
  avgSentiment: number | null;
  trend: Array<{ date: string; messages: number; sentiment: number | null }>;
}

interface Digest {
  id: string;
  chatId: string;
  summary: string;
  keyTopics: string[];
  messageCount: number;
  activeUsers: string[];
  chat: { name: string | null };
}

interface TrendPoint {
  date: string;
  messages: number;
  activeUsers: number;
  sentiment: number | null;
}

const SIGNAL_ICONS: Record<string, React.ReactNode> = {
  RISK: <RiskIcon fontSize="small" sx={{ color: dt.danger.main }} />,
  BLOCKER: <BlockerIcon fontSize="small" sx={{ color: dt.warning.main }} />,
  ESCALATION: <EscalationIcon fontSize="small" sx={{ color: dt.purple.main }} />,
  DECISION: <DecisionIcon fontSize="small" sx={{ color: dt.accent.main }} />,
  ACTION: <ActionIcon fontSize="small" sx={{ color: dt.teal.main }} />,
  SENTIMENT: <SentimentIcon fontSize="small" sx={{ color: dt.success.main }} />,
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: dt.danger.main,
  HIGH: dt.warning.main,
  MEDIUM: dt.accent.main,
  LOW: dt.text.muted,
};

export default function TeamPulsePage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [chatHealth, setChatHealth] = useState<ChatHealth[]>([]);
  const [digests, setDigests] = useState<Digest[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [signalFilter, setSignalFilter] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sigRes, ovRes, dgRes] = await Promise.all([
        fetch(`/api/team-pulse/signals?days=7&resolved=${showResolved}${signalFilter ? `&type=${signalFilter}` : ''}`, { credentials: 'include' }),
        fetch('/api/team-pulse/overview?days=7', { credentials: 'include' }),
        fetch('/api/team-pulse/digests', { credentials: 'include' }),
      ]);

      const sigData = await sigRes.json();
      const ovData = await ovRes.json();
      const dgData = await dgRes.json();

      setSignals(sigData.signals || []);
      setUnresolvedCount(
        Object.values(sigData.unresolvedCounts || {}).reduce((a: number, b: any) => a + b, 0) as number
      );
      setChatHealth(ovData.chatHealth || []);
      setTrend(ovData.trend || []);
      setDigests(dgData.digests || []);
    } catch {
      setError('加载数据失败');
    } finally {
      setLoading(false);
    }
  }, [signalFilter, showResolved]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleResolve = async (id: string) => {
    try {
      await fetch(`/api/team-pulse/signals/${id}/resolve`, {
        method: 'POST', credentials: 'include',
      });
      loadData();
    } catch { /* ignore */ }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/team-pulse/analyze', {
        method: 'POST', credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        loadData();
      }
    } catch {
      setError('分析失败');
    } finally {
      setAnalyzing(false);
    }
  };

  const sentimentLabel = (score: number | null) => {
    if (score === null) return { text: '-', color: dt.text.muted };
    if (score >= 0.3) return { text: '😊', color: dt.success.main };
    if (score >= -0.1) return { text: '😐', color: dt.warning.main };
    return { text: '😟', color: dt.danger.main };
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}小时前`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const selectedDigest = selectedChat
    ? digests.find(d => d.chatId === selectedChat)
    : null;

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4">团队脉搏</Typography>
          <Typography variant="body2" color="text.secondary">
            从飞书群聊中提取的运营信号和团队动态
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            onClick={handleAnalyze}
            disabled={analyzing}
            startIcon={analyzing ? <CircularProgress size={16} color="inherit" /> : <TrendIcon />}
          >
            {analyzing ? '分析中...' : '立即分析'}
          </Button>
          <IconButton onClick={loadData}><RefreshIcon /></IconButton>
        </Stack>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4" color="error">{unresolvedCount}</Typography>
              <Typography variant="caption" color="text.secondary">未处理信号</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4">{chatHealth.length}</Typography>
              <Typography variant="caption" color="text.secondary">活跃群聊</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4">
                {chatHealth.reduce((s, c) => s + c.totalMessages, 0)}
              </Typography>
              <Typography variant="caption" color="text.secondary">7天消息总量</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4">{digests.length}</Typography>
              <Typography variant="caption" color="text.secondary">今日摘要</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Left Column: Signal Feed */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">信号流</Typography>
                <Button
                  size="small"
                  variant={showResolved ? 'contained' : 'outlined'}
                  onClick={() => setShowResolved(!showResolved)}
                >
                  {showResolved ? '已处理' : '未处理'}
                </Button>
              </Box>

              <ToggleButtonGroup
                value={signalFilter}
                exclusive
                onChange={(_, v) => setSignalFilter(v)}
                size="small"
                sx={{ mb: 2, flexWrap: 'wrap' }}
              >
                <ToggleButton value={null as any}>全部</ToggleButton>
                <ToggleButton value="RISK">风险</ToggleButton>
                <ToggleButton value="BLOCKER">阻塞</ToggleButton>
                <ToggleButton value="ESCALATION">升级</ToggleButton>
                <ToggleButton value="DECISION">决策</ToggleButton>
                <ToggleButton value="ACTION">待办</ToggleButton>
              </ToggleButtonGroup>

              {signals.length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  暂无信号
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {signals.map(sig => (
                    <Card key={sig.id} variant="outlined" sx={{
                      borderLeft: `3px solid ${SEVERITY_COLORS[sig.severity] || dt.text.muted}`,
                    }}>
                      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          {SIGNAL_ICONS[sig.signalType]}
                          <Typography variant="subtitle2" sx={{ flex: 1 }}>{sig.title}</Typography>
                          {!sig.isResolved && (
                            <Tooltip title="标记已处理">
                              <IconButton size="small" onClick={() => handleResolve(sig.id)}>
                                <ResolvedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                          {sig.summary}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                          <Chip label={sig.chat.name || '未命名'} size="small" variant="outlined" />
                          <Chip label={sig.source === 'realtime' ? '实时' : '批量'} size="small"
                            color={sig.source === 'realtime' ? 'warning' : 'default'} variant="outlined" />
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(sig.detectedAt)}
                          </Typography>
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Right Column: Chat Health + Trend */}
        <Grid size={{ xs: 12, md: 7 }}>
          {/* Chat Health Cards */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>群聊健康度</Typography>
              <Grid container spacing={1.5}>
                {chatHealth.map(ch => {
                  const sent = sentimentLabel(ch.avgSentiment);
                  return (
                    <Grid key={ch.chatId} size={{ xs: 6, sm: 4, md: 3 }}>
                      <Card
                        variant="outlined"
                        sx={{
                          cursor: 'pointer',
                          bgcolor: selectedChat === ch.chatId ? `${dt.accent.main}10` : undefined,
                          '&:hover': { bgcolor: `${dt.accent.main}08` },
                        }}
                        onClick={() => setSelectedChat(
                          selectedChat === ch.chatId ? null : ch.chatId
                        )}
                      >
                        <CardContent sx={{ py: 1.5, textAlign: 'center', '&:last-child': { pb: 1.5 } }}>
                          <Typography variant="subtitle2" noWrap>{ch.chatName}</Typography>
                          <Typography variant="h6">{ch.totalMessages}</Typography>
                          <Typography variant="caption" color="text.secondary">条消息</Typography>
                          <Typography variant="body1" sx={{ color: sent.color }}>
                            {sent.text} {ch.avgSentiment !== null ? (ch.avgSentiment > 0 ? '+' : '') + ch.avgSentiment : ''}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
                {chatHealth.length === 0 && (
                  <Grid size={12}>
                    <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                      暂无数据，点击"立即分析"开始
                    </Typography>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>

          {/* Trend Chart */}
          {trend.length > 0 && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>7天趋势</Typography>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={trend.map(t => ({
                    ...t,
                    date: new Date(t.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
                  }))}>
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="right" orientation="right" domain={[-1, 1]} tick={{ fontSize: 12 }} />
                    <ReTooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="messages" stroke={dt.accent.main} name="消息数" strokeWidth={2} />
                    <Line yAxisId="right" type="monotone" dataKey="sentiment" stroke={dt.success.main} name="情绪" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Selected Chat Digest */}
          {selectedDigest && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  今日摘要 — {selectedDigest.chat.name || '未命名'}
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {selectedDigest.summary}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                  {selectedDigest.keyTopics.map(t => (
                    <Chip key={t} label={`#${t}`} size="small" color="primary" variant="outlined" />
                  ))}
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {selectedDigest.messageCount} 条消息 · {selectedDigest.activeUsers.length} 人参与
                </Typography>
              </CardContent>
            </Card>
          )}

          {/* All digests if no chat selected */}
          {!selectedChat && digests.length > 0 && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>今日群聊摘要</Typography>
                <Stack spacing={2}>
                  {digests.map(d => (
                    <Box key={d.id}>
                      <Typography variant="subtitle2">{d.chat.name || '未命名'}</Typography>
                      <Typography variant="body2" color="text.secondary">{d.summary}</Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                        {d.keyTopics.map(t => (
                          <Chip key={t} label={`#${t}`} size="small" variant="outlined" />
                        ))}
                      </Box>
                      <Divider sx={{ mt: 1.5 }} />
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}
```

**Step 2: Commit**

```bash
git add app/feishu/pulse/page.tsx
git commit -m "feat(team-pulse): add Team Pulse dashboard UI"
```

---

### Task 8: Add Navigation Entry

Add the Team Pulse page to the Feishu section in the main navigation.

**Files:**
- Modify: `app/feishu/page.tsx` (add link card to /feishu/pulse)

**Step 1: Check feishu index page and add pulse link**

Read `app/feishu/page.tsx` and add a navigation card for Team Pulse. Add it as the first card (most important feature). Use:
- Title: "团队脉搏"
- Description: "从群聊中提取运营信号，查看团队动态和每日摘要"
- Icon: `MonitorHeart` or `Favorite` from MUI icons
- Link: `/feishu/pulse`

Follow the exact same card pattern used on this page for existing links (chats, blacklist, settings).

**Step 2: Commit**

```bash
git add app/feishu/page.tsx
git commit -m "feat(team-pulse): add Team Pulse navigation entry"
```

---

### Task 9: Feishu Daily Pulse Notification

Enhance the scheduler's daily analysis to send a rich summary to Feishu.

**Files:**
- Modify: `lib/team-pulse/chat-analyzer.ts` (add `generatePulseSummary` export)

**Step 1: Add summary generation function**

Add at the bottom of `lib/team-pulse/chat-analyzer.ts`:

```typescript
/**
 * Generate a formatted text summary of today's team pulse.
 * Called by the scheduler after analysis completes.
 */
export async function generatePulseSummary(): Promise<string> {
  const db = new PrismaClient();
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [digests, signals, pulses] = await Promise.all([
      db.chatDigest.findMany({
        where: { date: today },
        include: { chat: { select: { name: true } } },
        orderBy: { messageCount: 'desc' },
      }),
      db.chatSignal.findMany({
        where: { detectedAt: { gte: today }, isResolved: false },
        include: { chat: { select: { name: true } } },
      }),
      db.teamPulse.findMany({
        where: { date: today },
      }),
    ]);

    const totalMessages = pulses.reduce((s, p) => s + p.messageCount, 0);
    const activeChats = pulses.length;
    const dateStr = today.toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
    });

    const lines: string[] = [
      `📊 团队脉搏 — ${dateStr}`,
      '',
      `群聊: ${activeChats} 个活跃 | 消息: ${totalMessages} 条`,
    ];

    // Unresolved signals by type
    if (signals.length > 0) {
      const bySeverity = signals.filter(s => s.severity === 'CRITICAL' || s.severity === 'HIGH');
      lines.push('');
      lines.push(`⚠️ 未处理信号: ${signals.length} 条${bySeverity.length > 0 ? ` (${bySeverity.length} 条高优)` : ''}`);
      for (const s of bySeverity.slice(0, 5)) {
        lines.push(`  • [${s.signalType}] ${s.title} — ${s.chat.name || '未命名'}`);
      }
    }

    // Top chat digests
    if (digests.length > 0) {
      lines.push('');
      lines.push('📝 群聊摘要:');
      for (const d of digests.slice(0, 3)) {
        const summary = d.summary.length > 60 ? d.summary.substring(0, 60) + '...' : d.summary;
        lines.push(`  ${d.chat.name}: ${summary}`);
      }
    }

    lines.push('');
    lines.push('查看详情: /feishu/pulse');

    return lines.join('\n');
  } finally {
    await db.$disconnect();
  }
}
```

**Step 2: Update scheduler to use rich summary**

In `services/scheduler.ts`, replace the simple message in the team pulse cron job with:

```typescript
    // Send daily pulse summary to Feishu
    try {
      const { generatePulseSummary } = await import('@/lib/team-pulse/chat-analyzer');
      const summary = await generatePulseSummary();
      const { sendFeishuTextMessage } = await import('@/lib/feishu');
      await sendFeishuTextMessage(summary);
    } catch (e: any) {
      console.error('[Scheduler] Failed to send pulse to Feishu:', e.message);
    }
```

**Step 3: Commit**

```bash
git add lib/team-pulse/chat-analyzer.ts services/scheduler.ts
git commit -m "feat(team-pulse): add rich Feishu daily pulse notification"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Prisma models + migration | `prisma/schema.prisma` |
| 2 | Real-time signal detector | `services/feishu-listener/src/signal-detector.ts`, `message-handler.ts`, `index.ts` |
| 3 | Batch chat analyzer (LLM) | `lib/team-pulse/chat-analyzer.ts` |
| 4 | API: Signals CRUD | `app/api/team-pulse/signals/` |
| 5 | API: Digests + Overview + Analyze | `app/api/team-pulse/digests/`, `overview/`, `analyze/` |
| 6 | Scheduler registration | `services/scheduler.ts` |
| 7 | Dashboard UI | `app/feishu/pulse/page.tsx` |
| 8 | Navigation entry | `app/feishu/page.tsx` |
| 9 | Feishu notification | `lib/team-pulse/chat-analyzer.ts`, `services/scheduler.ts` |
