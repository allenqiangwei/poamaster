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

    // 1. Fetch all active topics with sufficient weight
    const topics = await prisma.insightTopic.findMany({
      where: { isPaused: false, weight: { gte: 20 } },
      orderBy: { weight: 'desc' },
    });

    if (topics.length === 0) {
      return NextResponse.json({
        success: false,
        error: '没有可研究的话题，请先添加话题',
      });
    }

    // 2. Create or update today's briefing record
    const todayDate = new Date(new Date().toISOString().split('T')[0]);

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

    // 3. Delete any existing cards for this briefing (in case of regeneration)
    await prisma.insightCard.deleteMany({
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

    // 6. Generate executive summary using LLM
    let summary: string;
    if (cards.length > 0) {
      summary = await generateExecutiveSummary(cards);
    } else {
      summary = '今日所有话题研究均未返回有效结果。';
    }

    // 7. Update briefing with final status
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
