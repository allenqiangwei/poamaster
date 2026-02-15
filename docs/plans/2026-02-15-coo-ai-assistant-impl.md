# COO AI 助手功能扩展 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 6 modules to POA Master — decision log, enhanced people profiles, priority queue on briefing page, enriched meeting prep, weekly report generator, and Feishu natural language bot.

**Architecture:** Each phase enhances existing data (Prisma models, API routes, UI pages). Phase 2 and 6 add new Prisma models; other phases modify existing routes/pages. All LLM calls use the shared `getOpenAIClient()` + `getOpenAIModel()` from `lib/openai.ts`. All API routes follow the cookie→`verifySession()`→Prisma→JSON pattern in `lib/auth.ts`.

**Tech Stack:** Next.js 16+ App Router, MUI components, Prisma ORM (PostgreSQL), OpenAI API (via `lib/openai.ts`), Feishu Bot API, Recharts for charts.

**Port:** 3030 (configured in `.env`). Never use 3000.

**Key patterns to follow:**
- API auth: `const token = req.cookies.get('session')?.value; ... const session = await verifySession(token);`
- Prisma singleton: `import { prisma } from '@/lib/prisma';`
- OpenAI client: `const openai = await getOpenAIClient(); const model = await getOpenAIModel();`
- Next.js 15+ dynamic params: `params` is a `Promise`, must be `await`ed
- Theme tokens: `import { designTokens as dt } from '@/lib/theme';`

---

## Phase 2: Decision Log (决策日志)

### Task 1: Add Decision model to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add the DecisionStatus enum and Decision model**

Add at end of `prisma/schema.prisma`:

```prisma
// ==================== Decision Log (决策日志) ====================

enum DecisionStatus {
  PENDING
  EXECUTING
  COMPLETED
  REVISED
}

model Decision {
  id          String         @id @default(cuid())
  title       String
  context     String?        @db.Text
  outcome     String?        @db.Text
  status      DecisionStatus @default(PENDING)
  madeAt      DateTime
  madeBy      String?
  reviewDate  DateTime?
  notes       String?        @db.Text
  signalId    String?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  tasks       Task[]

  @@index([status])
  @@index([madeAt])
  @@index([reviewDate])
}
```

Also add `decisionId` to the existing `Task` model:

```prisma
// In the Task model, add:
  decisionId String?
  decision   Decision? @relation(fields: [decisionId], references: [id])
```

Add index: `@@index([decisionId])` to Task.

**Step 2: Generate migration**

Run:
```bash
cd /Users/allenqiang/poamaster
npx prisma migrate dev --name add_decision_model
```
Expected: Migration created and applied.

**Step 3: Verify Prisma client**

Run:
```bash
npx prisma generate
```
Expected: `✔ Generated Prisma Client`

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add Decision model and DecisionStatus enum"
```

---

### Task 2: Create Decision CRUD API routes

**Files:**
- Create: `app/api/decisions/route.ts`
- Create: `app/api/decisions/[id]/route.ts`

**Step 1: Create `app/api/decisions/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status');

  const where: any = {};
  if (status) where.status = status;

  const decisions = await prisma.decision.findMany({
    where,
    include: {
      tasks: {
        select: { id: true, title: true, status: true },
      },
    },
    orderBy: { madeAt: 'desc' },
  });

  return NextResponse.json({ success: true, data: decisions });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  const body = await req.json();
  const { title, context, outcome, madeAt, madeBy, reviewDate, notes, signalId } = body;

  if (!title?.trim()) {
    return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
  }

  const decision = await prisma.decision.create({
    data: {
      title: title.trim(),
      context: context?.trim() || null,
      outcome: outcome?.trim() || null,
      madeAt: madeAt ? new Date(madeAt) : new Date(),
      madeBy: madeBy?.trim() || null,
      reviewDate: reviewDate ? new Date(reviewDate) : null,
      notes: notes?.trim() || null,
      signalId: signalId || null,
    },
  });

  return NextResponse.json({ success: true, data: decision }, { status: 201 });
}
```

**Step 2: Create `app/api/decisions/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  const { id } = await params;

  const decision = await prisma.decision.findUnique({
    where: { id },
    include: {
      tasks: {
        include: { assignee: { select: { id: true, name: true } } },
      },
    },
  });

  if (!decision) {
    return NextResponse.json({ success: false, error: 'Decision not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: decision });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { title, context, outcome, status, madeBy, reviewDate, notes } = body;

  const data: any = {};
  if (title !== undefined) data.title = title.trim();
  if (context !== undefined) data.context = context?.trim() || null;
  if (outcome !== undefined) data.outcome = outcome?.trim() || null;
  if (status !== undefined) data.status = status;
  if (madeBy !== undefined) data.madeBy = madeBy?.trim() || null;
  if (reviewDate !== undefined) data.reviewDate = reviewDate ? new Date(reviewDate) : null;
  if (notes !== undefined) data.notes = notes?.trim() || null;

  const decision = await prisma.decision.update({
    where: { id },
    data,
  });

  return NextResponse.json({ success: true, data: decision });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  const { id } = await params;
  await prisma.decision.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
```

**Step 3: Verify routes**

Run:
```bash
curl -s --noproxy '*' -b 'session=<TOKEN>' http://localhost:3030/api/decisions | head -c 200
```
Expected: `{"success":true,"data":[]}`

**Step 4: Commit**

```bash
git add app/api/decisions/
git commit -m "feat: add Decision CRUD API routes"
```

---

### Task 3: Create Decision List page

**Files:**
- Create: `app/(dashboard)/decisions/page.tsx`

**Step 1: Create the decisions list page**

Follow the pattern from `app/(dashboard)/todo/page.tsx`. Create a `'use client'` page with:
- Header with title "决策日志" and "新增决策" button
- Tabs for status filter: 全部 / PENDING (待执行) / EXECUTING (执行中) / COMPLETED (已完成) / REVISED (已修订)
- Table showing: title, madeBy, madeAt, status chip, reviewDate, linked task count
- Row click navigates to `/decisions/[id]`
- Snackbar for error/success feedback

Use MUI components: Box, Typography, Tabs, Tab, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Paper, Snackbar, Alert. Follow `designTokens` from `@/lib/theme` for styling.

Status chip colors: PENDING=default, EXECUTING=primary, COMPLETED=success, REVISED=warning.

**Step 2: Verify page loads**

Open `http://localhost:3030/decisions` in browser.
Expected: Page renders with "决策日志" header and empty table.

**Step 3: Commit**

```bash
git add app/(dashboard)/decisions/
git commit -m "feat: add decisions list page"
```

---

### Task 4: Create Decision Detail page

**Files:**
- Create: `app/(dashboard)/decisions/[id]/page.tsx`

**Step 1: Create the decision detail page**

Follow the pattern from `app/(dashboard)/assignees/[id]/page.tsx`. Create a `'use client'` page with:
- Back button + decision title as header
- Status chip (editable via dropdown)
- Info fields: 决策背景 (context), 预期结果 (outcome), 决策人 (madeBy), 决策时间 (madeAt), 复盘日期 (reviewDate)
- Notes field (editable TextArea)
- "关联任务" section showing linked tasks in a table
- "创建关联任务" button that opens a dialog (title, dod, assignee, dueDate) — POST to `/api/tasks` with `decisionId`
- Save button calls PATCH `/api/decisions/[id]`

Remember: `params` is a `Promise` in Next.js 15+.

**Step 2: Verify page loads**

Create a test decision via curl, then navigate to its detail page.
Expected: Decision detail renders with all fields.

**Step 3: Commit**

```bash
git add app/(dashboard)/decisions/[id]/
git commit -m "feat: add decision detail page with linked tasks"
```

---

### Task 5: Add "Record as Decision" button to Team Pulse signals

**Files:**
- Modify: `app/feishu/pulse/page.tsx`

**Step 1: Add decision creation from signal**

In `app/feishu/pulse/page.tsx`, add a new button next to the existing "AddTask" button on each signal card. Use `Gavel` icon from MUI icons. The button opens a dialog pre-filled with:
- title = signal.title
- context = signal.summary
- madeBy = signal.relatedUser
- madeAt = signal.detectedAt

Dialog POSTs to `/api/decisions` with `signalId: signal.id`.

Add state variables: `decisionDialogOpen`, `decisionForm`, `decisionCreating`.

**Step 2: Verify**

Open Team Pulse page, check that decision button appears on signal cards.

**Step 3: Commit**

```bash
git add app/feishu/pulse/page.tsx
git commit -m "feat: add 'Record as Decision' button to signal cards"
```

---

### Task 6: Add navigation link to sidebar

**Files:**
- Modify: `app/(dashboard)/layout.tsx`

**Step 1: Add decisions link**

In the dashboard layout navigation, add a "决策日志" link pointing to `/decisions`. Use `Gavel` icon from MUI icons. Place it after the existing "任务列表" link.

**Step 2: Verify**

Reload dashboard, confirm "决策日志" appears in sidebar navigation.

**Step 3: Commit**

```bash
git add app/(dashboard)/layout.tsx
git commit -m "feat: add decisions link to dashboard sidebar"
```

---

## Phase 4: Enhanced People Profile (增强人员画像)

### Task 7: Create profile API endpoint

**Files:**
- Create: `app/api/assignees/[id]/profile/route.ts`

**Step 1: Create the profile endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  const { id } = await params;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const assignee = await prisma.assignee.findUnique({
    where: { id },
    select: { id: true, name: true, feishuUserId: true },
  });

  if (!assignee) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }

  // Feishu message activity (match by senderName OR feishuUserId)
  const messageFilter: any = { timestamp: { gte: since } };
  if (assignee.feishuUserId) {
    messageFilter.OR = [
      { senderName: assignee.name },
      { senderId: assignee.feishuUserId },
    ];
  } else {
    messageFilter.senderName = assignee.name;
  }

  const [messageCount, activeChatIds, taskStats, signals] = await Promise.all([
    // Total messages sent in 7 days
    prisma.feishuMessage.count({ where: messageFilter }),

    // Active chats (distinct chatIds)
    prisma.feishuMessage.groupBy({
      by: ['chatId'],
      where: messageFilter,
      _count: { id: true },
    }),

    // Task completion stats
    prisma.task.groupBy({
      by: ['status'],
      where: { assigneeId: id },
      _count: { id: true },
    }),

    // Related signals (from chats where this person is active)
    prisma.chatSignal.count({
      where: {
        isResolved: false,
        detectedAt: { gte: since },
        relatedUser: assignee.name,
      },
    }),
  ]);

  // Task completion rate
  const taskCountByStatus = Object.fromEntries(
    taskStats.map(s => [s.status, s._count.id])
  );
  const totalTasks = Object.values(taskCountByStatus).reduce((a: number, b: any) => a + b, 0);
  const doneTasks = (taskCountByStatus as any).DONE || 0;
  const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // Sentiment trend (get daily sentiment scores from chats where person is active)
  const activeChatIdList = activeChatIds.map(c => c.chatId);
  const sentimentTrend = activeChatIdList.length > 0
    ? await prisma.teamPulse.findMany({
        where: { chatId: { in: activeChatIdList }, date: { gte: since } },
        select: { date: true, sentimentScore: true },
        orderBy: { date: 'asc' },
      })
    : [];

  return NextResponse.json({
    success: true,
    data: {
      messageCount,
      activeChatCount: activeChatIds.length,
      completionRate,
      taskCountByStatus,
      unresolvedSignals: signals,
      sentimentTrend: sentimentTrend.map(s => ({
        date: s.date,
        sentiment: s.sentimentScore,
      })),
    },
  });
}
```

**Step 2: Verify**

```bash
curl -s --noproxy '*' -b 'session=<TOKEN>' http://localhost:3030/api/assignees/<ASSIGNEE_ID>/profile | python3 -m json.tool
```
Expected: JSON with messageCount, activeChatCount, etc.

**Step 3: Commit**

```bash
git add app/api/assignees/[id]/profile/
git commit -m "feat: add people profile API endpoint"
```

---

### Task 8: Add profile section to assignee detail page

**Files:**
- Modify: `app/(dashboard)/assignees/[id]/page.tsx`

**Step 1: Add profile data fetch and display**

In `app/(dashboard)/assignees/[id]/page.tsx`:

1. Add state: `const [profile, setProfile] = useState<any>(null);`
2. Add fetch in `useEffect` after assigneeId is set:
   ```typescript
   fetch(`/api/assignees/${assigneeId}/profile`, { credentials: 'include' })
     .then(r => r.json())
     .then(d => { if (d.success) setProfile(d.data); });
   ```
3. Add a "综合画像" Card above the existing "任务列表" Paper. Display:
   - 4 stat cards in a Grid row: 本周消息 (messageCount), 活跃群数 (activeChatCount), 任务完成率 (completionRate%), 活跃信号 (unresolvedSignals)
   - Mini sentiment trend chart using Recharts `ResponsiveContainer` + `LineChart` (same pattern as Team Pulse page)

Use the `CARD_STYLE` and `StatCard` pattern from `app/(dashboard)/insights/page.tsx`.

**Step 2: Verify**

Navigate to `/assignees/<id>`, confirm profile section appears with stats.

**Step 3: Commit**

```bash
git add app/(dashboard)/assignees/[id]/page.tsx
git commit -m "feat: add profile section to assignee detail page"
```

---

### Task 9: Enhance assignees list with mini profile data

**Files:**
- Modify: `app/(dashboard)/assignees/page.tsx`
- Modify: `app/api/assignees/route.ts` (if needed to return extra data)

**Step 1: Add profile stats to list**

Convert the assignees table to cards layout (or add columns). For each assignee, show:
- Name (existing, clickable)
- Task count (existing)
- 本周消息数 (new — fetch from a batch endpoint or individual profile calls)
- feishuUserId (existing)

The simplest approach: after loading assignees, fire parallel profile fetches for each one and merge data. Alternatively, add a `GET /api/assignees/profiles` batch endpoint.

Keep it simple: fetch profiles in parallel after assignee list loads.

**Step 2: Verify**

Open `/assignees`, confirm extra data columns appear.

**Step 3: Commit**

```bash
git add app/(dashboard)/assignees/page.tsx
git commit -m "feat: enhance assignees list with activity stats"
```

---

## Phase 1: Enhanced Briefing Homepage (增强简报首页)

### Task 10: Add priorities generation to daily insights API

**Files:**
- Modify: `lib/insights/collector.ts`
- Modify: `app/api/insights/daily/route.ts`

**Step 1: Extend `collectDailyData` to include priority data**

In `lib/insights/collector.ts`, add to the `DailyData` interface:

```typescript
priorities: {
  overdueTasks: Array<{ id: string; title: string; assignee: string; dueDate: string }>;
  unresolvedSignals: Array<{ id: string; type: string; severity: string; title: string; chatName: string }>;
  pendingDecisions: Array<{ id: string; title: string; madeBy: string; madeAt: string }>;
};
```

Add parallel queries in `collectDailyData` for:
- Unresolved HIGH/CRITICAL signals (top 5)
- Pending decisions with past reviewDate (top 5)

Include these in the returned DailyData.

**Step 2: Update `app/api/insights/daily/route.ts`**

In the response, include `priorities` from the collected data. The LLM briefing prompt in `lib/insights/summarizer.ts` can optionally be updated to reference priorities, but the primary display is through the UI component (Task 11).

**Step 3: Verify**

```bash
curl -s --noproxy '*' -b 'session=<TOKEN>' http://localhost:3030/api/insights/daily | python3 -c "import sys,json; d=json.load(sys.stdin); print(list(d.get('data',{}).get('priorities',{}).keys()))"
```
Expected: `['overdueTasks', 'unresolvedSignals', 'pendingDecisions']`

**Step 4: Commit**

```bash
git add lib/insights/collector.ts app/api/insights/daily/route.ts
git commit -m "feat: add priority data to daily insights collector"
```

---

### Task 11: Add priority queue UI to insights page

**Files:**
- Modify: `app/(dashboard)/insights/page.tsx`

**Step 1: Add PriorityQueue component**

In `app/(dashboard)/insights/page.tsx`:

1. Update the `DailyData` interface to include `priorities`.
2. Add a new card component `PriorityQueue` that renders between the stat cards row and the topic suggestion card.
3. Each priority item shows:
   - Icon based on type (WarningIcon for overdue tasks, RiskIcon for signals, GavelIcon for decisions)
   - Title text
   - Source chip (task/signal/decision)
   - Urgency chip (color-coded)
   - Click handler: navigate to `/todo/<id>`, `/feishu/pulse` (for signals), or `/decisions/<id>`

Use existing `CARD_STYLE` pattern and `designTokens`.

**Step 2: Verify**

Open `/insights`, confirm priority queue section appears (may be empty if no overdue tasks/signals).

**Step 3: Commit**

```bash
git add app/(dashboard)/insights/page.tsx
git commit -m "feat: add priority queue to insights homepage"
```

---

## Phase 5: Enhanced Meeting Prep (增强会前简报)

### Task 12: Enrich weekly-topics API with Feishu + Pulse data

**Files:**
- Modify: `app/api/insights/weekly-topics/route.ts`

**Step 1: Add Feishu activity and pulse data queries**

In `app/api/insights/weekly-topics/route.ts`, after fetching `assignee` with `confirmedItems` and `tasks`, add:

```typescript
const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

// Feishu activity
const messageFilter: any = { timestamp: { gte: since } };
if (assignee.feishuUserId) {
  messageFilter.OR = [
    { senderName: assignee.name },
    { senderId: assignee.feishuUserId },
  ];
} else {
  messageFilter.senderName = assignee.name;
}

const [messageCount, activeChatIds, signals] = await Promise.all([
  prisma.feishuMessage.count({ where: messageFilter }),
  prisma.feishuMessage.groupBy({
    by: ['chatId'],
    where: messageFilter,
  }),
  prisma.chatSignal.findMany({
    where: {
      isResolved: false,
      detectedAt: { gte: since },
      relatedUser: assignee.name,
    },
    take: 5,
    orderBy: { detectedAt: 'desc' },
    include: { chat: { select: { name: true } } },
  }),
]);

// Sentiment from active chats
const chatIds = activeChatIds.map(c => c.chatId);
const sentimentData = chatIds.length > 0
  ? await prisma.teamPulse.findMany({
      where: { chatId: { in: chatIds }, date: { gte: since } },
      select: { sentimentScore: true },
    })
  : [];

const avgSentiment = sentimentData.length > 0
  ? sentimentData.reduce((sum, s) => sum + (s.sentimentScore || 0), 0) / sentimentData.length
  : null;
```

**Step 2: Extend the prompt**

Prepend a "状态概要" section to the prompt:

```typescript
let statusSummary = `\n【近一周状态概要】
- 飞书消息: ${messageCount} 条，活跃于 ${chatIds.length} 个群
- 情绪趋势: ${avgSentiment !== null ? (avgSentiment > 0.2 ? '积极' : avgSentiment < -0.2 ? '需关注' : '稳定') : '暂无数据'}
- 活跃信号: ${signals.length} 个待处理`;

if (signals.length > 0) {
  statusSummary += '\n  信号详情:';
  signals.forEach((s, i) => {
    statusSummary += `\n  ${i + 1}. [${s.signalType}/${s.severity}] ${s.title} (${s.chat.name || s.chatId})`;
  });
}
```

Insert `statusSummary` into the existing prompt before the "请基于以上信息" instruction. Update the prompt to ask LLM to output "【状态概要】" section first, then the existing meeting topics format.

**Step 3: Verify**

Use the "生成周会议题" button on an assignee detail page. Confirm the output now includes a status summary section.

**Step 4: Commit**

```bash
git add app/api/insights/weekly-topics/route.ts
git commit -m "feat: enrich weekly-topics with Feishu activity and pulse data"
```

---

## Phase 3: Weekly Report (周报生成)

### Task 13: Create weekly report API

**Files:**
- Create: `app/api/reports/weekly/route.ts`

**Step 1: Create the weekly report endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { getOpenAIClient, getOpenAIModel } from '@/lib/openai';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  const body = await req.json();
  const { model } = body;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Collect weekly data
  const [
    completedTasks, newTasks, inProgressTasks,
    feishuMessages, signals, decisions,
    sentimentData,
  ] = await Promise.all([
    prisma.task.findMany({
      where: { status: 'DONE', updatedAt: { gte: weekAgo } },
      include: { assignee: { select: { name: true } } },
    }),
    prisma.task.findMany({
      where: { createdAt: { gte: weekAgo } },
      include: { assignee: { select: { name: true } } },
    }),
    prisma.task.findMany({
      where: { status: 'IN_PROGRESS' },
      include: { assignee: { select: { name: true } } },
    }),
    prisma.feishuMessage.count({ where: { timestamp: { gte: weekAgo } } }),
    prisma.chatSignal.findMany({
      where: { detectedAt: { gte: weekAgo } },
      include: { chat: { select: { name: true } } },
      orderBy: { detectedAt: 'desc' },
      take: 10,
    }),
    prisma.decision.findMany({
      where: { createdAt: { gte: weekAgo } },
      orderBy: { madeAt: 'desc' },
    }),
    prisma.teamPulse.findMany({
      where: { date: { gte: weekAgo } },
      select: { date: true, messageCount: true, sentimentScore: true },
    }),
  ]);

  // Build prompt data sections
  let dataText = `# 本周数据汇总 (${weekAgo.toLocaleDateString('zh-CN')} - ${new Date().toLocaleDateString('zh-CN')})\n\n`;

  dataText += `## 任务\n`;
  dataText += `- 完成: ${completedTasks.length} 个\n`;
  completedTasks.forEach(t => { dataText += `  - ${t.title} (${t.assignee?.name || '未分配'})\n`; });
  dataText += `- 新建: ${newTasks.length} 个\n`;
  dataText += `- 进行中: ${inProgressTasks.length} 个\n`;
  inProgressTasks.forEach(t => { dataText += `  - ${t.title} (${t.assignee?.name || '未分配'})\n`; });

  dataText += `\n## 团队动态\n`;
  dataText += `- 飞书消息总量: ${feishuMessages} 条\n`;

  if (signals.length > 0) {
    dataText += `- 运营信号: ${signals.length} 个\n`;
    signals.forEach(s => { dataText += `  - [${s.signalType}/${s.severity}] ${s.title} (${s.chat.name || s.chatId})\n`; });
  }

  if (decisions.length > 0) {
    dataText += `\n## 决策\n`;
    decisions.forEach(d => { dataText += `- [${d.status}] ${d.title} (${d.madeBy || '未指定'})\n`; });
  }

  const prompt = `你是一位COO的助理，帮助生成周工作汇报。

${dataText}

请基于以上数据，生成一份结构化的周报，格式如下：

一、本周完成
- 列出完成的任务和成果

二、进行中 / 待跟进
- 列出未完成的重点任务和需要跟进的事项

三、团队动态
- 消息活跃度、关键信号、情绪趋势

四、重要决策
- 本周做出的决策及执行状态

五、下周计划
- 基于当前任务和信号的下一步建议

用简洁的中文回答，突出重点，便于快速阅读。`;

  const openai = await getOpenAIClient();
  const modelToUse = model || await getOpenAIModel();

  const completion = await openai.chat.completions.create({
    model: modelToUse,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_completion_tokens: 3000,
  });

  const content = completion.choices[0]?.message?.content || '';

  return NextResponse.json({
    success: true,
    data: { content, completedCount: completedTasks.length, newCount: newTasks.length },
  });
}
```

**Step 2: Verify**

```bash
curl -s --noproxy '*' -X POST -H 'Content-Type: application/json' -b 'session=<TOKEN>' http://localhost:3030/api/reports/weekly -d '{}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('success'))"
```
Expected: `True`

**Step 3: Commit**

```bash
git add app/api/reports/weekly/
git commit -m "feat: add weekly report generation API"
```

---

### Task 14: Add "Generate Weekly Report" button to todo page

**Files:**
- Modify: `app/(dashboard)/todo/page.tsx`

**Step 1: Add weekly report button and dialog**

In `app/(dashboard)/todo/page.tsx`:

1. Import `ModelSelectionDialog` from `@/components/ModelSelectionDialog`
2. Import `Assessment as ReportIcon` from MUI icons
3. Add state:
   ```typescript
   const [reportDialog, setReportDialog] = useState<{ open: boolean; loading: boolean; content: string }>({ open: false, loading: false, content: '' });
   const [showReportModelDialog, setShowReportModelDialog] = useState(false);
   const [reportSendingToFeishu, setReportSendingToFeishu] = useState(false);
   ```
4. Add handler functions:
   - `handleGenerateReport()` — opens model selection dialog
   - `handleReportModelConfirm(model)` — POSTs to `/api/reports/weekly`, shows result in dialog
   - `handleSendReportToFeishu()` — POSTs content to `/api/insights/send-to-feishu`
5. Add button in header between "发送到飞书" and "添加任务":
   ```tsx
   <Button variant="outlined" startIcon={<ReportIcon />} onClick={() => setShowReportModelDialog(true)}>
     生成周报
   </Button>
   ```
6. Add report result Dialog (same pattern as weekly-topics dialog in assignees page): shows content in a Paper with pre-wrap, buttons for "发送到飞书", "复制内容", "关闭".
7. Add `<ModelSelectionDialog>` component.

**Step 2: Verify**

Open `/todo`, confirm "生成周报" button appears and clicking it shows model selection.

**Step 3: Commit**

```bash
git add app/(dashboard)/todo/page.tsx
git commit -m "feat: add weekly report generation to todo page"
```

---

## Phase 6: Feishu Natural Language Bot (飞书自然语言助手)

### Task 15: Add BotConversation model

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add BotConversation model**

Add at end of `prisma/schema.prisma`:

```prisma
// ==================== Feishu Bot (自然语言助手) ====================

model BotConversation {
  id           String   @id @default(cuid())
  chatId       String
  messages     Json     @default("[]")
  lastActiveAt DateTime @default(now())
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([chatId])
  @@index([lastActiveAt])
}
```

**Step 2: Generate migration**

```bash
npx prisma migrate dev --name add_bot_conversation
```

**Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add BotConversation model for Feishu bot"
```

---

### Task 16: Create bot agent module

**Files:**
- Create: `services/feishu-listener/src/bot-agent.ts`

**Step 1: Create the bot agent**

This module handles:
1. Receiving a user message + chatId
2. Loading conversation history from BotConversation
3. Building OpenAI function-calling request with tool definitions
4. Executing tool calls against internal data (Prisma queries)
5. Returning the assistant's response text
6. Saving updated conversation history

```typescript
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { logger } from './logger.js';

let prisma: PrismaClient;

export function initBotAgent(prismaClient: PrismaClient) {
  prisma = prismaClient;
}

const MAX_HISTORY = 20; // Keep last 20 messages for context

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
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
        properties: { name: { type: 'string', description: '人员姓名' } },
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
          status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'DONE'], description: '任务状态（可选）' },
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
        properties: { days: { type: 'number', description: '查看最近几天，默认7' } },
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
          status: { type: 'string', enum: ['PENDING', 'EXECUTING', 'COMPLETED', 'REVISED'], description: '决策状态（可选）' },
        },
      },
    },
  },
];

// Tool execution implementations
async function executeTool(name: string, args: any): Promise<string> {
  const since = new Date(Date.now() - (args.days || 7) * 24 * 60 * 60 * 1000);

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
      return JSON.stringify({ overdueTasks: overdue.map(t => ({ title: t.title, assignee: t.assignee?.name, dueDate: t.dueDate })), signals: signals.map(s => ({ type: s.signalType, severity: s.severity, title: s.title, chat: s.chat.name })), pendingDecisions: decisions.map(d => ({ title: d.title, madeBy: d.madeBy })) });
    }

    case 'get_person_status': {
      const assignee = await prisma.assignee.findFirst({ where: { name: { contains: args.name } } });
      if (!assignee) return JSON.stringify({ error: `未找到名为"${args.name}"的人员` });

      const [msgCount, tasks] = await Promise.all([
        prisma.feishuMessage.count({ where: { senderName: assignee.name, timestamp: { gte: since } } }),
        prisma.task.findMany({ where: { assigneeId: assignee.id }, include: { assignee: { select: { name: true } } } }),
      ]);

      const byStatus = { TODO: 0, IN_PROGRESS: 0, DONE: 0 };
      tasks.forEach(t => { if (t.status in byStatus) (byStatus as any)[t.status]++; });

      return JSON.stringify({ name: assignee.name, weekMessages: msgCount, tasks: byStatus, overdue: tasks.filter(t => t.status !== 'DONE' && t.dueDate && new Date(t.dueDate) < new Date()).map(t => t.title) });
    }

    case 'get_task_list': {
      const where: any = {};
      if (args.assignee) {
        const a = await prisma.assignee.findFirst({ where: { name: { contains: args.assignee } } });
        if (a) where.assigneeId = a.id;
      }
      if (args.status) where.status = args.status;

      const tasks = await prisma.task.findMany({
        where, include: { assignee: { select: { name: true } } }, take: 15, orderBy: { dueDate: 'asc' },
      });
      return JSON.stringify(tasks.map(t => ({ title: t.title, status: t.status, assignee: t.assignee?.name, dueDate: t.dueDate })));
    }

    case 'get_team_pulse': {
      const [msgCount, signals, sentiment] = await Promise.all([
        prisma.feishuMessage.count({ where: { timestamp: { gte: since } } }),
        prisma.chatSignal.findMany({ where: { detectedAt: { gte: since } }, include: { chat: { select: { name: true } } }, take: 5 }),
        prisma.teamPulse.findMany({ where: { date: { gte: since } }, select: { sentimentScore: true } }),
      ]);
      const avgSentiment = sentiment.length > 0 ? sentiment.reduce((s, p) => s + (p.sentimentScore || 0), 0) / sentiment.length : null;
      return JSON.stringify({ totalMessages: msgCount, avgSentiment, recentSignals: signals.map(s => ({ type: s.signalType, severity: s.severity, title: s.title, chat: s.chat.name })) });
    }

    case 'get_decisions': {
      const where: any = {};
      if (args.status) where.status = args.status;
      const decisions = await prisma.decision.findMany({ where, take: 10, orderBy: { madeAt: 'desc' } });
      return JSON.stringify(decisions.map(d => ({ title: d.title, status: d.status, madeBy: d.madeBy, madeAt: d.madeAt })));
    }

    default:
      return JSON.stringify({ error: 'Unknown tool' });
  }
}

export async function processMessage(chatId: string, userMessage: string): Promise<string> {
  // Load conversation history
  let conv = await prisma.botConversation.findUnique({ where: { chatId } });
  const history: Array<{ role: string; content: string }> = conv?.messages as any || [];

  // Add user message
  history.push({ role: 'user', content: userMessage });

  // Trim to MAX_HISTORY
  const trimmed = history.slice(-MAX_HISTORY);

  // Build messages for OpenAI
  const systemMsg = `你是 POA Master AI 助手，帮助COO管理团队。你可以查询任务、人员状态、团队脉搏、决策日志等数据。用简洁的中文回答，重点突出，格式清晰。当前时间: ${new Date().toLocaleString('zh-CN')}`;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemMsg },
    ...trimmed.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  // Get OpenAI config from database
  const { createDecipheriv } = await import('crypto');
  const configRecords = await prisma.config.findMany({
    where: { key: { in: ['openai.apiKey', 'openai.model'] } },
  });
  const configMap = new Map(configRecords.map(c => [c.key, c.value]));

  let apiKey = configMap.get('openai.apiKey') || process.env.OPENAI_API_KEY || '';
  // Decrypt if needed
  if (apiKey.includes(':') && apiKey.split(':').length === 3) {
    const secret = process.env.SESSION_SECRET;
    if (secret) {
      const key = Buffer.from(secret.padEnd(32, '0').slice(0, 32));
      const [ivHex, tagHex, encrypted] = apiKey.split(':');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      apiKey = decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
    }
  }

  const modelName = configMap.get('openai.model') || 'gpt-4o';

  const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY;
  const clientConfig: any = { apiKey, timeout: 60000 };
  if (proxyUrl) {
    const { ProxyAgent } = await import('undici');
    clientConfig.fetchOptions = { dispatcher: new ProxyAgent(proxyUrl) };
  }

  const openai = new OpenAI(clientConfig);

  // First call — may need tool calls
  let response = await openai.chat.completions.create({
    model: modelName,
    messages,
    tools: TOOLS,
    temperature: 0.7,
    max_completion_tokens: 1500,
  });

  let assistantMsg = response.choices[0]?.message;

  // Handle tool calls (single round — most queries need only one)
  if (assistantMsg?.tool_calls && assistantMsg.tool_calls.length > 0) {
    messages.push(assistantMsg as any);

    for (const tc of assistantMsg.tool_calls) {
      const args = JSON.parse(tc.function.arguments || '{}');
      const result = await executeTool(tc.function.name, args);
      messages.push({ role: 'tool', tool_call_id: tc.id, content: result } as any);
    }

    // Second call with tool results
    response = await openai.chat.completions.create({
      model: modelName,
      messages,
      temperature: 0.7,
      max_completion_tokens: 1500,
    });
    assistantMsg = response.choices[0]?.message;
  }

  const reply = assistantMsg?.content || '抱歉，我暂时无法处理这个请求。';

  // Save conversation
  trimmed.push({ role: 'assistant', content: reply });

  await prisma.botConversation.upsert({
    where: { chatId },
    create: { chatId, messages: trimmed.slice(-MAX_HISTORY) as any, lastActiveAt: new Date() },
    update: { messages: trimmed.slice(-MAX_HISTORY) as any, lastActiveAt: new Date() },
  });

  return reply;
}
```

**Step 2: Verify module compiles**

```bash
cd /Users/allenqiang/poamaster/services/feishu-listener && npx tsc --noEmit src/bot-agent.ts
```

**Step 3: Commit**

```bash
git add services/feishu-listener/src/bot-agent.ts
git commit -m "feat: add bot agent with LLM function calling for Feishu bot"
```

---

### Task 17: Add Feishu Bot reply capability

**Files:**
- Create: `services/feishu-listener/src/bot-reply.ts`

**Step 1: Create bot reply module**

This module sends messages back to Feishu chats using the Bot API:

```typescript
import { PrismaClient } from '@prisma/client';
import { createDecipheriv } from 'crypto';
import { logger } from './logger.js';

const BASE_URL = 'https://open.feishu.cn/open-apis';
let prisma: PrismaClient;

export function initBotReply(prismaClient: PrismaClient) {
  prisma = prismaClient;
}

async function getConfig(key: string): Promise<string | null> {
  const cfg = await prisma.config.findUnique({ where: { key } });
  return cfg?.value || null;
}

function decrypt(val: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return val;
  const parts = val.split(':');
  if (parts.length !== 3) return val;
  const key = Buffer.from(secret.padEnd(32, '0').slice(0, 32));
  const [ivHex, tagHex, encrypted] = parts;
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
}

async function getTenantToken(): Promise<string | null> {
  const appId = await getConfig('feishu.appId');
  const appSecretRaw = await getConfig('feishu.appSecret');
  if (!appId || !appSecretRaw) return null;

  const appSecret = decrypt(appSecretRaw);
  const resp = await fetch(`${BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = await resp.json();
  return data.tenant_access_token || null;
}

export async function sendReply(chatId: string, text: string): Promise<boolean> {
  try {
    const token = await getTenantToken();
    if (!token) {
      logger.error('[BotReply] No tenant token available');
      return false;
    }

    const resp = await fetch(`${BASE_URL}/im/v1/messages?receive_id_type=chat_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      }),
    });

    const data = await resp.json();
    if (data.code !== 0) {
      logger.error(`[BotReply] Send failed: ${data.msg}`);
      return false;
    }

    logger.info(`[BotReply] Sent reply to ${chatId}`);
    return true;
  } catch (err: any) {
    logger.error(`[BotReply] Error: ${err.message}`);
    return false;
  }
}
```

**Step 2: Commit**

```bash
git add services/feishu-listener/src/bot-reply.ts
git commit -m "feat: add Feishu bot reply capability"
```

---

### Task 18: Integrate bot into message handler

**Files:**
- Modify: `services/feishu-listener/src/message-handler.ts`
- Modify: `services/feishu-listener/src/index.ts`

**Step 1: Add bot message detection to message handler**

In `services/feishu-listener/src/message-handler.ts`, inside the message processing function (where messages are saved to DB), add detection logic:

1. After saving the message, check if it's a bot-directed message:
   - Private chat (chatType === 'private') → always trigger bot
   - Group chat with @Bot mention → trigger bot (detect by checking if content contains the bot's name or ID from config)
2. If triggered, call `processMessage(chatId, content)` from `bot-agent.ts`
3. Send the reply via `sendReply(chatId, replyText)` from `bot-reply.ts`

Add imports at top:
```typescript
import { processMessage } from './bot-agent.js';
import { sendReply } from './bot-reply.js';
```

Add detection logic after the `detectSignals(msg)` call:
```typescript
// Bot message detection
const isBotDirected = msg.chatType === 'private' ||
  (msg.content && (msg.content.includes('@POA') || msg.content.includes('@poa')));

if (isBotDirected && msg.content) {
  // Strip @mention from content
  const cleanContent = msg.content.replace(/@POA\s*/gi, '').trim();
  if (cleanContent) {
    processMessage(msg.chatId, cleanContent)
      .then(reply => sendReply(msg.chatId, reply))
      .catch(err => logger.error(`[Bot] Error: ${err.message}`));
  }
}
```

**Step 2: Update `index.ts` to initialize bot modules**

In `services/feishu-listener/src/index.ts`, add:
```typescript
import { initBotAgent } from './bot-agent.js';
import { initBotReply } from './bot-reply.js';
```

In `main()`, after `initSignalDetector(prisma)`:
```typescript
initBotAgent(prisma);
initBotReply(prisma);
```

**Step 3: Verify compilation**

```bash
cd /Users/allenqiang/poamaster/services/feishu-listener && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add services/feishu-listener/src/message-handler.ts services/feishu-listener/src/index.ts
git commit -m "feat: integrate bot agent into Feishu message handler"
```

---

### Task 19: Configure bot name in settings

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`

**Step 1: Add bot config field**

In the settings page, add a new field `feishu.botName` (default: "POA") in the Feishu section. This is the name that users @mention to trigger the bot. Store in the Config table.

**Step 2: Use bot name in message handler**

In message-handler.ts, read `feishu.botName` from config (with fallback "POA") and use it for @mention detection.

**Step 3: Commit**

```bash
git add app/(dashboard)/settings/page.tsx services/feishu-listener/src/message-handler.ts
git commit -m "feat: add configurable bot name for Feishu bot trigger"
```

---

### Task 20: Restart dev server and verify full integration

**Step 1: Restart Next.js dev server**

After all Prisma model changes, restart the dev server to pick up the new models:
```bash
# Kill existing server if running
lsof -ti:3030 | xargs kill 2>/dev/null
npm exec next dev -- -p 3030 &
```

**Step 2: Verify all pages load**

- `/insights` — priority queue section visible
- `/decisions` — decisions list page loads
- `/assignees/<id>` — profile section visible
- `/todo` — "生成周报" button visible
- `/feishu/pulse` — "记录为决策" button on signal cards

**Step 3: Rebuild feishu-listener**

```bash
cd /Users/allenqiang/poamaster/services/feishu-listener && npm run build
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete COO AI assistant 6-phase implementation"
```
