import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { getOpenAIClient } from '@/lib/openai';
import { selectCombosForResearch } from '@/lib/insights/keyword-engine';
import { researchWithCombo, type InsightAnalysis } from '@/lib/insights/researcher';

/** Model used for briefing research and summary generation */
const BRIEFING_MODEL = 'gpt-5.2';

/**
 * POST /api/insights/briefing/generate
 * Trigger briefing generation for today.
 * Researches all active topics in parallel and creates InsightCards.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // 0. Parse date from request body (frontend sends local date), fallback to server local date
    let targetDate: Date;
    try {
      const body = await request.json().catch(() => ({}));
      if (body.date && typeof body.date === 'string') {
        targetDate = new Date(body.date + 'T00:00:00.000Z');
      } else {
        // Use UTC+8 (China timezone) as default
        const now = new Date(Date.now() + 8 * 3600 * 1000);
        targetDate = new Date(now.toISOString().split('T')[0] + 'T00:00:00.000Z');
      }
    } catch {
      const now = new Date(Date.now() + 8 * 3600 * 1000);
      targetDate = new Date(now.toISOString().split('T')[0] + 'T00:00:00.000Z');
    }

    // 1. Recover stuck briefings (generating > 10 min with 0 cards)
    await prisma.insightBriefing.updateMany({
      where: {
        status: 'generating',
        cardCount: 0,
        createdAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
      },
      data: { status: 'error' },
    });

    // 2. Fetch all active topics with sufficient weight (skip muted topics in cooldown)
    const topics = await prisma.insightTopic.findMany({
      where: {
        isPaused: false,
        weight: { gte: 20 },
        OR: [
          { mutedUntil: null },
          { mutedUntil: { lt: new Date() } },
        ],
      },
      orderBy: { weight: 'desc' },
    });

    if (topics.length === 0) {
      // Check if all topics are muted
      const mutedCount = await prisma.insightTopic.count({
        where: { isPaused: false, weight: { gte: 20 }, mutedUntil: { gte: new Date() } },
      });
      return NextResponse.json({
        success: false,
        error: mutedCount > 0
          ? `所有话题都在冷静期中（${mutedCount} 个），请等待冷静期结束或添加新话题`
          : '没有可研究的话题，请先添加话题',
      });
    }

    // 3. Create or update briefing record for the target date
    const todayDate = targetDate;

    const briefing = await prisma.insightBriefing.upsert({
      where: { date: todayDate },
      create: {
        date: todayDate,
        status: 'generating',
        summary: '',
        cardCount: 0,
      },
      update: {
        status: 'generating',
        summary: '',
        cardCount: 0,
      },
    });

    // 3. Delete any existing cards and suggestions for this briefing (in case of regeneration)
    await prisma.insightCard.deleteMany({
      where: { briefingId: briefing.id },
    });
    await prisma.suggestedTopic.deleteMany({
      where: { briefingId: briefing.id },
    });

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

            // Skip cards that LLM marked as no-increment
            if (analysis.title.includes('[无增量]')) {
              console.log(`[Briefing] Skipping no-increment card for topic "${topic.name}": ${analysis.title}`);
              continue;
            }

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
                action: Array.isArray(analysis.action) ? analysis.action.join('\n') : analysis.action,
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

    // 5. Generate competitor intelligence card (if data available)
    try {
      const { collectCompetitorData } = await import('@/lib/insights/collector');
      const competitorData = await collectCompetitorData();

      if (competitorData.competitors.length > 0) {
        const competitorContext = competitorData.competitors.map(c => {
          let text = `## ${c.name}\n`;
          if (c.appSnapshots.length > 0) {
            const latest = c.appSnapshots[0];
            text += `- 评分: ${latest.rating ?? 'N/A'}, 版本: ${latest.version ?? 'N/A'}\n`;
            if (latest.releaseNotes) text += `- 更新说明: ${latest.releaseNotes.substring(0, 200)}\n`;
          }
          if (c.reviewSummary.total > 0) {
            text += `- 新评论 ${c.reviewSummary.total} 条, 平均评分 ${c.reviewSummary.avgRating ?? 'N/A'}\n`;
            if (c.reviewSummary.topIssues.length > 0) text += `- 主要问题: ${c.reviewSummary.topIssues.join(', ')}\n`;
          }
          for (const wc of c.webChanges) {
            text += `- 网站变化: ${wc.summary}\n`;
          }
          for (const n of c.news) {
            text += `- 新闻: ${n.title} (${n.source})\n`;
          }
          return text;
        }).join('\n');

        if (competitorContext.trim()) {
          const client = await getOpenAIClient();

          const response = await client.chat.completions.create({
            model: BRIEFING_MODEL,
            messages: [
              {
                role: 'system',
                content: `你是一位竞品情报分析师。根据以下竞品数据，生成一份简洁的竞品动态分析。
输出严格 JSON 格式：
{
  "title": "一句话标题，有信息量",
  "summary": "3-5句话核心要点",
  "details": "Markdown 格式的详细分析（200-400字），叙事式展开，提到具体竞品名、数据、时间",
  "impact": "对我们的影响（一句话）或 null",
  "action": "建议行动 或 null"
}`,
              },
              {
                role: 'user',
                content: `以下是过去 24 小时的竞品动态数据：\n\n${competitorContext}\n\n请分析并生成竞品情报卡片。`,
              },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.4,
            max_completion_tokens: 2000,
          });

          const content = response.choices[0]?.message?.content;
          if (content) {
            const parsed = JSON.parse(content);
            const card = await prisma.insightCard.create({
              data: {
                briefingId: briefing.id,
                category: 'competitor',
                priority: competitorData.alerts.length > 0 ? 'high' : 'medium',
                title: parsed.title || '竞品动态',
                summary: parsed.summary || '',
                details: parsed.details || '',
                impact: parsed.impact || null,
                action: parsed.action || null,
                sources: [],
              },
            });
            cards.push(card);
            console.log('[Briefing] Competitor intelligence card created');
          }
        }
      }
    } catch (error) {
      console.error('[Briefing] Competitor intelligence card failed:', error);
      // Non-critical — continue with briefing even if competitor card fails
    }

    // 6. Generate executive summary using LLM
    let summary: string;
    if (cards.length > 0) {
      summary = await generateExecutiveSummary(cards);
    } else {
      summary = '今日所有话题研究均未返回有效结果。';
    }

    // 7. Suggest new topics based on card content
    if (cards.length > 0) {
      try {
        const existingNames = topics.map(t => t.name);
        await suggestNewTopics(briefing.id, cards, existingNames);
      } catch (error) {
        console.error('[Briefing] Topic suggestion failed:', error);
      }
    }

    // 8. Update briefing with final status
    const updatedBriefing = await prisma.insightBriefing.update({
      where: { id: briefing.id },
      data: {
        status: 'ready',
        cardCount: cards.length,
        summary,
      },
    });

    console.log(
      `[Briefing] Generation complete: ${cards.length}/${topics.length} topics succeeded`
    );

    return NextResponse.json({
      success: true,
      briefing: updatedBriefing,
      cards,
    });
  } catch (error) {
    console.error('[Briefing] Generation failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate briefing' },
      { status: 500 }
    );
  }
}

/**
 * Generate an executive summary from all briefing cards using LLM.
 * This replaces the old title-concatenation approach with a rich, informative summary.
 */
async function generateExecutiveSummary(cards: any[]): Promise<string> {
  try {
    const client = await getOpenAIClient();

    const cardDigest = cards.map((c, i) => {
      return `### ${i + 1}. [${c.category}] ${c.title}\n优先级: ${c.priority}\n摘要: ${c.summary}\n${c.impact ? `影响: ${c.impact}` : ''}`;
    }).join('\n\n');

    const todayStr = new Date().toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
    });

    const response = await client.chat.completions.create({
      model: BRIEFING_MODEL,
      messages: [
        {
          role: 'system',
          content: `你是 CEO 的每日情报简报撰写人。你需要将多条洞察卡片的内容综合为一段简洁但信息量丰富的执行摘要。

要求：
1. 先用一句话点出今日最值得关注的事项
2. 按重要性依次概括各条洞察的核心内容（不只是标题，要包含关键事实和数据）
3. 如果有需要立即行动的事项，在最后特别提醒
4. 使用 Markdown 格式
5. 控制在 200-400 字
6. 语气专业简洁，像高管日报摘要`
        },
        {
          role: 'user',
          content: `日期：${todayStr}\n\n今日洞察卡片共 ${cards.length} 条：\n\n${cardDigest}\n\n请生成今日执行摘要。`,
        },
      ],
      temperature: 0.4,
      max_completion_tokens: 1000,
    });

    return response.choices[0]?.message?.content || cards.map(c => `[${c.category}] ${c.title}`).join('\n');
  } catch (error) {
    console.error('[Briefing] Executive summary generation failed:', error);
    // Fallback to title list
    return cards.map(c => `**[${c.category}]** ${c.title}: ${c.summary}`).join('\n\n');
  }
}

/**
 * Suggest new topics based on today's briefing cards.
 * Uses LLM to identify 2-4 topics worth tracking that aren't already monitored.
 */
async function suggestNewTopics(
  briefingId: string,
  cards: any[],
  existingTopicNames: string[]
): Promise<void> {
  console.log('[Briefing] Generating topic suggestions...');

  const client = await getOpenAIClient();

  const cardDigest = cards.map((c, i) => {
    return `${i + 1}. [${c.category}] ${c.title}\n${c.summary}\n${c.impact || ''}`;
  }).join('\n\n');

  const response = await client.chat.completions.create({
    model: BRIEFING_MODEL,
    messages: [
      {
        role: 'system',
        content: `你是一位 COO 的战略情报顾问。根据今日简报内容，为 COO 推荐 2-4 个值得持续关注的新话题。

要求：
1. 话题应该是从简报内容中衍生出来的、值得长期跟踪的方向
2. 不要推荐已有的话题
3. 话题名称简洁（2-8 个字），便于搜索
4. 推荐理由一句话说清为什么 COO 应该关注

已有话题：${existingTopicNames.join('、') || '(无)'}

返回 JSON 格式：
{
  "suggestions": [
    { "name": "话题名称", "reason": "推荐理由" }
  ]
}`
      },
      {
        role: 'user',
        content: `今日简报内容：\n\n${cardDigest}\n\n请推荐新话题。`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.5,
    max_completion_tokens: 500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    console.log('[Briefing] LLM returned empty response for topic suggestions');
    return;
  }

  const parsed = JSON.parse(content);
  const suggestions: Array<{ name: string; reason: string }> = parsed.suggestions || [];

  let created = 0;
  for (const s of suggestions) {
    if (!s.name || !s.reason) continue;
    // Skip if name matches an existing topic (fuzzy)
    if (existingTopicNames.some(n => n === s.name)) continue;

    await prisma.suggestedTopic.create({
      data: {
        briefingId,
        name: s.name,
        reason: s.reason,
      },
    });
    created++;
  }

  console.log(`[Briefing] Created ${created} topic suggestions`);
}
