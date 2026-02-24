# COO Memory & Intelligence System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a three-layer memory system (working/episodic/semantic) that turns the ChatBubble AI into a COO with persistent business understanding, nightly auto-generated briefings, and real-time context injection.

**Architecture:** Nightly cron collects a full-database snapshot, LLM generates episodic narrative + changes + actions, then updates a cumulative semantic memory (core cognition). ChatBubble loads all three layers into Claude CLI's system prompt before every response. A new `/coo-briefing` page displays the daily COO briefing with action items and historical navigation.

**Tech Stack:** Prisma (PostgreSQL), OpenAI GPT-5.2 (nightly generation), Claude Sonnet CLI (chat), node-cron, Next.js App Router, MUI

---

## Task 1: Prisma Schema — Add CooMemoryCore + CooMemoryEpisode models

**Files:**
- Modify: `prisma/schema.prisma` (append after line 902)

**Step 1: Add models to schema**

Append at the end of `prisma/schema.prisma`:

```prisma
// ============================================================
// COO Memory System
// ============================================================

model CooMemoryCore {
  id        String   @id @default(cuid())
  content   String   // Markdown — COO's cumulative business cognition (~2000 chars)
  version   Int      @default(1)
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())
}

model CooMemoryEpisode {
  id        String   @id @default(cuid())
  date      DateTime @unique // One episode per day
  snapshot  String   // Full-database snapshot (JSON string)
  narrative String   // LLM-generated daily narrative (Markdown)
  changes   String   // Day-over-day change detection (Markdown)
  actions   String   // COO recommended actions (Markdown)
  createdAt DateTime @default(now())
}
```

**Step 2: Push schema to database**

Run: `npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema."

**Step 3: Generate client**

Run: `npx prisma generate`
Expected: "✔ Generated Prisma Client"

**Important:** After `prisma generate`, the Next.js dev server must be restarted (kill process on port 3030, then `npm run dev`) due to Turbopack caching old Prisma client.

**Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(coo): add CooMemoryCore and CooMemoryEpisode models"
```

---

## Task 2: Create `lib/coo-memory/collector.ts` — Full-Database Snapshot

**Files:**
- Create: `lib/coo-memory/collector.ts`

**Context:** This module scans the entire database and produces a structured JSON snapshot. It reuses patterns from `lib/insights/collector.ts` but is more comprehensive. The snapshot is stored as a JSON string in `CooMemoryEpisode.snapshot`.

**Step 1: Create the collector module**

Create `lib/coo-memory/collector.ts`:

```typescript
import { prisma } from '@/lib/prisma';

/**
 * Full-database snapshot for COO memory.
 * Collected nightly, stored as JSON in CooMemoryEpisode.snapshot.
 */
export interface CooSnapshot {
  date: string; // YYYY-MM-DD
  tasks: {
    total: number;
    byStatus: Record<string, number>;
    createdToday: number;
    completedToday: number;
    overdueCount: number;
    overdueList: Array<{ title: string; assignee: string; dueDate: string }>;
    byAssignee: Array<{ name: string; total: number; done: number; overdue: number }>;
  };
  decisions: {
    total: number;
    byStatus: Record<string, number>;
    executionRate: number;
    overdueList: Array<{ title: string; madeBy: string; reviewDate: string }>;
  };
  okr: {
    totalObjectives: number;
    activeObjectives: number;
    completedObjectives: number;
    avgKrProgress: number;
    atRiskKrs: Array<{ title: string; objective: string; owner: string; progress: number }>;
  };
  teamPulse: {
    todayMessages: number;
    activeUsers: number;
    avgSentiment: number | null;
    avgResponseTime: number | null;
    peakHour: number | null;
  };
  sentiment: {
    totalReviews: number;
    positive: number;
    neutral: number;
    negative: number;
    avgRating: number | null;
    activeAlerts: number;
    topIssues: string[];
  };
  competitors: {
    trackedCount: number;
    newNews: number;
    newReviews: number;
    webChanges: number;
    activeAlerts: number;
  };
  feishu: {
    todayMessages: number;
    activeChats: number;
    unresolvedSignals: number;
    topChats: Array<{ name: string; count: number }>;
  };
  insights: {
    todayCards: number;
    topicCount: number;
  };
}

export async function collectSnapshot(): Promise<CooSnapshot> {
  const now = new Date();
  const todayStart = new Date(now.toISOString().split('T')[0]);
  const dateStr = now.toISOString().split('T')[0];

  // ---- Tasks ----
  const [
    taskTotal,
    taskStatusGroups,
    taskCreatedToday,
    taskCompletedToday,
    taskOverdueCount,
    taskOverdueList,
    taskAssigneeGroups,
  ] = await Promise.all([
    prisma.task.count(),
    prisma.task.groupBy({ by: ['status'], _count: true }),
    prisma.task.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.task.count({ where: { status: 'DONE', updatedAt: { gte: todayStart } } }),
    prisma.task.count({ where: { status: { not: 'DONE' }, dueDate: { lt: now } } }),
    prisma.task.findMany({
      where: { status: { not: 'DONE' }, dueDate: { lt: now } },
      include: { assignee: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 15,
    }),
    prisma.task.groupBy({
      by: ['assigneeId'],
      _count: true,
      where: { assigneeId: { not: null } },
    }),
  ]);

  const taskByStatus: Record<string, number> = {};
  for (const g of taskStatusGroups) taskByStatus[g.status] = g._count;

  // Resolve assignee task breakdown
  const assigneeIds = taskAssigneeGroups.map((g: any) => g.assigneeId).filter(Boolean) as string[];
  let byAssignee: CooSnapshot['tasks']['byAssignee'] = [];
  if (assigneeIds.length > 0) {
    const [assigneeNames, allAssigneeTasks] = await Promise.all([
      prisma.assignee.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true } }),
      prisma.task.findMany({ where: { assigneeId: { in: assigneeIds } }, select: { assigneeId: true, status: true, dueDate: true } }),
    ]);
    const nameMap = new Map(assigneeNames.map(a => [a.id, a.name]));
    byAssignee = assigneeIds.map(aid => {
      const tasks = allAssigneeTasks.filter(t => t.assigneeId === aid);
      return {
        name: nameMap.get(aid) || '未知',
        total: tasks.length,
        done: tasks.filter(t => t.status === 'DONE').length,
        overdue: tasks.filter(t => t.status !== 'DONE' && t.dueDate && new Date(t.dueDate) < now).length,
      };
    });
  }

  // ---- Decisions ----
  const [decisionStatusGroups, decisionOverdueList] = await Promise.all([
    prisma.decision.groupBy({ by: ['status'], _count: true }),
    prisma.decision.findMany({
      where: { status: { notIn: ['COMPLETED', 'REVISED'] }, reviewDate: { lt: now } },
      take: 10,
      orderBy: { reviewDate: 'asc' },
    }),
  ]);
  const decisionByStatus: Record<string, number> = {};
  for (const g of decisionStatusGroups) decisionByStatus[g.status] = g._count;
  const dTotal = Object.values(decisionByStatus).reduce((a, b) => a + b, 0);
  const dCompleted = decisionByStatus['COMPLETED'] || 0;
  const dRevised = decisionByStatus['REVISED'] || 0;
  const dDenom = dTotal - dRevised;
  const executionRate = dDenom > 0 ? Math.round((dCompleted / dDenom) * 100) : 0;

  // ---- OKR ----
  const [objectives, activeKRs] = await Promise.all([
    prisma.objective.groupBy({ by: ['status'], _count: true }),
    prisma.keyResult.findMany({
      where: { objective: { status: 'ACTIVE' }, targetValue: { gt: 0 } },
      include: { owner: { select: { name: true } }, objective: { select: { title: true } } },
    }),
  ]);
  const objByStatus: Record<string, number> = {};
  for (const g of objectives) objByStatus[g.status] = g._count;
  const totalObj = Object.values(objByStatus).reduce((a, b) => a + b, 0);
  const activeObj = objByStatus['ACTIVE'] || 0;
  const completedObj = objByStatus['COMPLETED'] || 0;
  const krProgresses = activeKRs.map(kr => kr.currentValue / kr.targetValue);
  const avgKrProgress = krProgresses.length > 0
    ? Math.round((krProgresses.reduce((a, b) => a + b, 0) / krProgresses.length) * 100)
    : 0;
  const atRiskKrs = activeKRs
    .filter(kr => (kr.currentValue / kr.targetValue) < 0.5)
    .slice(0, 10)
    .map(kr => ({
      title: kr.title,
      objective: kr.objective.title,
      owner: kr.owner?.name || '未指定',
      progress: Math.round((kr.currentValue / kr.targetValue) * 100),
    }));

  // ---- Team Pulse ----
  const latestPulse = await prisma.teamPulse.findFirst({
    where: { date: { gte: todayStart } },
    orderBy: { date: 'desc' },
  });

  // ---- Sentiment ----
  const [sentimentToday, sentimentAlerts] = await Promise.all([
    prisma.sentimentReview.findMany({
      where: { collectedAt: { gte: todayStart } },
      select: { sentimentLabel: true, rating: true, keyIssues: true },
    }),
    prisma.sentimentAlert.count({ where: { resolvedAt: null } }),
  ]);
  const sentPositive = sentimentToday.filter(r => r.sentimentLabel === 'POSITIVE').length;
  const sentNeutral = sentimentToday.filter(r => r.sentimentLabel === 'NEUTRAL').length;
  const sentNegative = sentimentToday.filter(r => r.sentimentLabel === 'NEGATIVE').length;
  const sentRatings = sentimentToday.filter(r => r.rating != null).map(r => r.rating!);
  const sentAvgRating = sentRatings.length > 0
    ? Math.round((sentRatings.reduce((a, b) => a + b, 0) / sentRatings.length) * 10) / 10
    : null;
  const issueMap = new Map<string, number>();
  for (const r of sentimentToday) {
    for (const tag of (r.keyIssues as string[] || [])) {
      issueMap.set(tag, (issueMap.get(tag) || 0) + 1);
    }
  }
  const sentTopIssues = Array.from(issueMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  // ---- Competitors ----
  const [compCount, compNews, compReviews, compWebChanges, compAlerts] = await Promise.all([
    prisma.competitor.count({ where: { enabled: true } }),
    prisma.competitorNews.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.competitorReview.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.competitorWebChange.count({ where: { createdAt: { gte: todayStart }, changeType: { not: 'baseline' } } }),
    prisma.competitorAlert.count({ where: { createdAt: { gte: todayStart } } }),
  ]);

  // ---- Feishu ----
  const [feishuMsgCount, feishuActiveChats, feishuSignals, feishuTopChats] = await Promise.all([
    prisma.feishuMessage.count({ where: { timestamp: { gte: todayStart } } }),
    prisma.feishuMessage.groupBy({
      by: ['chatId'],
      where: { timestamp: { gte: todayStart } },
      _count: { id: true },
    }).then(groups => groups.length),
    prisma.chatSignal.count({ where: { isResolved: false } }),
    prisma.feishuMessage.groupBy({
      by: ['chatId'],
      where: { timestamp: { gte: todayStart } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    }),
  ]);
  // Resolve chat names
  const chatIds = feishuTopChats.map(c => c.chatId);
  const chatNames = chatIds.length > 0
    ? await prisma.feishuChat.findMany({ where: { chatId: { in: chatIds } }, select: { chatId: true, name: true } })
    : [];
  const chatNameMap = new Map(chatNames.map(c => [c.chatId, c.name || c.chatId]));

  // ---- Insights ----
  const [insightCards, topicCount] = await Promise.all([
    prisma.insightCard.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.insightTopic.count({ where: { isPaused: false } }),
  ]);

  return {
    date: dateStr,
    tasks: {
      total: taskTotal,
      byStatus: taskByStatus,
      createdToday: taskCreatedToday,
      completedToday: taskCompletedToday,
      overdueCount: taskOverdueCount,
      overdueList: taskOverdueList.map(t => ({
        title: t.title,
        assignee: t.assignee?.name || '未分配',
        dueDate: t.dueDate?.toISOString().split('T')[0] || '',
      })),
      byAssignee,
    },
    decisions: {
      total: dTotal,
      byStatus: decisionByStatus,
      executionRate,
      overdueList: decisionOverdueList.map(d => ({
        title: d.title,
        madeBy: d.madeBy || '未指定',
        reviewDate: d.reviewDate?.toISOString().split('T')[0] || '',
      })),
    },
    okr: {
      totalObjectives: totalObj,
      activeObjectives: activeObj,
      completedObjectives: completedObj,
      avgKrProgress,
      atRiskKrs,
    },
    teamPulse: {
      todayMessages: latestPulse?.messageCount || 0,
      activeUsers: latestPulse?.activeUserCount || 0,
      avgSentiment: latestPulse?.sentimentScore || null,
      avgResponseTime: latestPulse?.avgResponseTime || null,
      peakHour: latestPulse?.peakHour || null,
    },
    sentiment: {
      totalReviews: sentimentToday.length,
      positive: sentPositive,
      neutral: sentNeutral,
      negative: sentNegative,
      avgRating: sentAvgRating,
      activeAlerts: sentimentAlerts,
      topIssues: sentTopIssues,
    },
    competitors: {
      trackedCount: compCount,
      newNews: compNews,
      newReviews: compReviews,
      webChanges: compWebChanges,
      activeAlerts: compAlerts,
    },
    feishu: {
      todayMessages: feishuMsgCount,
      activeChats: feishuActiveChats,
      unresolvedSignals: feishuSignals,
      topChats: feishuTopChats.map(c => ({
        name: chatNameMap.get(c.chatId) || c.chatId,
        count: c._count.id,
      })),
    },
    insights: {
      todayCards: insightCards,
      topicCount,
    },
  };
}
```

**Step 2: Commit**

```bash
git add lib/coo-memory/collector.ts
git commit -m "feat(coo): add full-database snapshot collector"
```

---

## Task 3: Create `lib/coo-memory/narrator.ts` — LLM Narrative + Changes + Actions

**Files:**
- Create: `lib/coo-memory/narrator.ts`

**Context:** This module takes today's snapshot (and optionally yesterday's), calls GPT to generate three outputs: a narrative of what happened today, a changes analysis vs yesterday, and COO action recommendations. Uses `getOpenAIClient()` and `getOpenAIModel()` from `lib/openai.ts`.

**Step 1: Create the narrator module**

Create `lib/coo-memory/narrator.ts`:

```typescript
import { prisma } from '@/lib/prisma';
import { getOpenAIClient, getOpenAIModel } from '@/lib/openai';
import type { CooSnapshot } from './collector';

const COO_MODEL = 'gpt-5.2';

/**
 * Generate daily narrative, changes detection, and action items from snapshot.
 */
export async function generateNarrative(
  snapshot: CooSnapshot
): Promise<{ narrative: string; changes: string; actions: string }> {
  const client = await getOpenAIClient();

  // Fetch yesterday's episode for comparison
  const yesterday = new Date(snapshot.date);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDate = new Date(yesterday.toISOString().split('T')[0]);

  const yesterdayEpisode = await prisma.cooMemoryEpisode.findUnique({
    where: { date: yesterdayDate },
    select: { snapshot: true, narrative: true },
  });

  const yesterdaySnapshot = yesterdayEpisode?.snapshot
    ? JSON.parse(yesterdayEpisode.snapshot) as CooSnapshot
    : null;

  // --- Step 1: Generate narrative + changes ---
  const narrativePrompt = buildNarrativePrompt(snapshot, yesterdaySnapshot);

  const narrativeResponse = await client.chat.completions.create({
    model: COO_MODEL,
    messages: [
      {
        role: 'system',
        content: `你是一位世界一流的 COO（首席运营官）。你每天晚上回顾一天的业务数据，以专业、深刻、有洞察力的方式撰写当日复盘。

你的输出必须是严格 JSON 格式：
{
  "narrative": "Markdown 格式的当日叙事（300-500字）。描述今天发生了什么，哪些进展值得关注，哪些地方出现了风险。用数据说话，避免空泛陈述。",
  "changes": "Markdown 格式的变化检测（200-300字）。与昨日数据对比，哪些指标上升了，哪些下降了，是否有异常变化。如果没有昨日数据，写'首次记录，暂无历史对比。'"
}`,
      },
      { role: 'user', content: narrativePrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.4,
    max_completion_tokens: 2000,
  });

  const narrativeContent = narrativeResponse.choices[0]?.message?.content || '{}';
  const narrativeParsed = JSON.parse(narrativeContent);

  // --- Step 2: Generate action items ---
  const actionsResponse = await client.chat.completions.create({
    model: COO_MODEL,
    messages: [
      {
        role: 'system',
        content: `你是行业前 1% 的 COO。根据今天的业务数据和变化分析，给出 3-5 条最重要的行动建议。

每条建议必须：
1. 有明确的行动主体和时间要求
2. 基于数据和事实，不是空话
3. 按紧急程度排序（最紧急的排最前）

输出 Markdown 格式，使用编号列表。每条建议用 **加粗** 标注核心行动，后面跟原因说明。
例如：
1. **今天安排与张三 1:1，讨论他的 3 个逾期任务** — 张三逾期率 40%，团队最高，需要了解阻塞原因。`,
      },
      {
        role: 'user',
        content: `今日业务数据：\n${JSON.stringify(snapshot, null, 2)}\n\n今日变化分析：\n${narrativeParsed.changes || '无'}\n\n请给出行动建议。`,
      },
    ],
    temperature: 0.4,
    max_completion_tokens: 1000,
  });

  const actions = actionsResponse.choices[0]?.message?.content || '暂无行动建议。';

  return {
    narrative: narrativeParsed.narrative || '当日数据采集完成，暂无叙事。',
    changes: narrativeParsed.changes || '首次记录，暂无历史对比。',
    actions,
  };
}

function buildNarrativePrompt(today: CooSnapshot, yesterday: CooSnapshot | null): string {
  let prompt = `## 今日业务数据（${today.date}）\n\n`;

  // Tasks
  prompt += `### 任务\n`;
  prompt += `- 总任务数：${today.tasks.total}\n`;
  prompt += `- 状态分布：${Object.entries(today.tasks.byStatus).map(([k, v]) => `${k}: ${v}`).join(', ')}\n`;
  prompt += `- 今日新增：${today.tasks.createdToday}，完成：${today.tasks.completedToday}\n`;
  prompt += `- 逾期任务：${today.tasks.overdueCount} 个\n`;
  if (today.tasks.overdueList.length > 0) {
    prompt += `- 逾期明细：\n${today.tasks.overdueList.map(t => `  - ${t.title}（${t.assignee}，截止 ${t.dueDate}）`).join('\n')}\n`;
  }
  if (today.tasks.byAssignee.length > 0) {
    prompt += `- 按负责人：\n${today.tasks.byAssignee.map(a => `  - ${a.name}：总${a.total}/完成${a.done}/逾期${a.overdue}`).join('\n')}\n`;
  }

  // Decisions
  prompt += `\n### 决策\n`;
  prompt += `- 总数：${today.decisions.total}\n`;
  prompt += `- 状态分布：${Object.entries(today.decisions.byStatus).map(([k, v]) => `${k}: ${v}`).join(', ')}\n`;
  prompt += `- 执行率：${today.decisions.executionRate}%\n`;
  if (today.decisions.overdueList.length > 0) {
    prompt += `- 逾期决策：\n${today.decisions.overdueList.map(d => `  - ${d.title}（${d.madeBy}，复查日期 ${d.reviewDate}）`).join('\n')}\n`;
  }

  // OKR
  prompt += `\n### OKR\n`;
  prompt += `- 目标总数：${today.okr.totalObjectives}（活跃 ${today.okr.activeObjectives}，已完成 ${today.okr.completedObjectives}）\n`;
  prompt += `- KR 平均进度：${today.okr.avgKrProgress}%\n`;
  if (today.okr.atRiskKrs.length > 0) {
    prompt += `- 风险 KR：\n${today.okr.atRiskKrs.map(kr => `  - ${kr.title}（目标：${kr.objective}，负责人：${kr.owner}，进度 ${kr.progress}%）`).join('\n')}\n`;
  }

  // Team Pulse
  prompt += `\n### 团队脉搏\n`;
  prompt += `- 今日消息量：${today.teamPulse.todayMessages}\n`;
  prompt += `- 活跃用户：${today.teamPulse.activeUsers}\n`;
  if (today.teamPulse.avgSentiment !== null) prompt += `- 情绪评分：${today.teamPulse.avgSentiment}\n`;
  if (today.teamPulse.avgResponseTime !== null) prompt += `- 平均响应时间：${today.teamPulse.avgResponseTime}分钟\n`;

  // Sentiment
  prompt += `\n### 舆情\n`;
  prompt += `- 今日评论：${today.sentiment.totalReviews}（正面 ${today.sentiment.positive}/中性 ${today.sentiment.neutral}/负面 ${today.sentiment.negative}）\n`;
  if (today.sentiment.avgRating !== null) prompt += `- 平均评分：${today.sentiment.avgRating}\n`;
  prompt += `- 活跃警报：${today.sentiment.activeAlerts}\n`;
  if (today.sentiment.topIssues.length > 0) prompt += `- 主要问题：${today.sentiment.topIssues.join('、')}\n`;

  // Competitors
  prompt += `\n### 竞品\n`;
  prompt += `- 监控竞品：${today.competitors.trackedCount} 家\n`;
  prompt += `- 今日新闻：${today.competitors.newNews}，新评论：${today.competitors.newReviews}，网站变化：${today.competitors.webChanges}\n`;

  // Feishu
  prompt += `\n### 飞书\n`;
  prompt += `- 今日消息：${today.feishu.todayMessages}，活跃群组：${today.feishu.activeChats}\n`;
  prompt += `- 未解决信号：${today.feishu.unresolvedSignals}\n`;
  if (today.feishu.topChats.length > 0) {
    prompt += `- 最活跃群组：${today.feishu.topChats.map(c => `${c.name}(${c.count}条)`).join('、')}\n`;
  }

  // Insights
  prompt += `\n### 洞察\n`;
  prompt += `- 今日生成卡片：${today.insights.todayCards}，监控话题数：${today.insights.topicCount}\n`;

  // Yesterday comparison
  if (yesterday) {
    prompt += `\n---\n## 昨日数据对比（${yesterday.date}）\n`;
    prompt += `- 任务总数：${yesterday.tasks.total}（今日 ${today.tasks.total}）\n`;
    prompt += `- 昨日完成：${yesterday.tasks.completedToday}（今日 ${today.tasks.completedToday}）\n`;
    prompt += `- 昨日逾期：${yesterday.tasks.overdueCount}（今日 ${today.tasks.overdueCount}）\n`;
    prompt += `- 昨日决策执行率：${yesterday.decisions.executionRate}%（今日 ${today.decisions.executionRate}%）\n`;
    prompt += `- 昨日 KR 平均进度：${yesterday.okr.avgKrProgress}%（今日 ${today.okr.avgKrProgress}%）\n`;
    prompt += `- 昨日飞书消息：${yesterday.feishu.todayMessages}（今日 ${today.feishu.todayMessages}）\n`;
  } else {
    prompt += `\n---\n（首次记录，无昨日数据对比）\n`;
  }

  prompt += `\n请基于以上数据撰写今日复盘叙事和变化分析。`;

  return prompt;
}
```

**Step 2: Commit**

```bash
git add lib/coo-memory/narrator.ts
git commit -m "feat(coo): add LLM-powered narrator for daily narrative + changes + actions"
```

---

## Task 4: Create `lib/coo-memory/core-updater.ts` — Semantic Memory Updater

**Files:**
- Create: `lib/coo-memory/core-updater.ts`

**Context:** This module reads the existing `CooMemoryCore` (the cumulative business cognition) and today's episodic narrative, then uses LLM to merge them into an updated core memory. The core memory is the COO's persistent understanding of the company.

**Step 1: Create the core-updater module**

Create `lib/coo-memory/core-updater.ts`:

```typescript
import { prisma } from '@/lib/prisma';
import { getOpenAIClient } from '@/lib/openai';

const COO_MODEL = 'gpt-5.2';

/**
 * Update the COO's semantic memory (core cognition) by merging
 * today's narrative with the existing understanding.
 */
export async function updateCoreMemory(
  narrative: string,
  changes: string,
  actions: string,
): Promise<void> {
  console.log('[COO Memory] Updating core memory...');

  const client = await getOpenAIClient();

  // Fetch current core memory
  const current = await prisma.cooMemoryCore.findFirst({
    orderBy: { version: 'desc' },
  });

  const currentContent = current?.content || '（初始状态，尚无历史认知）';
  const currentVersion = current?.version || 0;

  const response = await client.chat.completions.create({
    model: COO_MODEL,
    messages: [
      {
        role: 'system',
        content: `你是一位世界顶级的 COO。你维护着一份对公司业务的持续认知文档——这是你的"长期记忆"。

每天晚上，你会根据当天发生的事情更新这份认知。

更新原则：
1. **保留仍然正确的认知**——不要删掉仍然有效的信息
2. **修正已过时的认知**——如果今天的数据证明之前的判断不再正确，更新它
3. **添加新的认知**——今天的叙事中有哪些新的理解值得长期记住
4. **删除不再相关的内容**——清理已经解决的问题或不再重要的信息
5. **保持结构清晰**——使用 Markdown 标题组织内容
6. **控制总长度在 1500-2500 字**——这是你的工作记忆容量，太长会影响效率

建议的结构：
## 公司概况
## 团队画像
## 当前业务状态
## 关键趋势
## 主要风险
## 经验教训`,
      },
      {
        role: 'user',
        content: `## 当前认知（版本 ${currentVersion}）\n\n${currentContent}\n\n---\n\n## 今天发生了什么\n\n${narrative}\n\n## 今天的变化\n\n${changes}\n\n## 今天的行动建议\n\n${actions}\n\n---\n\n请根据今天的信息更新你的认知文档。直接输出更新后的完整 Markdown 内容，不要包含任何解释。`,
      },
    ],
    temperature: 0.3,
    max_completion_tokens: 3000,
  });

  const updatedContent = response.choices[0]?.message?.content;
  if (!updatedContent) {
    console.error('[COO Memory] LLM returned empty response for core memory update');
    return;
  }

  // Upsert: if core record exists, update it; otherwise create new
  if (current) {
    await prisma.cooMemoryCore.update({
      where: { id: current.id },
      data: {
        content: updatedContent,
        version: currentVersion + 1,
      },
    });
  } else {
    await prisma.cooMemoryCore.create({
      data: {
        content: updatedContent,
        version: 1,
      },
    });
  }

  console.log(`[COO Memory] Core memory updated to version ${currentVersion + 1}`);
}
```

**Step 2: Commit**

```bash
git add lib/coo-memory/core-updater.ts
git commit -m "feat(coo): add semantic memory updater (core cognition)"
```

---

## Task 5: Create `lib/coo-memory/loader.ts` — Memory Loader for ChatBubble

**Files:**
- Create: `lib/coo-memory/loader.ts`

**Context:** This module loads all three memory layers and assembles them into an enhanced system prompt for Claude CLI. Called by `claude-worker.ts` before each chat job.

**Step 1: Create the loader module**

Create `lib/coo-memory/loader.ts`:

```typescript
import { prisma } from '@/lib/prisma';

/**
 * Load all three memory layers and assemble into an enhanced system prompt.
 * Called before each Claude CLI chat job.
 */
export async function loadCooSystemPrompt(): Promise<string> {
  // Layer 3: Semantic memory (core cognition)
  const core = await prisma.cooMemoryCore.findFirst({
    orderBy: { version: 'desc' },
    select: { content: true },
  });

  // Layer 2: Recent episodic memories (last 3 days)
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const episodes = await prisma.cooMemoryEpisode.findMany({
    where: { date: { gte: threeDaysAgo } },
    orderBy: { date: 'desc' },
    select: { date: true, narrative: true, actions: true },
    take: 3,
  });

  // Layer 1: Working memory (real-time urgent data)
  const now = new Date();
  const [overdueCount, atRiskKRs, todayDecisions, unresolvedSignals] = await Promise.all([
    prisma.task.count({ where: { status: { not: 'DONE' }, dueDate: { lt: now } } }),
    prisma.keyResult.count({
      where: {
        objective: { status: 'ACTIVE' },
        targetValue: { gt: 0 },
      },
    }).then(async () => {
      const krs = await prisma.keyResult.findMany({
        where: { objective: { status: 'ACTIVE' }, targetValue: { gt: 0 } },
        select: { currentValue: true, targetValue: true },
      });
      return krs.filter(kr => (kr.currentValue / kr.targetValue) < 0.5).length;
    }),
    prisma.decision.count({
      where: { createdAt: { gte: new Date(now.toISOString().split('T')[0]) } },
    }),
    prisma.chatSignal.count({ where: { isResolved: false, severity: { in: ['HIGH', 'CRITICAL'] } } }),
  ]);

  // Assemble system prompt
  let prompt = `你是 POA Master 的 COO AI 助手。你拥有对公司业务的深度理解和持续记忆。以行业前 1% COO 的专业水准回答用户的问题。提供深度分析、风险预警、和可执行的建议。用中文回答。\n\n`;

  // Core cognition
  if (core?.content) {
    prompt += `## 你对公司的认知\n\n${core.content}\n\n`;
  }

  // Recent episodes
  if (episodes.length > 0) {
    prompt += `## 最近发生的事\n\n`;
    for (const ep of episodes) {
      const dateStr = ep.date.toISOString().split('T')[0];
      prompt += `### ${dateStr}\n${ep.narrative}\n\n`;
      if (ep.actions) {
        prompt += `**当日建议行动：**\n${ep.actions}\n\n`;
      }
    }
  }

  // Real-time working memory
  prompt += `## 实时数据\n`;
  prompt += `- 逾期任务：${overdueCount} 个\n`;
  prompt += `- 风险 KR（进度 <50%）：${atRiskKRs} 个\n`;
  prompt += `- 今日新增决策：${todayDecisions} 个\n`;
  prompt += `- 未解决高危信号：${unresolvedSignals} 个\n`;

  return prompt;
}
```

**Step 2: Commit**

```bash
git add lib/coo-memory/loader.ts
git commit -m "feat(coo): add three-layer memory loader for ChatBubble"
```

---

## Task 6: Modify `lib/claude-worker.ts` — Inject COO Memory into System Prompt

**Files:**
- Modify: `lib/claude-worker.ts`

**Context:** Replace the static `SYSTEM_PROMPT` with a dynamic one that loads COO memory. The `processJob()` function must call `loadCooSystemPrompt()` and use the result as the system prompt for Claude CLI.

**Step 1: Add import and modify processJob**

At the top of `lib/claude-worker.ts`, add import:

```typescript
import { loadCooSystemPrompt } from '@/lib/coo-memory/loader';
```

Change the `SYSTEM_PROMPT` constant to a fallback:

```typescript
const FALLBACK_SYSTEM_PROMPT =
  '你是 POA Master 的 AI 助手。直接回答用户的问题，不要使用 AskUserQuestion 工具，不要反问用户。如果信息不足，做出合理假设后直接给出答案。用中文回答。';
```

In `processJob()`, before building CLI args (after the "Mark message as processing" step), add system prompt loading:

```typescript
  // Load COO memory-enhanced system prompt
  let systemPrompt = FALLBACK_SYSTEM_PROMPT;
  try {
    systemPrompt = await loadCooSystemPrompt();
  } catch (err) {
    console.warn('[claude-worker] Failed to load COO memory, using fallback:', err);
  }
```

Then in the `baseArgs` array, replace the reference to `SYSTEM_PROMPT` with `systemPrompt`:

```typescript
  const baseArgs = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--max-turns', MAX_TURNS,
    '--model', DEFAULT_MODEL,
    '--append-system-prompt', systemPrompt,
    '--permission-mode', 'bypassPermissions',
  ];
```

**Step 2: Commit**

```bash
git add lib/claude-worker.ts
git commit -m "feat(coo): inject COO memory into ChatBubble system prompt"
```

---

## Task 7: Create `lib/coo-memory/scheduler.ts` — Nightly COO Memory Pipeline

**Files:**
- Create: `lib/coo-memory/scheduler.ts`

**Context:** This orchestrates the nightly memory generation pipeline. It's called from the existing `lib/insights/scheduler.ts` before the insight jobs.

**Step 1: Create the scheduler module**

Create `lib/coo-memory/scheduler.ts`:

```typescript
import { prisma } from '@/lib/prisma';
import { collectSnapshot } from './collector';
import { generateNarrative } from './narrator';
import { updateCoreMemory } from './core-updater';

/**
 * Run the full COO memory generation pipeline.
 * Called nightly before the insight briefing pipeline.
 *
 * Steps:
 * 1. Collect full-database snapshot
 * 2. Generate narrative + changes + actions via LLM
 * 3. Store episodic memory
 * 4. Update core (semantic) memory
 */
export async function runCooMemoryPipeline(): Promise<void> {
  console.log('[COO Memory] Starting nightly memory pipeline...');

  try {
    // Step 1: Collect snapshot
    console.log('[COO Memory] Step 1: Collecting snapshot...');
    const snapshot = await collectSnapshot();
    console.log(`[COO Memory] Snapshot collected for ${snapshot.date}`);

    // Step 2: Generate narrative, changes, actions
    console.log('[COO Memory] Step 2: Generating narrative...');
    const { narrative, changes, actions } = await generateNarrative(snapshot);
    console.log('[COO Memory] Narrative generated');

    // Step 3: Store episodic memory
    console.log('[COO Memory] Step 3: Storing episodic memory...');
    const todayDate = new Date(snapshot.date);
    await prisma.cooMemoryEpisode.upsert({
      where: { date: todayDate },
      create: {
        date: todayDate,
        snapshot: JSON.stringify(snapshot),
        narrative,
        changes,
        actions,
      },
      update: {
        snapshot: JSON.stringify(snapshot),
        narrative,
        changes,
        actions,
      },
    });
    console.log('[COO Memory] Episodic memory stored');

    // Step 4: Update core memory
    console.log('[COO Memory] Step 4: Updating core memory...');
    await updateCoreMemory(narrative, changes, actions);
    console.log('[COO Memory] Core memory updated');

    console.log('[COO Memory] Nightly pipeline complete');
  } catch (error) {
    console.error('[COO Memory] Pipeline failed:', error);
    throw error;
  }
}
```

**Step 2: Commit**

```bash
git add lib/coo-memory/scheduler.ts
git commit -m "feat(coo): add nightly COO memory generation pipeline"
```

---

## Task 8: Modify `lib/insights/scheduler.ts` — Integrate COO Memory Job

**Files:**
- Modify: `lib/insights/scheduler.ts`

**Context:** Add a 21:50 cron job for COO memory generation before the existing 22:00 keyword generation.

**Step 1: Add the COO memory cron job**

Add import at top of `lib/insights/scheduler.ts`:

```typescript
import { runCooMemoryPipeline } from '@/lib/coo-memory/scheduler';
```

Add a new variable for the cron job after the existing declarations:

```typescript
let cooMemoryJob: ScheduledTask | null = null;
```

In `startScheduler()`, add the COO memory job before the keyword generation job:

```typescript
  // 21:50 — COO memory generation
  cooMemoryJob = cron.schedule('50 21 * * *', async () => {
    console.log('[Scheduler] 21:50 — Starting COO memory pipeline');
    try {
      await runCooMemoryPipeline();
      console.log('[Scheduler] COO memory pipeline complete');
    } catch (error) {
      console.error('[Scheduler] COO memory pipeline failed:', error);
    }
  });
```

Update the final console.log to mention the new job:

```typescript
  console.log('[Scheduler] Insight pipeline scheduler started (21:50 COO memory, 22:00 keywords, 22:05 briefing)');
```

In `stopScheduler()`, add cleanup for the new job:

```typescript
  if (cooMemoryJob) {
    cooMemoryJob.stop();
    cooMemoryJob = null;
  }
```

**Step 2: Commit**

```bash
git add lib/insights/scheduler.ts
git commit -m "feat(coo): add 21:50 COO memory cron job to scheduler"
```

---

## Task 9: Create API Routes — COO Memory & Briefing

**Files:**
- Create: `app/api/coo/memory/route.ts`
- Create: `app/api/coo/memory/generate/route.ts`
- Create: `app/api/coo/briefing/route.ts`

**Context:** Three API routes: GET current memory state, POST manual generation trigger, GET COO briefing data. All follow the existing auth pattern: cookie → `verifySession()` → Prisma → JSON.

**Step 1: Create GET `/api/coo/memory` — Current memory state**

Create `app/api/coo/memory/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = await verifySession(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const [core, latestEpisode, episodeCount] = await Promise.all([
      prisma.cooMemoryCore.findFirst({ orderBy: { version: 'desc' } }),
      prisma.cooMemoryEpisode.findFirst({ orderBy: { date: 'desc' } }),
      prisma.cooMemoryEpisode.count(),
    ]);

    return NextResponse.json({
      core: core ? { version: core.version, updatedAt: core.updatedAt, contentLength: core.content.length } : null,
      latestEpisode: latestEpisode ? { date: latestEpisode.date, createdAt: latestEpisode.createdAt } : null,
      totalEpisodes: episodeCount,
    });
  } catch (error) {
    console.error('[COO API] Failed to fetch memory state:', error);
    return NextResponse.json({ error: 'Failed to fetch memory state' }, { status: 500 });
  }
}
```

**Step 2: Create POST `/api/coo/memory/generate` — Manual trigger**

Create `app/api/coo/memory/generate/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { runCooMemoryPipeline } from '@/lib/coo-memory/scheduler';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = await verifySession(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    await runCooMemoryPipeline();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[COO API] Memory generation failed:', error);
    return NextResponse.json({ error: 'Memory generation failed' }, { status: 500 });
  }
}
```

**Step 3: Create GET `/api/coo/briefing` — COO briefing data**

Create `app/api/coo/briefing/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = await verifySession(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');

    let targetDate: Date;
    if (dateParam) {
      targetDate = new Date(dateParam);
      if (isNaN(targetDate.getTime())) {
        return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD.' }, { status: 400 });
      }
      targetDate = new Date(targetDate.toISOString().split('T')[0]);
    } else {
      targetDate = new Date(new Date().toISOString().split('T')[0]);
    }

    const episode = await prisma.cooMemoryEpisode.findUnique({
      where: { date: targetDate },
    });

    const core = await prisma.cooMemoryCore.findFirst({
      orderBy: { version: 'desc' },
      select: { content: true, version: true, updatedAt: true },
    });

    // Find available dates for navigation
    const availableDates = await prisma.cooMemoryEpisode.findMany({
      select: { date: true },
      orderBy: { date: 'desc' },
      take: 30,
    });

    return NextResponse.json({
      episode: episode ? {
        date: episode.date,
        narrative: episode.narrative,
        changes: episode.changes,
        actions: episode.actions,
        snapshot: JSON.parse(episode.snapshot),
      } : null,
      core: core ? { content: core.content, version: core.version, updatedAt: core.updatedAt } : null,
      availableDates: availableDates.map(d => d.date.toISOString().split('T')[0]),
    });
  } catch (error) {
    console.error('[COO API] Failed to fetch briefing:', error);
    return NextResponse.json({ error: 'Failed to fetch briefing' }, { status: 500 });
  }
}
```

**Step 4: Commit**

```bash
git add app/api/coo/memory/route.ts app/api/coo/memory/generate/route.ts app/api/coo/briefing/route.ts
git commit -m "feat(coo): add COO memory and briefing API routes"
```

---

## Task 10: Create `/coo-briefing` Page — COO Briefing Dashboard

**Files:**
- Create: `app/(dashboard)/coo-briefing/page.tsx`

**Context:** Full-page COO briefing dashboard. Uses MUI components, `designTokens as dt` from `@/lib/theme`, fetches from `/api/coo/briefing`. Pattern matches existing pages like `app/(dashboard)/insights/page.tsx`.

**Step 1: Create the page**

Create `app/(dashboard)/coo-briefing/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Chip,
  Alert,
  IconButton,
  Tooltip,
  Grid,
  Divider,
  Card,
  CardContent,
} from '@mui/material';
import {
  Psychology as BrainIcon,
  CalendarToday as CalendarIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
  Refresh as RefreshIcon,
  TrendingUp as TrendIcon,
  Assignment as ActionIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { designTokens as dt } from '@/lib/theme';
import ReactMarkdown from 'react-markdown';

interface CooSnapshot {
  date: string;
  tasks: { total: number; byStatus: Record<string, number>; createdToday: number; completedToday: number; overdueCount: number };
  decisions: { total: number; executionRate: number; overdueList: Array<{ title: string }> };
  okr: { totalObjectives: number; avgKrProgress: number; atRiskKrs: Array<{ title: string; progress: number }> };
  teamPulse: { todayMessages: number; activeUsers: number };
  sentiment: { totalReviews: number; positive: number; negative: number; activeAlerts: number };
  competitors: { newNews: number; newReviews: number };
  feishu: { todayMessages: number; activeChats: number; unresolvedSignals: number };
}

interface BriefingData {
  episode: {
    date: string;
    narrative: string;
    changes: string;
    actions: string;
    snapshot: CooSnapshot;
  } | null;
  core: {
    content: string;
    version: number;
    updatedAt: string;
  } | null;
  availableDates: string[];
}

export default function CooBriefingPage() {
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [showCore, setShowCore] = useState(false);

  const fetchBriefing = async (date?: string) => {
    setLoading(true);
    try {
      const url = date ? `/api/coo/briefing?date=${date}` : '/api/coo/briefing';
      const res = await fetch(url);
      const json = await res.json();
      setData(json);
      if (json.episode) {
        setSelectedDate(json.episode.date.split('T')[0]);
      } else if (json.availableDates?.length > 0) {
        setSelectedDate(json.availableDates[0]);
      }
    } catch (err) {
      console.error('Failed to fetch briefing:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBriefing(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await fetch('/api/coo/memory/generate', { method: 'POST' });
      await fetchBriefing();
    } catch (err) {
      console.error('Generation failed:', err);
    } finally {
      setGenerating(false);
    }
  };

  const navigateDate = (direction: number) => {
    if (!data?.availableDates) return;
    const idx = data.availableDates.indexOf(selectedDate);
    const newIdx = idx + direction;
    if (newIdx >= 0 && newIdx < data.availableDates.length) {
      const newDate = data.availableDates[newIdx];
      setSelectedDate(newDate);
      fetchBriefing(newDate);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  const episode = data?.episode;
  const snapshot = episode?.snapshot;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', py: 3, px: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BrainIcon sx={{ fontSize: 28, color: dt.primary.main }} />
          <Typography variant="h5" fontWeight={700}>COO 智能简报</Typography>
          {data?.core && (
            <Chip
              label={`认知 v${data.core.version}`}
              size="small"
              sx={{ bgcolor: dt.primary.main, color: '#fff' }}
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Tooltip title="上一天">
            <span>
              <IconButton
                onClick={() => navigateDate(1)}
                disabled={!data?.availableDates || data.availableDates.indexOf(selectedDate) >= data.availableDates.length - 1}
              >
                <PrevIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Chip icon={<CalendarIcon />} label={selectedDate || '暂无数据'} variant="outlined" />
          <Tooltip title="下一天">
            <span>
              <IconButton
                onClick={() => navigateDate(-1)}
                disabled={!data?.availableDates || data.availableDates.indexOf(selectedDate) <= 0}
              >
                <NextIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ViewIcon />}
            onClick={() => setShowCore(!showCore)}
          >
            {showCore ? '隐藏认知' : '查看认知'}
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={generating ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? '生成中...' : '立即生成'}
          </Button>
        </Box>
      </Box>

      {!episode && (
        <Alert severity="info" sx={{ mb: 3 }}>
          今日尚未生成 COO 简报。点击"立即生成"手动触发，或等待每晚 21:50 自动生成。
        </Alert>
      )}

      {/* Core Memory Panel */}
      {showCore && data?.core && (
        <Paper sx={{ p: 3, mb: 3, bgcolor: dt.bg.secondary, border: `1px solid ${dt.border.default}` }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BrainIcon /> COO 认知模型
            <Chip label={`v${data.core.version}`} size="small" />
          </Typography>
          <Box sx={{ '& h2': { fontSize: '1.1rem', mt: 2 }, '& ul': { pl: 2 }, '& li': { mb: 0.5 } }}>
            <ReactMarkdown>{data.core.content}</ReactMarkdown>
          </Box>
        </Paper>
      )}

      {episode && snapshot && (
        <>
          {/* KPI Cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {[
              { label: '任务总数', value: snapshot.tasks.total, sub: `完成 ${snapshot.tasks.completedToday} | 逾期 ${snapshot.tasks.overdueCount}` },
              { label: '决策执行率', value: `${snapshot.decisions.executionRate}%`, sub: `总 ${snapshot.decisions.total} 个决策` },
              { label: 'OKR 进度', value: `${snapshot.okr.avgKrProgress}%`, sub: `${snapshot.okr.atRiskKrs.length} 个风险 KR` },
              { label: '飞书活跃', value: snapshot.feishu.todayMessages, sub: `${snapshot.feishu.activeChats} 个活跃群` },
              { label: '舆情', value: snapshot.sentiment.totalReviews, sub: `负面 ${snapshot.sentiment.negative} | 警报 ${snapshot.sentiment.activeAlerts}` },
              { label: '竞品动态', value: snapshot.competitors.newNews, sub: `新评论 ${snapshot.competitors.newReviews}` },
            ].map((card, i) => (
              <Grid size={{ xs: 6, sm: 4, md: 2 }} key={i}>
                <Card sx={{ textAlign: 'center', bgcolor: dt.bg.secondary, border: `1px solid ${dt.border.subtle}` }}>
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" color="text.secondary">{card.label}</Typography>
                    <Typography variant="h5" fontWeight={700} sx={{ color: dt.primary.main }}>{card.value}</Typography>
                    <Typography variant="caption" color="text.secondary">{card.sub}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Main Content: Narrative + Actions */}
          <Grid container spacing={3}>
            {/* Left: Narrative + Changes */}
            <Grid size={{ xs: 12, md: 8 }}>
              <Paper sx={{ p: 3, mb: 3, border: `1px solid ${dt.border.subtle}` }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TrendIcon /> 今日复盘
                </Typography>
                <Box sx={{ '& h3': { fontSize: '1rem', mt: 2 }, '& ul': { pl: 2 }, '& li': { mb: 0.5 } }}>
                  <ReactMarkdown>{episode.narrative}</ReactMarkdown>
                </Box>
              </Paper>

              {episode.changes && (
                <Paper sx={{ p: 3, border: `1px solid ${dt.border.subtle}` }}>
                  <Typography variant="h6" gutterBottom>变化检测</Typography>
                  <Box sx={{ '& ul': { pl: 2 }, '& li': { mb: 0.5 } }}>
                    <ReactMarkdown>{episode.changes}</ReactMarkdown>
                  </Box>
                </Paper>
              )}
            </Grid>

            {/* Right: Actions */}
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: 3, border: `2px solid ${dt.primary.main}`, bgcolor: dt.bg.secondary }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, color: dt.primary.main }}>
                  <ActionIcon /> 行动建议
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Box sx={{ '& ol': { pl: 2 }, '& li': { mb: 1.5 } }}>
                  <ReactMarkdown>{episode.actions}</ReactMarkdown>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
}
```

**Step 2: Commit**

```bash
git add app/(dashboard)/coo-briefing/page.tsx
git commit -m "feat(coo): add COO briefing dashboard page"
```

---

## Task 11: Modify `components/Header.tsx` — Add COO Briefing Nav Item

**Files:**
- Modify: `components/Header.tsx`

**Step 1: Add import and nav item**

Add `Psychology` icon to the MUI import:

```typescript
  Psychology as PsychologyIcon,
```

Add COO briefing to `NAV_ITEMS` array (insert after the `简报` item):

```typescript
  { path: '/coo-briefing', label: 'COO', icon: <PsychologyIcon fontSize="small" /> },
```

**Step 2: Commit**

```bash
git add components/Header.tsx
git commit -m "feat(coo): add COO briefing to navigation header"
```

---

## Verification

After all tasks are complete:

1. **Database**: Run `npx prisma db push` to ensure schema is applied.
2. **Dev server**: Kill and restart on port 3030 (`npm run dev`).
3. **Manual test**: Click "立即生成" on `/coo-briefing` page to trigger memory generation.
4. **Chat test**: Open ChatBubble, ask a business question — Claude should now respond with business context.
5. **Build**: Run `npx tsc --noEmit` to verify no type errors.
