# Smart Keyword Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace manual keyword entry with AI-driven keyword combo generation, selection, and feedback-based learning for the insight briefing system.

**Architecture:** New `KeywordCombo` model stores AI-generated keyword combinations per topic. A keyword engine generates combos via LLM, a selection strategy picks best combos for research, and the feedback route retires bad combos / boosts good ones. A cron scheduler automates the nightly pipeline.

**Tech Stack:** Prisma (PostgreSQL), OpenAI API (via existing `lib/openai.ts`), node-cron (already a dependency), Next.js App Router API routes, MUI React components.

---

### Task 1: Database Schema — Add KeywordCombo model and InsightCard.comboId

**Files:**
- Modify: `prisma/schema.prisma:542-590` (Insight Briefing section)

**Step 1: Add KeywordCombo model to schema**

Add after the `InsightTopic` model (after line 555):

```prisma
model KeywordCombo {
  id         String    @id @default(cuid())
  topicId    String
  keywords   String[]
  score      Int       @default(50)
  status     String    @default("active") // active | retired | new
  usedCount  Int       @default(0)
  lastUsedAt DateTime?
  feedback   Int?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  topic InsightTopic @relation(fields: [topicId], references: [id], onDelete: Cascade)
  cards InsightCard[]

  @@index([topicId])
  @@index([status, score])
}
```

**Step 2: Add `combos` relation to InsightTopic**

In the `InsightTopic` model, add a relation field:
```prisma
combos    KeywordCombo[]
```
Place it after the existing `cards InsightCard[]` line.

**Step 3: Add comboId to InsightCard**

In the `InsightCard` model, add:
```prisma
comboId   String?
combo     KeywordCombo? @relation(fields: [comboId], references: [id])
```
Place after the `topicId` field. Add index:
```prisma
@@index([comboId])
```

**Step 4: Run migration**

```bash
cd /Users/allenqiang/poamaster
npx prisma migrate dev --name add_keyword_combo
```

Expected: Migration created and applied, Prisma client regenerated.

**Step 5: Verify**

```bash
npx prisma studio
```

Expected: `KeywordCombo` table visible, `InsightCard` has `comboId` column.

**Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add KeywordCombo model for smart keyword generation"
```

---

### Task 2: Keyword Engine — Core combo generation logic

**Files:**
- Create: `lib/insights/keyword-engine.ts`

**Step 1: Create the keyword engine file**

```typescript
// lib/insights/keyword-engine.ts

import { prisma } from '@/lib/prisma';
import { getOpenAIClient, getOpenAIModel } from '@/lib/openai';
import type { InsightTopic, KeywordCombo } from '@prisma/client';

/**
 * Generate 1-2 new keyword combos for a topic using LLM.
 * Uses liked combos as positive examples and retired combos as negative examples.
 */
export async function generateCombosForTopic(topic: InsightTopic): Promise<KeywordCombo[]> {
  // 1. Gather context: existing active, liked, and retired combos
  const [activeCombos, retiredCombos] = await Promise.all([
    prisma.keywordCombo.findMany({
      where: { topicId: topic.id, status: { in: ['active', 'new'] } },
      orderBy: { score: 'desc' },
      take: 10,
    }),
    prisma.keywordCombo.findMany({
      where: {
        topicId: topic.id,
        status: 'retired',
        // Only show recent retired as negative examples (last 30 days)
        updatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
  ]);

  const likedCombos = activeCombos.filter(c => c.score >= 60);

  // 2. Build prompt
  const client = await getOpenAIClient();
  const model = await getOpenAIModel();

  let prompt = `你是一位搜索关键字策略师。你需要为以下话题生成新的搜索关键字组合。

## 话题
${topic.name}

## 要求
- 生成 1-2 个新的搜索关键字组合
- 每个组合包含 2-4 个关键字
- 关键字组合应该有时效性（关注最新动态）
- 每个组合从不同角度切入话题
- 不要重复已有的关键字组合`;

  if (likedCombos.length > 0) {
    prompt += `\n\n## 表现好的组合（类似方向可以继续探索）\n`;
    likedCombos.forEach(c => {
      prompt += `- [${c.keywords.join(', ')}] (得分: ${c.score})\n`;
    });
  }

  if (retiredCombos.length > 0) {
    prompt += `\n\n## 已废弃的组合（不要生成类似的）\n`;
    retiredCombos.forEach(c => {
      prompt += `- [${c.keywords.join(', ')}]\n`;
    });
  }

  if (activeCombos.length > 0) {
    prompt += `\n\n## 当前在用的组合（不要重复）\n`;
    activeCombos.forEach(c => {
      prompt += `- [${c.keywords.join(', ')}]\n`;
    });
  }

  prompt += `\n\n返回 JSON 格式:
{
  "combos": [
    { "keywords": ["关键字1", "关键字2", "关键字3"] }
  ]
}`;

  // 3. Call LLM
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_completion_tokens: 500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    console.error(`[KeywordEngine] Empty LLM response for topic "${topic.name}"`);
    return [];
  }

  const parsed = JSON.parse(content);
  const combos = Array.isArray(parsed.combos) ? parsed.combos : [];

  // 4. Store new combos
  const created: KeywordCombo[] = [];
  for (const combo of combos.slice(0, 2)) {
    if (!Array.isArray(combo.keywords) || combo.keywords.length === 0) continue;

    const kw = combo.keywords.map((k: any) => String(k).trim()).filter(Boolean);
    if (kw.length < 2) continue;

    const record = await prisma.keywordCombo.create({
      data: {
        topicId: topic.id,
        keywords: kw,
        status: 'new',
        score: 50,
      },
    });
    created.push(record);
  }

  console.log(
    `[KeywordEngine] Generated ${created.length} combos for topic "${topic.name}"`
  );
  return created;
}

/**
 * Select the best combos for a topic to use in research.
 * Strategy:
 *   - Pick highest-score active combo (proven performer)
 *   - Pick one 'new' combo (freshness guarantee)
 *   - Exclude retired and recently used (within 24h)
 */
export async function selectCombosForResearch(
  topicId: string
): Promise<KeywordCombo[]> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Best active combo (not used in last 24h)
  const bestActive = await prisma.keywordCombo.findFirst({
    where: {
      topicId,
      status: 'active',
      OR: [
        { lastUsedAt: null },
        { lastUsedAt: { lt: oneDayAgo } },
      ],
    },
    orderBy: { score: 'desc' },
  });

  // One new combo
  const newCombo = await prisma.keywordCombo.findFirst({
    where: {
      topicId,
      status: 'new',
    },
    orderBy: { createdAt: 'desc' },
  });

  const selected: KeywordCombo[] = [];
  if (bestActive) selected.push(bestActive);
  if (newCombo) selected.push(newCombo);

  // If we have neither, pick any non-retired combo
  if (selected.length === 0) {
    const fallback = await prisma.keywordCombo.findFirst({
      where: {
        topicId,
        status: { not: 'retired' },
      },
      orderBy: { score: 'desc' },
    });
    if (fallback) selected.push(fallback);
  }

  return selected;
}

/**
 * Generate initial combos when a new topic is created.
 * Creates 3-4 seed combos from just the topic name.
 */
export async function generateInitialCombos(topic: InsightTopic): Promise<KeywordCombo[]> {
  const client = await getOpenAIClient();
  const model = await getOpenAIModel();

  const prompt = `你是一位搜索关键字策略师。为以下话题生成 3-4 个搜索关键字组合，用于在搜索引擎中搜索最新相关信息。

话题: ${topic.name}

要求:
- 每个组合 2-4 个关键字
- 覆盖不同角度（行业趋势、竞品动态、技术发展、市场机会等）
- 关键字要有搜索价值，不要太泛
- 关注最新动态

返回 JSON: { "combos": [{ "keywords": ["关键字1", "关键字2"] }] }`;

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_completion_tokens: 500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return [];

  const parsed = JSON.parse(content);
  const combos = Array.isArray(parsed.combos) ? parsed.combos : [];

  const created: KeywordCombo[] = [];
  for (const combo of combos.slice(0, 4)) {
    if (!Array.isArray(combo.keywords) || combo.keywords.length < 2) continue;

    const kw = combo.keywords.map((k: any) => String(k).trim()).filter(Boolean);

    const record = await prisma.keywordCombo.create({
      data: {
        topicId: topic.id,
        keywords: kw,
        status: 'active',
        score: 50,
      },
    });
    created.push(record);
  }

  console.log(
    `[KeywordEngine] Generated ${created.length} initial combos for new topic "${topic.name}"`
  );
  return created;
}

/**
 * Run keyword generation for all active topics.
 * Called by the nightly scheduler at 22:00.
 */
export async function runKeywordGeneration(): Promise<void> {
  console.log('[KeywordEngine] Starting nightly keyword generation...');

  const topics = await prisma.insightTopic.findMany({
    where: { isPaused: false, weight: { gte: 20 } },
    orderBy: { weight: 'desc' },
  });

  console.log(`[KeywordEngine] Processing ${topics.length} active topics`);

  for (const topic of topics) {
    try {
      await generateCombosForTopic(topic);
    } catch (error) {
      console.error(
        `[KeywordEngine] Failed to generate combos for "${topic.name}":`,
        error
      );
    }
  }

  // Clean up old retired combos (> 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { count } = await prisma.keywordCombo.deleteMany({
    where: {
      status: 'retired',
      updatedAt: { lt: thirtyDaysAgo },
    },
  });

  if (count > 0) {
    console.log(`[KeywordEngine] Cleaned up ${count} old retired combos`);
  }

  console.log('[KeywordEngine] Nightly keyword generation complete');
}
```

**Step 2: Commit**

```bash
git add lib/insights/keyword-engine.ts
git commit -m "feat: add keyword engine for AI-driven combo generation"
```

---

### Task 3: Modify researcher.ts — Accept KeywordCombo instead of Topic.keywords

**Files:**
- Modify: `lib/insights/researcher.ts`

**Step 1: Add combo-aware search function**

Add a new function `searchWithCombo` alongside the existing `searchTopic`. The existing `buildSearchQueries` function currently reads `topic.keywords` — we need a new version that reads from a `KeywordCombo`.

Add after the `searchTopic` function (after line 152):

```typescript
/**
 * Search using a specific keyword combo rather than the topic's own keywords.
 * Same Serper logic as searchTopic but uses combo.keywords.
 */
export async function searchWithCombo(
  topicName: string,
  combo: { id: string; keywords: string[] }
): Promise<SearchResult[]> {
  const apiKey = await getConfig('serper.apiKey');
  if (!apiKey) {
    throw new Error(
      'Serper API Key 未配置。请在设置页面添加 serper.apiKey 配置'
    );
  }

  // Build queries from combo keywords
  const queries: string[] = [];
  queries.push(`${topicName} ${combo.keywords.join(' ')}`);
  if (combo.keywords.length >= 2) {
    queries.push(combo.keywords.join(' '));
  }

  const allResults: SearchResult[] = [];
  const seenUrls = new Set<string>();

  for (const query of queries) {
    try {
      const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: query, gl: 'cn', hl: 'zh-cn', num: 10 }),
      });

      if (!response.ok) {
        console.error(
          `[Researcher] Serper error for combo query "${query}": ${response.status}`
        );
        continue;
      }

      const data: SerperResponse = await response.json();
      for (const item of data.organic || []) {
        if (seenUrls.has(item.link)) continue;
        seenUrls.add(item.link);
        allResults.push({
          title: item.title,
          url: item.link,
          snippet: item.snippet,
          date: item.date,
        });
      }
    } catch (error) {
      console.error(`[Researcher] Search failed for combo query "${query}":`, error);
    }
  }

  return allResults.filter((r) => isWithinLast7Days(r.date));
}
```

**Step 2: Add combo-aware research orchestrator**

Add after the `researchTopic` function (after line 331):

```typescript
/**
 * Full research pipeline using a specific keyword combo.
 * 1. Search using the combo's keywords
 * 2. Analyze results with LLM
 * 3. Update combo.lastUsedAt and usedCount
 * 4. Promote 'new' combo to 'active' after first use
 *
 * Returns { analysis, comboId } or null on failure.
 */
export async function researchWithCombo(
  topic: InsightTopic,
  combo: { id: string; keywords: string[]; status: string },
  modelOverride?: string
): Promise<{ analysis: InsightAnalysis; comboId: string } | null> {
  try {
    console.log(
      `[Researcher] Researching topic "${topic.name}" with combo [${combo.keywords.join(', ')}]`
    );

    // Step 1: Search
    const searchResults = await searchWithCombo(topic.name, combo);
    console.log(
      `[Researcher] Found ${searchResults.length} results for combo [${combo.keywords.join(', ')}]`
    );

    if (searchResults.length === 0) return null;

    // Step 2: Analyze — pass combo keywords as topic context
    const topicWithComboKeywords = { ...topic, keywords: combo.keywords };
    const analysis = await analyzeTopicWithContext(
      topicWithComboKeywords as InsightTopic,
      searchResults,
      undefined,
      modelOverride
    );

    // Step 3: Update combo usage stats
    await prisma.keywordCombo.update({
      where: { id: combo.id },
      data: {
        lastUsedAt: new Date(),
        usedCount: { increment: 1 },
        // Promote new → active after first use
        ...(combo.status === 'new' ? { status: 'active' } : {}),
      },
    });

    // Step 4: Update topic lastHitAt
    await prisma.insightTopic.update({
      where: { id: topic.id },
      data: { lastHitAt: new Date() },
    });

    return { analysis, comboId: combo.id };
  } catch (error) {
    console.error(
      `[Researcher] Research failed for combo [${combo.keywords.join(', ')}]:`,
      error
    );
    return null;
  }
}
```

**Step 3: Commit**

```bash
git add lib/insights/researcher.ts
git commit -m "feat: add combo-aware search and research functions"
```

---

### Task 4: Modify briefing generation — Use combos instead of topic keywords

**Files:**
- Modify: `app/api/insights/briefing/generate/route.ts`

**Step 1: Rewrite the research loop to use combos**

Replace the current research loop (lines 62-104) with combo-based logic.

The full updated POST handler should:
1. Fetch active topics (same as before)
2. For each topic, call `selectCombosForResearch(topic.id)` from the keyword engine
3. For each selected combo, call `researchWithCombo(topic, combo, BRIEFING_MODEL)` from researcher
4. Create `InsightCard` with `comboId` set

Replace lines 4-6 imports:

```typescript
import { selectCombosForResearch } from '@/lib/insights/keyword-engine';
import { researchWithCombo, type InsightAnalysis } from '@/lib/insights/researcher';
```

Replace lines 62-104 (the research and card creation block):

```typescript
    // 4. For each topic, select combos and research
    console.log(`[Briefing] Starting research for ${topics.length} topics...`);

    const cards: any[] = [];

    for (const topic of topics) {
      try {
        const combos = await selectCombosForResearch(topic.id);

        if (combos.length === 0) {
          console.warn(`[Briefing] No combos available for topic "${topic.name}", skipping`);
          continue;
        }

        // Research each selected combo in parallel
        const comboResults = await Promise.allSettled(
          combos.map(combo =>
            researchWithCombo(topic, combo, BRIEFING_MODEL)
          )
        );

        for (const result of comboResults) {
          if (result.status === 'fulfilled' && result.value !== null) {
            const { analysis, comboId } = result.value;

            const card = await prisma.insightCard.create({
              data: {
                briefingId: briefing.id,
                topicId: topic.id,
                comboId,
                category: analysis.category,
                priority: analysis.priority,
                title: analysis.title,
                summary: analysis.summary,
                details: analysis.details,
                impact: analysis.impact,
                action: analysis.action,
                sources: analysis.sources,
              },
            });

            cards.push(card);
          }
        }
      } catch (error) {
        console.error(`[Briefing] Topic "${topic.name}" failed:`, error);
      }
    }
```

**Step 2: Commit**

```bash
git add app/api/insights/briefing/generate/route.ts
git commit -m "feat: use keyword combos for briefing research pipeline"
```

---

### Task 5: Modify feedback route — Add combo feedback loop

**Files:**
- Modify: `app/api/insights/cards/[id]/feedback/route.ts`

**Step 1: Rewrite the feedback handler**

Replace the entire PUT handler body (lines 36-61) with combo-aware feedback logic:

```typescript
    // Update the card's feedback
    const card = await prisma.insightCard.update({
      where: { id },
      data: { feedback },
      include: { combo: true },
    });

    // Update the combo if the card is linked to one
    if (card.comboId) {
      if (feedback === 1) {
        // 👍: Boost combo score (+10, cap at 100)
        await prisma.keywordCombo.update({
          where: { id: card.comboId },
          data: {
            score: { increment: 10 },
            feedback: 1,
          },
        });
        // Cap score at 100
        await prisma.keywordCombo.updateMany({
          where: { id: card.comboId, score: { gt: 100 } },
          data: { score: 100 },
        });
      } else {
        // 👎: Retire the combo immediately
        await prisma.keywordCombo.update({
          where: { id: card.comboId },
          data: {
            status: 'retired',
            feedback: -1,
          },
        });
      }
    }

    // Adjust topic weight based on combo feedback patterns
    if (card.topicId) {
      if (feedback === 1) {
        // 👍: topic weight +5 (cap at 100)
        await prisma.insightTopic.update({
          where: { id: card.topicId },
          data: { weight: { increment: 5 } },
        });
        await prisma.insightTopic.updateMany({
          where: { id: card.topicId, weight: { gt: 100 } },
          data: { weight: 100 },
        });
      } else {
        // 👎: Check if 3 consecutive combos have been retired for this topic
        const recentRetired = await prisma.keywordCombo.count({
          where: {
            topicId: card.topicId,
            status: 'retired',
            updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        });

        if (recentRetired >= 3) {
          // 3+ retired in the last week → decrease topic weight by 10
          const topic = await prisma.insightTopic.findUnique({
            where: { id: card.topicId },
          });
          if (topic) {
            await prisma.insightTopic.update({
              where: { id: card.topicId },
              data: { weight: Math.max(0, topic.weight - 10) },
            });
          }
        }
      }
    }
```

**Step 2: Commit**

```bash
git add app/api/insights/cards/[id]/feedback/route.ts
git commit -m "feat: add combo feedback loop - like boosts score, dislike retires"
```

---

### Task 6: Modify topic creation — Auto-generate initial combos, remove manual keywords

**Files:**
- Modify: `app/api/insights/topics/route.ts` (POST handler)

**Step 1: Update POST to generate initial combos**

Add import at top:
```typescript
import { generateInitialCombos } from '@/lib/insights/keyword-engine';
```

Replace the topic creation logic (lines 87-94) with:

```typescript
    const topic = await prisma.insightTopic.create({
      data: {
        name,
        keywords: [], // No more manual keywords
        source: resolvedSource,
        weight,
      },
    });

    // Auto-generate initial keyword combos for the new topic
    try {
      await generateInitialCombos(topic);
    } catch (err) {
      console.error(`[Topics] Failed to generate initial combos for "${name}":`, err);
      // Topic is still created, combos can be generated later
    }
```

**Step 2: Update GET to include combo counts**

In the GET handler, modify the Prisma query to include combo count info.

Replace the `findMany` call (lines 42-45):

```typescript
    const topics = await prisma.insightTopic.findMany({
      where,
      orderBy: { weight: 'desc' },
      include: {
        _count: {
          select: {
            combos: { where: { status: 'active' } },
          },
        },
      },
    });

    // Also get retired count separately for each topic
    const topicsWithStats = await Promise.all(
      topics.map(async (t) => {
        const retiredCount = await prisma.keywordCombo.count({
          where: { topicId: t.id, status: 'retired' },
        });
        const newCount = await prisma.keywordCombo.count({
          where: { topicId: t.id, status: 'new' },
        });
        return {
          ...t,
          comboStats: {
            active: t._count.combos,
            retired: retiredCount,
            new: newCount,
          },
        };
      })
    );

    return NextResponse.json({ success: true, topics: topicsWithStats });
```

**Step 3: Commit**

```bash
git add app/api/insights/topics/route.ts
git commit -m "feat: auto-generate keyword combos on topic creation"
```

---

### Task 7: Modify topics UI — Remove keyword input, show combo stats

**Files:**
- Modify: `app/(dashboard)/insights/topics/page.tsx`

**Step 1: Update Topic type to include comboStats**

Replace the Topic interface (lines 39-48):

```typescript
interface Topic {
  id: string;
  name: string;
  keywords: string[];
  source: string;
  weight: number;
  isPaused: boolean;
  lastHitAt: string | null;
  createdAt: string;
  comboStats?: {
    active: number;
    retired: number;
    new: number;
  };
}
```

**Step 2: Simplify Add dialog — remove keywords field**

In the Add dialog (lines 640-687), remove the `addKeywords` state variable and the keywords `TextField`. Keep only the name field.

Remove state: `const [addKeywords, setAddKeywords] = useState('');`

In `handleAdd`, remove keywords parsing, send only name:
```typescript
body: JSON.stringify({ name: addName.trim() }),
```

Remove the keywords `TextField` from the dialog (lines 660-669).

**Step 3: Simplify Edit dialog — remove keywords field, keep weight**

In the Edit dialog (lines 689-777), remove the keywords `TextField` (lines 708-717) and `editKeywords` state.

In `handleEdit`, remove keywords from the body:
```typescript
body: JSON.stringify({ name: editName.trim(), weight: editWeight }),
```

**Step 4: Replace keywords chips display with combo stats**

Replace the keywords section in the topic card (lines 482-508) with combo stats:

```tsx
{/* Combo stats */}
{topic.comboStats && (
  <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5, flexWrap: 'wrap' }}>
    <Chip
      label={`${topic.comboStats.active} 个搭配`}
      size="small"
      sx={{
        height: 24,
        fontSize: '0.72rem',
        fontWeight: 500,
        bgcolor: dt.success.subtle,
        color: dt.success.dark,
        border: `1px solid rgba(34, 197, 94, 0.2)`,
      }}
    />
    {topic.comboStats.new > 0 && (
      <Chip
        label={`${topic.comboStats.new} 个新搭配`}
        size="small"
        sx={{
          height: 24,
          fontSize: '0.72rem',
          fontWeight: 500,
          bgcolor: dt.accent.subtle,
          color: dt.accent.main,
          border: `1px solid ${dt.accent.border}`,
        }}
      />
    )}
    {topic.comboStats.retired > 0 && (
      <Chip
        label={`${topic.comboStats.retired} 个已废弃`}
        size="small"
        sx={{
          height: 24,
          fontSize: '0.72rem',
          fontWeight: 500,
          bgcolor: dt.bg.deep,
          color: dt.text.muted,
          border: `1px solid ${dt.border.default}`,
        }}
      />
    )}
  </Box>
)}
```

**Step 5: Update subtitle description**

Replace the description text (lines 309-314):
```tsx
管理洞察简报的关注话题。AI 会自动为每个话题生成搜索关键字，你只需添加话题名称。
```

**Step 6: Commit**

```bash
git add app/\(dashboard\)/insights/topics/page.tsx
git commit -m "feat: simplify topic UI - remove manual keywords, show combo stats"
```

---

### Task 8: Cron Scheduler — Automate nightly pipeline

**Files:**
- Create: `lib/insights/scheduler.ts`
- Modify: `app/api/insights/briefing/generate/route.ts` (add scheduler initialization)

**Step 1: Create scheduler**

```typescript
// lib/insights/scheduler.ts

import cron from 'node-cron';
import { runKeywordGeneration } from './keyword-engine';

let keywordGenJob: cron.ScheduledTask | null = null;
let briefingGenJob: cron.ScheduledTask | null = null;

/**
 * Start the nightly insight pipeline scheduler.
 *
 * 22:00 — Generate new keyword combos for all active topics
 * 22:05 — Trigger briefing generation (research + cards + summary)
 *
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export function startScheduler(): void {
  if (keywordGenJob) {
    console.log('[Scheduler] Already running, skipping initialization');
    return;
  }

  // 22:00 — keyword generation
  keywordGenJob = cron.schedule('0 22 * * *', async () => {
    console.log('[Scheduler] 22:00 — Starting keyword generation');
    try {
      await runKeywordGeneration();
      console.log('[Scheduler] Keyword generation complete');
    } catch (error) {
      console.error('[Scheduler] Keyword generation failed:', error);
    }
  });

  // 22:05 — briefing generation
  // This calls the internal generate function directly
  briefingGenJob = cron.schedule('5 22 * * *', async () => {
    console.log('[Scheduler] 22:05 — Starting briefing generation');
    try {
      const response = await fetch(
        `http://localhost:${process.env.PORT || 3030}/api/insights/briefing/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Use internal auth bypass or a stored session
          // For now, the scheduler will need a valid session cookie
          // This can be improved later with an internal API key
        }
      );
      const data = await response.json();
      console.log('[Scheduler] Briefing generation result:', data.success ? 'OK' : data.error);
    } catch (error) {
      console.error('[Scheduler] Briefing generation failed:', error);
    }
  });

  console.log('[Scheduler] Insight pipeline scheduler started (22:00 keywords, 22:05 briefing)');
}

/**
 * Stop the scheduler. Used for cleanup.
 */
export function stopScheduler(): void {
  if (keywordGenJob) {
    keywordGenJob.stop();
    keywordGenJob = null;
  }
  if (briefingGenJob) {
    briefingGenJob.stop();
    briefingGenJob = null;
  }
  console.log('[Scheduler] Stopped');
}
```

**Step 2: Initialize scheduler on app startup**

Create `app/api/insights/scheduler/init/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { startScheduler } from '@/lib/insights/scheduler';

// Initialize scheduler on first import
startScheduler();

export async function GET() {
  return NextResponse.json({ success: true, message: 'Scheduler is running' });
}
```

> Note: In Next.js, this will initialize when the route is first accessed. For production, consider using `instrumentation.ts` or a middleware approach. For now, we can call this endpoint once on startup or add the `startScheduler()` call to an existing API route that always loads.

**Step 3: Commit**

```bash
git add lib/insights/scheduler.ts app/api/insights/scheduler/
git commit -m "feat: add cron scheduler for nightly keyword + briefing pipeline"
```

---

### Task 9: Integration Test — Verify end-to-end flow

**Step 1: Manual test — create topic and verify combo generation**

1. Open `http://localhost:3030/insights/topics`
2. Click "添加话题", enter name "AI 芯片行业" (no keywords field)
3. Verify topic appears with combo stats ("3 个搭配" or similar)
4. Check database: `SELECT * FROM "KeywordCombo" WHERE "topicId" = '...'`

**Step 2: Manual test — generate briefing with combos**

1. Go to `http://localhost:3030/insights/briefing`
2. Click "生成简报"
3. Verify cards are generated
4. Check a card has a `comboId` in the database

**Step 3: Manual test — feedback loop**

1. On a generated card, click 👍
2. Verify the combo's score increased in the database
3. On another card, click 👎
4. Verify the combo's status changed to 'retired'

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: smart keyword engine - complete integration"
```

---

## Summary of Changes

| # | Task | Type | Files |
|---|------|------|-------|
| 1 | Database schema | Migration | `prisma/schema.prisma` |
| 2 | Keyword engine | New file | `lib/insights/keyword-engine.ts` |
| 3 | Researcher combo support | Modify | `lib/insights/researcher.ts` |
| 4 | Briefing generation | Modify | `app/api/insights/briefing/generate/route.ts` |
| 5 | Feedback loop | Modify | `app/api/insights/cards/[id]/feedback/route.ts` |
| 6 | Topic creation | Modify | `app/api/insights/topics/route.ts` |
| 7 | Topics UI | Modify | `app/(dashboard)/insights/topics/page.tsx` |
| 8 | Cron scheduler | New files | `lib/insights/scheduler.ts`, `app/api/insights/scheduler/init/route.ts` |
| 9 | Integration test | Manual | End-to-end verification |
