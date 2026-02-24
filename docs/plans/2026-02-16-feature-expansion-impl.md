# Feature Expansion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 4 feature enhancements/additions: `/insights` enrichment, `/decisions` closure tracking, Feishu Bot Claude CLI upgrade, and OKR dashboard.

**Architecture:** Direction 1-2 are incremental changes to existing API routes and pages. Direction 3 replaces the Feishu bot's OpenAI engine with Claude CLI (same as web ChatBubble). Direction 4 is a new Prisma schema + API + pages for OKR management with Assignee integration.

**Tech Stack:** Next.js 16+ App Router, MUI components, PostgreSQL + Prisma ORM, Claude CLI (`/opt/homebrew/bin/claude`), TypeScript

**Key conventions:**
- Port 3030 (in `.env`, never 3000)
- Auth: `verifySession()` from `lib/auth.ts`, cookie-based session tokens
- API pattern: session verification → Prisma query → JSON response
- Design tokens: `import { designTokens as dt } from '@/lib/theme'`
- Dynamic route params: `params` is `Promise` in Next.js 15+, must be awaited

---

## Direction 1: `/insights` Page Enhancement

### Task 1: Add decision stats to daily collector

**Files:**
- Modify: `lib/insights/collector.ts`
- Modify: `app/api/insights/daily/route.ts` (no change needed — it passes through `data`)

**Context:** `collectDailyData()` in `lib/insights/collector.ts:41-274` already runs ~15 parallel Prisma queries and returns a `DailyData` object. We need to add two new fields to the return type and add two new queries.

**Step 1: Add `decisionStats` and `projectHealth` to the `DailyData` interface**

In `lib/insights/collector.ts`, add to the `DailyData` interface (after the `priorities` field, before the closing `}`):

```typescript
  decisionStats?: {
    total: number;
    completed: number;
    executing: number;
    pending: number;
    revised: number;
    executionRate: number; // completed / (total - revised) as percentage
    avgClosureDays: number | null;
  };
  projectHealth?: Array<{
    name: string;
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
    completionRate: number;
    overdueRate: number;
    signalCount: number;
    status: 'healthy' | 'warning' | 'critical';
  }>;
```

**Step 2: Add decision stats query to the parallel `Promise.all`**

Add these two new queries to the existing `Promise.all` array at the end (after `priorityDecisions`):

```typescript
    // Decision stats: all decisions
    prisma.decision.groupBy({
      by: ['status'],
      _count: true,
    }),

    // Decision closure time: completed decisions
    prisma.decision.findMany({
      where: { status: 'COMPLETED' },
      select: { madeAt: true, updatedAt: true },
    }),
```

Name the destructured variables `decisionStatusCounts` and `completedDecisions`.

**Step 3: Add project health query**

Add another query to the `Promise.all`:

```typescript
    // Project health: tasks grouped by assignee (as proxy for project/team)
    prisma.task.groupBy({
      by: ['assigneeId'],
      _count: true,
      where: { assigneeId: { not: null } },
    }),
```

Name it `tasksByAssignee`.

After the `Promise.all`, add resolution logic:

```typescript
  // --- Decision stats ---
  const decisionByStatus: Record<string, number> = {};
  for (const g of decisionStatusCounts) {
    decisionByStatus[g.status] = g._count;
  }
  const dTotal = Object.values(decisionByStatus).reduce((a, b) => a + b, 0);
  const dCompleted = decisionByStatus['COMPLETED'] || 0;
  const dRevised = decisionByStatus['REVISED'] || 0;
  const dDenominator = dTotal - dRevised;
  const executionRate = dDenominator > 0 ? Math.round((dCompleted / dDenominator) * 100) : 0;

  let avgClosureDays: number | null = null;
  if (completedDecisions.length > 0) {
    const totalDays = completedDecisions.reduce((sum, d) => {
      return sum + (d.updatedAt.getTime() - d.madeAt.getTime()) / (1000 * 60 * 60 * 24);
    }, 0);
    avgClosureDays = Math.round((totalDays / completedDecisions.length) * 10) / 10;
  }

  // --- Project health ---
  // Get unique assignee IDs from tasks
  const assigneeIds = tasksByAssignee.map(t => t.assigneeId!).filter(Boolean);
  const assigneeNames = assigneeIds.length > 0
    ? await prisma.assignee.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true, name: true },
      })
    : [];
  const assigneeNameMap = new Map(assigneeNames.map(a => [a.id, a.name]));

  // Get detailed task data per assignee
  const allAssigneeTasks = assigneeIds.length > 0
    ? await prisma.task.findMany({
        where: { assigneeId: { in: assigneeIds } },
        select: { assigneeId: true, status: true, dueDate: true },
      })
    : [];

  // Get signal count per assignee (from messages they sent)
  const projectHealthData = assigneeIds.map(aid => {
    const tasks = allAssigneeTasks.filter(t => t.assigneeId === aid);
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'DONE').length;
    const overdue = tasks.filter(t => t.status !== 'DONE' && t.dueDate && new Date(t.dueDate) < now).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const overdueRate = total > 0 ? Math.round((overdue / total) * 100) : 0;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (overdueRate > 30) status = 'critical';
    else if (overdueRate > 10) status = 'warning';

    return {
      name: assigneeNameMap.get(aid) || '未知',
      totalTasks: total,
      completedTasks: completed,
      overdueTasks: overdue,
      completionRate,
      overdueRate,
      signalCount: 0,
      status,
    };
  });
```

**Step 4: Add the new fields to the return object**

In the return statement of `collectDailyData()`, add:

```typescript
    decisionStats: {
      total: dTotal,
      completed: dCompleted,
      executing: decisionByStatus['EXECUTING'] || 0,
      pending: decisionByStatus['PENDING'] || 0,
      revised: dRevised,
      executionRate,
      avgClosureDays,
    },
    projectHealth: projectHealthData,
```

**Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: No errors from collector.ts changes.

**Step 6: Commit**

```bash
git add lib/insights/collector.ts
git commit -m "feat: add decision stats and project health to daily collector"
```

---

### Task 2: Add decision stats card and project health section to `/insights` page

**Files:**
- Modify: `app/(dashboard)/insights/page.tsx`

**Context:** The page is at `app/(dashboard)/insights/page.tsx` (1209 lines). It has a `DailyData` interface (line 48-83), `StatCard` component, and renders data from `/api/insights/daily`. We need to:
1. Extend the `DailyData` interface to include `decisionStats` and `projectHealth`
2. Add a decision execution rate stat card
3. Add a project health card in the sidebar

**Step 1: Extend the `DailyData` interface**

In `app/(dashboard)/insights/page.tsx`, add to the `DailyData` interface (after the `priorities?` field):

```typescript
  decisionStats?: {
    total: number;
    completed: number;
    executing: number;
    pending: number;
    revised: number;
    executionRate: number;
    avgClosureDays: number | null;
  };
  projectHealth?: Array<{
    name: string;
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
    completionRate: number;
    overdueRate: number;
    signalCount: number;
    status: 'healthy' | 'warning' | 'critical';
  }>;
```

**Step 2: Add a decision execution rate StatCard**

After the existing 4 `StatCard` items in the `Grid container` (around line 665-701), add a 5th card. Change the Grid layout from `xs:6, md:3` to accommodate 5 cards. The simplest approach: add a new row below the existing 4 cards:

```tsx
{/* Decision Execution Rate Card */}
{data.decisionStats && data.decisionStats.total > 0 && (
  <Grid size={{ xs: 6, md: 3 }}>
    <StatCard
      icon={<GavelIcon fontSize="small" />}
      label="决策执行率"
      value={data.decisionStats.executionRate}
      color={data.decisionStats.executionRate >= 70 ? COLORS.success : COLORS.warning}
      delay={400}
    />
  </Grid>
)}
```

Import `GavelIcon` — it's already imported at line 44.

**Step 3: Add project health card in the sidebar**

In the sidebar `Grid` (the `xs:12, md:4` column starting around line 1001), add a new `Fade`-wrapped `Card` after the sentiment card (around line 1192):

```tsx
{/* Project Health */}
{data.projectHealth && data.projectHealth.length > 0 && (
  <Fade in timeout={1500}>
    <Card sx={CARD_STYLE} elevation={0}>
      <CardContent sx={{ p: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <TrendingIcon sx={{ color: COLORS.accent, fontSize: 18 }} />
          <Typography variant="subtitle2" sx={{ color: COLORS.textPrimary, fontWeight: 700 }}>
            团队健康度
          </Typography>
        </Box>
        {data.projectHealth.map((p, i) => (
          <Box key={i} sx={{ py: 0.75 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" sx={{ color: COLORS.textSecondary, maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Typography variant="body2" sx={{ color: COLORS.textPrimary, fontWeight: 600, fontFeatureSettings: '"tnum"' }}>
                  {p.completionRate}%
                </Typography>
                <DotIcon sx={{
                  fontSize: 10,
                  color: p.status === 'critical' ? COLORS.danger : p.status === 'warning' ? COLORS.warning : COLORS.success,
                }} />
              </Box>
            </Box>
            <LinearProgress
              variant="determinate"
              value={p.completionRate}
              sx={{
                height: 3,
                borderRadius: 2,
                bgcolor: dt.bg.deep,
                '& .MuiLinearProgress-bar': {
                  borderRadius: 2,
                  bgcolor: p.status === 'critical' ? COLORS.danger : p.status === 'warning' ? COLORS.warning : COLORS.success,
                },
              }}
            />
          </Box>
        ))}
      </CardContent>
    </Card>
  </Fade>
)}
```

**Step 4: Add decision stats summary card in sidebar**

After the project health card, add:

```tsx
{/* Decision Stats */}
{data.decisionStats && data.decisionStats.total > 0 && (
  <Fade in timeout={1600}>
    <Card
      sx={{
        ...CARD_STYLE,
        cursor: 'pointer',
        '&:hover': { ...CARD_STYLE['&:hover'] },
      }}
      elevation={0}
      onClick={() => router.push('/decisions')}
    >
      <CardContent sx={{ p: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <GavelIcon sx={{ color: COLORS.accent, fontSize: 18 }} />
          <Typography variant="subtitle2" sx={{ color: COLORS.textPrimary, fontWeight: 700 }}>
            决策追踪
          </Typography>
          <Chip
            label={`${data.decisionStats.executionRate}%`}
            size="small"
            sx={{
              ml: 'auto',
              bgcolor: data.decisionStats.executionRate >= 70 ? `${COLORS.success}18` : `${COLORS.warning}18`,
              color: data.decisionStats.executionRate >= 70 ? COLORS.success : COLORS.warning,
              fontWeight: 700,
              fontSize: '0.7rem',
              height: 22,
            }}
          />
        </Box>
        <MiniStatRow icon={<CheckIcon sx={{ fontSize: 16 }} />} label="已完成" value={data.decisionStats.completed} color={COLORS.success} />
        <MiniStatRow icon={<TrendingIcon sx={{ fontSize: 16 }} />} label="执行中" value={data.decisionStats.executing} color={COLORS.accent} />
        <MiniStatRow icon={<WarningIcon sx={{ fontSize: 16 }} />} label="待执行" value={data.decisionStats.pending} color={COLORS.warning} />
        {data.decisionStats.avgClosureDays !== null && (
          <Box sx={{ mt: 1, pt: 1, borderTop: `1px solid ${COLORS.cardBorder}` }}>
            <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
              平均闭环: {data.decisionStats.avgClosureDays} 天
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  </Fade>
)}
```

**Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 6: Commit**

```bash
git add app/(dashboard)/insights/page.tsx
git commit -m "feat: add decision stats and project health to insights page"
```

---

## Direction 2: `/decisions` Page Enhancement

### Task 3: Add aggregate stats to decisions list API

**Files:**
- Modify: `app/api/decisions/route.ts`

**Context:** The GET handler at `app/api/decisions/route.ts:6-34` returns `{ success, data: decisions[] }`. We need to add `stats` to the response.

**Step 1: Add stats query to the GET handler**

After fetching `decisions` (line 19-27), add:

```typescript
    // Aggregate stats
    const allDecisions = await prisma.decision.findMany({
      select: { status: true, madeAt: true, updatedAt: true },
    });
    const total = allDecisions.length;
    const completed = allDecisions.filter(d => d.status === 'COMPLETED').length;
    const revised = allDecisions.filter(d => d.status === 'REVISED').length;
    const denominator = total - revised;
    const executionRate = denominator > 0 ? Math.round((completed / denominator) * 100) : 0;

    const completedWithTime = allDecisions.filter(d => d.status === 'COMPLETED');
    let avgClosureDays: number | null = null;
    if (completedWithTime.length > 0) {
      const totalDays = completedWithTime.reduce((sum, d) => {
        return sum + (d.updatedAt.getTime() - d.madeAt.getTime()) / (1000 * 60 * 60 * 24);
      }, 0);
      avgClosureDays = Math.round((totalDays / completedWithTime.length) * 10) / 10;
    }

    // Overdue decisions: reviewDate passed but not completed
    const overdueCount = allDecisions.filter(d =>
      d.status !== 'COMPLETED' && d.status !== 'REVISED'
    ).length; // We'll compute this differently on the frontend with reviewDate
```

**Step 2: Update the return statement**

Change `return NextResponse.json({ success: true, data: decisions });` to:

```typescript
    return NextResponse.json({
      success: true,
      data: decisions,
      stats: { total, completed, executionRate, avgClosureDays },
    });
```

**Step 3: Commit**

```bash
git add app/api/decisions/route.ts
git commit -m "feat: add aggregate stats to decisions API"
```

---

### Task 4: Enhance decisions list page with stats header and progress indicators

**Files:**
- Modify: `app/(dashboard)/decisions/page.tsx`

**Context:** The page at `app/(dashboard)/decisions/page.tsx` (345 lines) has a table of decisions. We need to add a stats banner at the top and a progress column.

**Step 1: Add stats state and load from API**

Add to the state declarations (after line 75):

```typescript
  const [stats, setStats] = useState<{
    total: number;
    completed: number;
    executionRate: number;
    avgClosureDays: number | null;
  } | null>(null);
```

In `loadDecisions`, update the success handler to also capture stats:

```typescript
      if (data.success) {
        setDecisions(data.data);
        if (data.stats) setStats(data.stats);
      }
```

**Step 2: Add stats banner below the title bar**

After the `</Box>` that closes the title bar (around line 182), before the `<Tabs>`, add:

```tsx
      {stats && (
        <Box sx={{ display: 'flex', gap: 3, mb: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{stats.total}</Typography>
            <Typography variant="caption" color="text.secondary">总决策</Typography>
          </Box>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, color: 'success.main' }}>{stats.executionRate}%</Typography>
            <Typography variant="caption" color="text.secondary">执行率</Typography>
          </Box>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, color: 'primary.main' }}>{stats.completed}</Typography>
            <Typography variant="caption" color="text.secondary">已完成</Typography>
          </Box>
          {stats.avgClosureDays !== null && (
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>{stats.avgClosureDays}</Typography>
              <Typography variant="caption" color="text.secondary">平均闭环(天)</Typography>
            </Box>
          )}
        </Box>
      )}
```

**Step 3: Add task completion progress to table rows**

In the table, add a new column header `<TableCell>执行进度</TableCell>` after "关联任务数".

In the table body, add a cell showing a mini progress bar:

```tsx
<TableCell>
  {(() => {
    const tasks = decision.tasks || [];
    if (tasks.length === 0) return <Typography variant="caption" color="text.secondary">-</Typography>;
    const done = tasks.filter((t: any) => t.status === 'DONE').length;
    const pct = Math.round((done / tasks.length) * 100);
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 100 }}>
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{ flex: 1, height: 6, borderRadius: 3 }}
        />
        <Typography variant="caption" sx={{ minWidth: 30 }}>{pct}%</Typography>
      </Box>
    );
  })()}
</TableCell>
```

Import `LinearProgress` from `@mui/material` (add to existing import).

**Step 4: Highlight overdue decisions**

In the table body, add conditional styling for rows where `reviewDate` has passed but status is not COMPLETED/REVISED:

```tsx
<TableRow
  key={decision.id}
  hover
  sx={{
    ...(decision.reviewDate &&
      new Date(decision.reviewDate) < new Date() &&
      decision.status !== 'COMPLETED' &&
      decision.status !== 'REVISED'
      ? { bgcolor: 'rgba(239, 68, 68, 0.04)' }
      : {}),
  }}
>
```

For the `reviewDate` cell, add a warning color if overdue:

```tsx
<TableCell>
  <Typography
    variant="body2"
    sx={{
      color: decision.reviewDate &&
        new Date(decision.reviewDate) < new Date() &&
        decision.status !== 'COMPLETED' &&
        decision.status !== 'REVISED'
        ? 'error.main'
        : 'text.primary',
      fontWeight: decision.reviewDate &&
        new Date(decision.reviewDate) < new Date() &&
        decision.status !== 'COMPLETED' &&
        decision.status !== 'REVISED'
        ? 600
        : 400,
    }}
  >
    {formatDate(decision.reviewDate)}
  </Typography>
</TableCell>
```

**Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 6: Commit**

```bash
git add app/(dashboard)/decisions/page.tsx
git commit -m "feat: add stats banner, progress bars, and overdue highlighting to decisions"
```

---

### Task 5: Add overdue decisions to `/insights` priority queue

**Files:**
- Modify: `lib/insights/collector.ts`
- Modify: `app/(dashboard)/insights/page.tsx`

**Context:** The priority queue in the insights page already shows 3 types: overdue tasks, unresolved signals, and pending decisions. We add a 4th: overdue decisions (reviewDate passed, status not completed).

**Step 1: Add overdue decisions to the collector**

In `lib/insights/collector.ts`, add a new query to the `Promise.all`:

```typescript
    // Priority: overdue decisions (reviewDate passed, not completed/revised)
    prisma.decision.findMany({
      where: {
        status: { notIn: ['COMPLETED', 'REVISED'] },
        reviewDate: { lt: now },
      },
      take: 5,
      orderBy: { reviewDate: 'asc' },
    }),
```

Name it `overdueDecisions`.

Add to the `priorities` return:

```typescript
    overdueDecisions: overdueDecisions.map(d => ({
      id: d.id,
      title: d.title,
      madeBy: d.madeBy || '未指定',
      reviewDate: d.reviewDate?.toISOString() || '',
    })),
```

Update the `DailyData` interface `priorities` to include:

```typescript
    overdueDecisions: Array<{ id: string; title: string; madeBy: string; reviewDate: string }>;
```

**Step 2: Add overdue decisions to the priority queue in the insights page**

In `app/(dashboard)/insights/page.tsx`, add to the `PriorityItem` union and `priorityItems` array:

```typescript
...(data?.priorities?.overdueDecisions || []).map(d => ({
  id: d.id,
  type: 'overdueDecision' as const,
  title: `[逾期复盘] ${d.title}`,
  detail: `${d.madeBy} · 复盘日期 ${d.reviewDate ? new Date(d.reviewDate).toLocaleDateString('zh-CN') : ''}`,
  href: `/decisions/${d.id}`,
})),
```

Update `PriorityItem` type to add `'overdueDecision'`:

```typescript
type PriorityItem = {
  id: string;
  type: 'task' | 'signal' | 'decision' | 'overdueDecision';
  // ...
};
```

Add config for the new type:

```typescript
overdueDecision: {
  icon: <GavelIcon sx={{ fontSize: 18 }} />,
  label: '逾期决策',
  chipColor: COLORS.danger,
  chipBg: `${COLORS.danger}18`,
},
```

**Step 3: Commit**

```bash
git add lib/insights/collector.ts app/(dashboard)/insights/page.tsx
git commit -m "feat: add overdue decisions to insights priority queue"
```

---

## Direction 3: Feishu Bot → Claude CLI

### Task 6: Create Claude bridge module in feishu-listener

**Files:**
- Create: `services/feishu-listener/src/claude-bridge.ts`

**Context:** The web chat uses `lib/claude-bridge.ts` and `lib/claude-worker.ts` which depend on Next.js imports (`@/lib/prisma`). The feishu-listener is a standalone Node.js process. We need a standalone version of `callClaude()` that works without Next.js.

**Step 1: Create the bridge module**

Create `services/feishu-listener/src/claude-bridge.ts`:

```typescript
/**
 * Claude CLI bridge for the Feishu listener process.
 * Standalone version of lib/claude-bridge.ts — no Next.js dependencies.
 */

import { spawn } from 'child_process';
import { logger } from './logger.js';

const CLAUDE_PATH = '/opt/homebrew/bin/claude';
const DEFAULT_MODEL = 'sonnet';
const MAX_TURNS = '15';
const TIMEOUT_MS = 180000; // 3 minutes
const MAX_BUFFER = 10 * 1024 * 1024;
const SYSTEM_PROMPT = '你是 POA Master 的 AI 助手，通过飞书与COO对话。直接回答问题，不要使用 AskUserQuestion 工具，不要反问用户。如果信息不足，做出合理假设后直接给出答案。用中文回答。回复尽量简洁（飞书消息不适合太长）。';

export interface ClaudeResponse {
  result: string;
  sessionId: string;
  cost: number;
  durationMs: number;
}

function runClaude(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_PATH, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > MAX_BUFFER) {
        child.kill('SIGKILL');
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGKILL');
        reject(new Error('Claude CLI timed out'));
      }
    }, TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve({ code, stdout, stderr });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(new Error(`Claude CLI spawn failed: ${err.message}`));
      }
    });
  });
}

function parseClaudeOutput(stdout: string): ClaudeResponse {
  const parsed = JSON.parse(stdout);
  logger.info(`[Claude] subtype: ${parsed.subtype}, turns: ${parsed.num_turns}, cost: $${(parsed.total_cost_usd ?? 0).toFixed(4)}`);

  let result = parsed.result || '';
  if (!result && parsed.subtype === 'error_max_turns') {
    result = '抱歉，这个问题比较复杂，达到了处理限制。请尝试简化问题。';
  }

  return {
    result,
    sessionId: parsed.session_id,
    cost: parsed.total_cost_usd ?? 0,
    durationMs: parsed.duration_ms ?? 0,
  };
}

export async function callClaude(
  message: string,
  sessionId?: string | null,
): Promise<ClaudeResponse> {
  const baseArgs = [
    '-p', message,
    '--output-format', 'json',
    '--max-turns', MAX_TURNS,
    '--model', DEFAULT_MODEL,
    '--append-system-prompt', SYSTEM_PROMPT,
    '--permission-mode', 'bypassPermissions',
  ];

  // Try resume first
  if (sessionId) {
    try {
      const { code, stdout } = await runClaude(['--resume', sessionId, ...baseArgs]);
      if (code === 0) return parseClaudeOutput(stdout);
      logger.warn('[Claude] Resume failed, falling back to new session');
    } catch (err: any) {
      logger.warn(`[Claude] Resume error: ${err.message}`);
    }
  }

  // New session
  const { code, stdout, stderr } = await runClaude(baseArgs);
  if (code !== 0) {
    logger.error(`[Claude] exit code ${code}, stderr: ${stderr.slice(0, 200)}`);
    throw new Error(`Claude CLI exited with code ${code}`);
  }
  return parseClaudeOutput(stdout);
}
```

**Step 2: Commit**

```bash
git add services/feishu-listener/src/claude-bridge.ts
git commit -m "feat: add Claude CLI bridge for feishu-listener"
```

---

### Task 7: Add user whitelist for bot commands

**Files:**
- Modify: `services/feishu-listener/src/bot-agent.ts`
- Modify: `services/feishu-listener/src/message-handler.ts`

**Context:** Currently any user who @s the bot gets a response. For Claude CLI (which has `bypassPermissions`), we need a whitelist. We'll use the existing `Config` table with a key like `bot.allowedUsers`.

**Step 1: Add whitelist check function to bot-agent.ts**

At the top of `services/feishu-listener/src/bot-agent.ts`, add:

```typescript
/** Check if a sender is allowed to use the Claude-powered bot */
export async function isBotAllowed(senderId: string, senderName: string): Promise<boolean> {
  if (!prisma) return false;
  try {
    const cfg = await prisma.config.findUnique({ where: { key: 'bot.allowedUsers' } });
    if (!cfg?.value) return true; // If no whitelist configured, allow all (fallback to OpenAI)
    const allowed = cfg.value.split(',').map((s: string) => s.trim().toLowerCase());
    return allowed.includes(senderName.toLowerCase()) || allowed.includes(senderId);
  } catch {
    return false;
  }
}
```

**Step 2: Update message-handler to use Claude for whitelisted users**

In `services/feishu-listener/src/message-handler.ts`, replace the bot handling block (lines 180-199). Add imports at the top:

```typescript
import { callClaude } from './claude-bridge.js';
import { isBotAllowed } from './bot-agent.js';
```

Replace the bot message detection block with:

```typescript
    // Bot message detection
    const botName = await getBotName();
    const isBotDirected = msg.chatType === 'private' ||
      (msg.content && (
        msg.content.toLowerCase().includes(`@${botName.toLowerCase()}`) ||
        msg.content.includes('@POA') ||
        msg.content.includes('@poa')
      ));

    if (isBotDirected && msg.content) {
      const cleanContent = msg.content
        .replace(new RegExp(`@${botName}\\s*`, 'gi'), '')
        .replace(/@POA\s*/gi, '')
        .trim();

      if (cleanContent) {
        const useClaudeCli = await isBotAllowed(msg.senderId, displayName);

        if (useClaudeCli) {
          // Claude CLI — async with "processing" reply first
          sendReply(msg.chatId, '🤔 正在处理，请稍候...')
            .catch(err => logger.error(`[Bot] Ack send failed: ${err.message}`));

          // Get or create conversation for session resume
          let conv = await prisma.botConversation.findUnique({ where: { chatId: msg.chatId } });
          if (!conv) {
            conv = await prisma.botConversation.create({
              data: { chatId: msg.chatId, source: 'feishu', lastActiveAt: new Date() },
            });
          }

          callClaude(cleanContent, conv.claudeSessionId)
            .then(async (response) => {
              await sendReply(msg.chatId, response.result || '处理完成，但没有返回结果。');
              // Save session ID for resume
              await prisma.botConversation.update({
                where: { chatId: msg.chatId },
                data: {
                  claudeSessionId: response.sessionId,
                  lastActiveAt: new Date(),
                },
              });
              logger.info(`[Bot/Claude] Reply sent to ${msg.chatId}, cost: $${response.cost.toFixed(4)}`);
            })
            .catch(err => {
              logger.error(`[Bot/Claude] Error: ${err.message}`);
              sendReply(msg.chatId, `抱歉，处理失败: ${err.message}`)
                .catch(() => {});
            });
        } else {
          // Fallback to OpenAI for non-whitelisted users
          processMessage(msg.chatId, cleanContent)
            .then(reply => sendReply(msg.chatId, reply))
            .catch(err => logger.error(`[Bot/OpenAI] Error: ${err.message}`));
        }
      }
    }
```

**Step 3: Rebuild feishu-listener**

Run: `cd services/feishu-listener && npx tsc`
Expected: Clean compilation.

**Step 4: Commit**

```bash
git add services/feishu-listener/src/claude-bridge.ts services/feishu-listener/src/bot-agent.ts services/feishu-listener/src/message-handler.ts
git commit -m "feat: upgrade feishu bot to use Claude CLI for whitelisted users"
```

---

### Task 8: Add bot whitelist management to settings page

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`

**Context:** The settings page already manages config values. We need to add a field for `bot.allowedUsers` (comma-separated names/IDs).

**Step 1: Read the settings page to understand its structure**

Read `app/(dashboard)/settings/page.tsx` and identify how config keys are loaded and saved.

**Step 2: Add a `bot.allowedUsers` field**

Add a new TextField in the settings form for "Bot 白名单用户"  with a helper text explaining the format (comma-separated names or user IDs). The save handler should use the existing config API to save the value.

This is a straightforward addition to the existing settings form — follow the same pattern used for other config fields on the page.

**Step 3: Commit**

```bash
git add app/(dashboard)/settings/page.tsx
git commit -m "feat: add bot whitelist config to settings page"
```

---

## Direction 4: OKR Dashboard

### Task 9: Create Prisma schema for OKR models

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add the models and enum**

Add at the end of `prisma/schema.prisma`:

```prisma
enum OkrPeriodType {
  QUARTERLY
  MONTHLY
  ANNUAL
}

enum OkrStatus {
  DRAFT
  ACTIVE
  COMPLETED
  CANCELLED
}

model Objective {
  id          String        @id @default(cuid())
  title       String
  description String?
  periodType  OkrPeriodType @default(QUARTERLY)
  periodLabel String        // e.g. "2026-Q1", "2026-03"
  status      OkrStatus     @default(ACTIVE)
  weight      Float         @default(1.0)
  ownerId     String?
  parentId    String?       // For cascading OKRs
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  owner       Assignee?     @relation(fields: [ownerId], references: [id])
  parent      Objective?    @relation("ObjectiveHierarchy", fields: [parentId], references: [id])
  children    Objective[]   @relation("ObjectiveHierarchy")
  keyResults  KeyResult[]

  @@index([ownerId])
  @@index([status])
  @@index([periodLabel])
}

model KeyResult {
  id           String    @id @default(cuid())
  objectiveId  String
  title        String
  targetValue  Float
  currentValue Float     @default(0)
  unit         String    @default("%")  // "%", "个", "万", etc.
  weight       Float     @default(1.0)
  ownerId      String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  objective    Objective @relation(fields: [objectiveId], references: [id], onDelete: Cascade)
  owner        Assignee? @relation(fields: [ownerId], references: [id])

  @@index([objectiveId])
  @@index([ownerId])
}
```

Update the `Assignee` model to add the reverse relations:

```prisma
model Assignee {
  // ... existing fields ...
  objectives  Objective[]
  keyResults  KeyResult[]
}
```

**Step 2: Run migration**

```bash
cd /Users/allenqiang/poamaster
npx prisma db push
```

Expected: Schema synced, no errors. Using `db push` (not `migrate dev`) since this project uses push for schema changes.

**Step 3: Generate client**

```bash
npx prisma generate
```

**Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Objective and KeyResult models for OKR"
```

---

### Task 10: Create OKR API routes

**Files:**
- Create: `app/api/okr/route.ts` — GET (list), POST (create objective)
- Create: `app/api/okr/[id]/route.ts` — GET (detail), PATCH (update), DELETE
- Create: `app/api/okr/[id]/key-results/route.ts` — POST (add KR), PATCH (update KR progress)

**Step 1: Create `app/api/okr/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

// GET /api/okr — List objectives with key results
export async function GET(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const period = sp.get('period');
  const ownerId = sp.get('ownerId');
  const status = sp.get('status');

  const where: any = {};
  if (period) where.periodLabel = period;
  if (ownerId) where.ownerId = ownerId;
  if (status) where.status = status;

  const objectives = await prisma.objective.findMany({
    where,
    include: {
      owner: { select: { id: true, name: true } },
      keyResults: {
        include: { owner: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Compute progress for each objective
  const data = objectives.map(obj => {
    const krs = obj.keyResults;
    const totalWeight = krs.reduce((s, kr) => s + kr.weight, 0);
    const weightedProgress = totalWeight > 0
      ? krs.reduce((s, kr) => {
          const progress = kr.targetValue > 0
            ? Math.min(kr.currentValue / kr.targetValue, 1)
            : 0;
          return s + progress * kr.weight;
        }, 0) / totalWeight
      : 0;

    return {
      ...obj,
      progress: Math.round(weightedProgress * 100),
    };
  });

  // Get available periods for filter
  const periods = await prisma.objective.findMany({
    select: { periodLabel: true },
    distinct: ['periodLabel'],
    orderBy: { periodLabel: 'desc' },
  });

  // Get assignees for filter
  const assignees = await prisma.assignee.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({
    success: true,
    data,
    periods: periods.map(p => p.periodLabel),
    assignees,
  });
}

// POST /api/okr — Create objective
export async function POST(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  const body = await req.json();
  const { title, description, periodType, periodLabel, ownerId, weight, keyResults } = body;

  if (!title?.trim()) {
    return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
  }
  if (!periodLabel?.trim()) {
    return NextResponse.json({ success: false, error: 'Period is required' }, { status: 400 });
  }

  const objective = await prisma.objective.create({
    data: {
      title: title.trim(),
      description: description?.trim() || null,
      periodType: periodType || 'QUARTERLY',
      periodLabel: periodLabel.trim(),
      ownerId: ownerId || null,
      weight: weight ?? 1.0,
      keyResults: keyResults?.length > 0
        ? {
            create: keyResults.map((kr: any) => ({
              title: kr.title,
              targetValue: kr.targetValue ?? 100,
              unit: kr.unit || '%',
              weight: kr.weight ?? 1.0,
              ownerId: kr.ownerId || null,
            })),
          }
        : undefined,
    },
    include: {
      owner: { select: { id: true, name: true } },
      keyResults: { include: { owner: { select: { id: true, name: true } } } },
    },
  });

  return NextResponse.json({ success: true, data: objective }, { status: 201 });
}
```

**Step 2: Create `app/api/okr/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

// GET /api/okr/:id
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  const { id } = await params;
  const objective = await prisma.objective.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true } },
      keyResults: {
        include: { owner: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!objective) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: objective });
}

// PATCH /api/okr/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { title, description, status, ownerId, weight } = body;

  const data: any = {};
  if (title !== undefined) data.title = title;
  if (description !== undefined) data.description = description;
  if (status !== undefined) data.status = status;
  if (ownerId !== undefined) data.ownerId = ownerId || null;
  if (weight !== undefined) data.weight = weight;

  const objective = await prisma.objective.update({
    where: { id },
    data,
    include: {
      owner: { select: { id: true, name: true } },
      keyResults: { include: { owner: { select: { id: true, name: true } } } },
    },
  });

  return NextResponse.json({ success: true, data: objective });
}

// DELETE /api/okr/:id
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  const { id } = await params;
  await prisma.objective.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
```

**Step 3: Create `app/api/okr/[id]/key-results/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

// POST /api/okr/:id/key-results — Add a key result
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { title, targetValue, unit, weight, ownerId } = body;

  if (!title?.trim()) {
    return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
  }

  const kr = await prisma.keyResult.create({
    data: {
      objectiveId: id,
      title: title.trim(),
      targetValue: targetValue ?? 100,
      unit: unit || '%',
      weight: weight ?? 1.0,
      ownerId: ownerId || null,
    },
    include: { owner: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ success: true, data: kr }, { status: 201 });
}

// PATCH /api/okr/:id/key-results — Update a key result (pass krId in body)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  await params; // consume params
  const body = await req.json();
  const { krId, currentValue, title, targetValue, unit, weight, ownerId } = body;

  if (!krId) {
    return NextResponse.json({ success: false, error: 'krId is required' }, { status: 400 });
  }

  const data: any = {};
  if (currentValue !== undefined) data.currentValue = currentValue;
  if (title !== undefined) data.title = title;
  if (targetValue !== undefined) data.targetValue = targetValue;
  if (unit !== undefined) data.unit = unit;
  if (weight !== undefined) data.weight = weight;
  if (ownerId !== undefined) data.ownerId = ownerId || null;

  const kr = await prisma.keyResult.update({
    where: { id: krId },
    data,
    include: { owner: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ success: true, data: kr });
}
```

**Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: No errors (after `prisma generate` from Task 9).

**Step 5: Commit**

```bash
git add app/api/okr/
git commit -m "feat: add OKR API routes (CRUD for objectives and key results)"
```

---

### Task 11: Create OKR list page

**Files:**
- Create: `app/(dashboard)/okr/page.tsx`

**Context:** The page should show objectives grouped by period, with expandable key results. Filter by period and owner. Create new OKR via dialog.

**Step 1: Create the page**

Create `app/(dashboard)/okr/page.tsx` following the project's existing patterns:
- Use `'use client'` and `designTokens` from `@/lib/theme`
- Same `CARD_STYLE` pattern used in `/insights`
- Period filter (Select), owner filter (Select), status filter (Tabs)
- Each Objective rendered as a Card with:
  - Title, owner chip, period chip, overall progress bar
  - Expandable section showing KeyResults with individual progress bars
  - Each KR shows: title, current/target, progress %, owner
- "新建 OKR" button opens a Dialog with:
  - Title, description, period type (quarterly/monthly), period label, owner select
  - Inline KR creation (add/remove KR rows with title, target, unit, owner)
- Empty state: "暂无 OKR，点击右上角创建"

The page should use the existing design tokens (`dt.bg.elevated`, `dt.border.default`, etc.) and match the visual style of `/decisions/page.tsx` and `/insights/page.tsx`.

**Step 2: Commit**

```bash
git add app/(dashboard)/okr/page.tsx
git commit -m "feat: add OKR list page with filters and create dialog"
```

---

### Task 12: Create OKR detail page

**Files:**
- Create: `app/(dashboard)/okr/[id]/page.tsx`

**Context:** Detail page for editing an Objective and its Key Results. Similar to `/decisions/[id]/page.tsx`.

**Step 1: Create the page**

Create `app/(dashboard)/okr/[id]/page.tsx` following the `/decisions/[id]` pattern:
- Header with back button + title + status chip + status dropdown
- Objective info section (Paper): title, description, period, owner
- Key Results section (Paper):
  - Each KR as a row: title, progress bar, current/target input, unit, owner
  - "Update Progress" button per KR (inline edit of currentValue)
  - "Add Key Result" button opens a dialog
- Save button for objective-level changes
- Delete button with confirmation dialog

**Step 2: Commit**

```bash
git add app/(dashboard)/okr/[id]/page.tsx
git commit -m "feat: add OKR detail page with KR progress editing"
```

---

### Task 13: Add OKR module to assignee detail page

**Files:**
- Modify: `app/(dashboard)/assignees/[id]/page.tsx`

**Context:** The assignee detail page is already large (~51KB). We need to add a section showing this person's OKRs.

**Step 1: Add OKR data loading**

Add a fetch to `/api/okr?ownerId=${id}` in the page's data loading. Display a section with the person's objectives and their progress.

**Step 2: Add OKR section to the page**

After the existing sections, add a new Paper with:
- Title: "OKR 目标"
- List of this person's objectives with progress bars
- Each objective links to `/okr/[objectiveId]`

**Step 3: Commit**

```bash
git add app/(dashboard)/assignees/[id]/page.tsx
git commit -m "feat: add OKR section to assignee detail page"
```

---

### Task 14: Add OKR navigation to header

**Files:**
- Modify: `components/Header.tsx`

**Context:** The header has navigation buttons. Add "OKR" to the nav items.

**Step 1: Add OKR nav item**

In `components/Header.tsx`, find the nav items array and add:

```typescript
{ label: 'OKR', path: '/okr', icon: <FlagIcon /> }
```

Import `Flag as FlagIcon` from `@mui/icons-material`.

**Step 2: Commit**

```bash
git add components/Header.tsx
git commit -m "feat: add OKR to navigation header"
```

---

### Task 15: Add OKR risk alerts to `/insights` page

**Files:**
- Modify: `lib/insights/collector.ts`
- Modify: `app/(dashboard)/insights/page.tsx`

**Context:** Add "at-risk" KRs (progress behind schedule) to the insights priority queue.

**Step 1: Add OKR risk query to collector**

In `lib/insights/collector.ts`, add to the `Promise.all`:

```typescript
    // OKR: at-risk key results (progress < expected based on time elapsed in period)
    prisma.keyResult.findMany({
      where: {
        objective: { status: 'ACTIVE' },
        targetValue: { gt: 0 },
      },
      include: {
        owner: { select: { name: true } },
        objective: { select: { title: true, periodLabel: true } },
      },
    }),
```

After the `Promise.all`, filter for at-risk KRs:

```typescript
  // Compute at-risk KRs
  const atRiskKRs = allActiveKRs.filter(kr => {
    const progress = kr.currentValue / kr.targetValue;
    // Simple heuristic: if less than 50% done and we're past mid-period, it's at risk
    return progress < 0.5;
  }).slice(0, 5);
```

Add to `DailyData` interface:

```typescript
  okrAtRisk?: Array<{
    krTitle: string;
    objectiveTitle: string;
    ownerName: string;
    progress: number;
    objectiveId: string;
  }>;
```

**Step 2: Add OKR risks to the insights page priority queue**

In the insights page, add to `priorityItems`:

```typescript
...(data?.okrAtRisk || []).map(kr => ({
  id: kr.objectiveId,
  type: 'okrRisk' as const,
  title: `[OKR风险] ${kr.krTitle}`,
  detail: `${kr.ownerName} · 进度 ${kr.progress}%`,
  href: `/okr/${kr.objectiveId}`,
})),
```

Add `'okrRisk'` to `PriorityItem` type and config:

```typescript
okrRisk: {
  icon: <FlagIcon sx={{ fontSize: 18 }} />,
  label: 'OKR',
  chipColor: COLORS.purple,
  chipBg: `${COLORS.purple}18`,
},
```

Import `Flag as FlagIcon` from `@mui/icons-material`.

**Step 3: Commit**

```bash
git add lib/insights/collector.ts app/(dashboard)/insights/page.tsx
git commit -m "feat: add OKR risk alerts to insights priority queue"
```

---

## Summary

| Task | Direction | Description |
|------|-----------|-------------|
| 1 | Insights | Add decision stats + project health to daily collector |
| 2 | Insights | Add cards to insights page UI |
| 3 | Decisions | Add aggregate stats to decisions API |
| 4 | Decisions | Enhance decisions page with stats, progress, overdue |
| 5 | Decisions | Add overdue decisions to insights priority queue |
| 6 | Feishu Bot | Create Claude CLI bridge for feishu-listener |
| 7 | Feishu Bot | Add whitelist + swap engine in message-handler |
| 8 | Feishu Bot | Add whitelist config to settings page |
| 9 | OKR | Create Prisma schema (Objective + KeyResult) |
| 10 | OKR | Create API routes (CRUD) |
| 11 | OKR | Create OKR list page |
| 12 | OKR | Create OKR detail page |
| 13 | OKR | Add OKR to assignee detail page |
| 14 | OKR | Add OKR to header navigation |
| 15 | OKR | Add OKR risk alerts to insights |
