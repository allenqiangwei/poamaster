import { prisma } from '@/lib/prisma';
import { getOpenAIClient, getOpenAIModel } from '@/lib/openai';
import type { InsightTopic, KeywordCombo } from '@prisma/client';

/**
 * KeywordEngine — AI 驱动的关键词组合生成与选择引擎
 *
 * 为每个 InsightTopic 生成多角度的搜索关键词组合，
 * 通过反馈循环不断优化关键词质量。
 */

// ============================================================
// 1. generateCombosForTopic
// ============================================================

/**
 * 为指定话题生成 2-3 个新的关键词组合。
 * 使用 LLM 根据已有组合（正面/负面示例）生成不同角度的新组合。
 */
export async function generateCombosForTopic(
  topic: InsightTopic
): Promise<KeywordCombo[]> {
  console.log(`[KeywordEngine] 为话题 "${topic.name}" 生成新组合...`);

  try {
    // 获取当前所有活跃和已退役的组合作为上下文
    const existingCombos = await prisma.keywordCombo.findMany({
      where: { topicId: topic.id },
    });

    const activeCombos = existingCombos.filter((c) => c.status === 'active');
    const newCombos = existingCombos.filter((c) => c.status === 'new');
    const allCurrentCombos = [...activeCombos, ...newCombos];

    // 正面示例：得分 >= 60 的组合
    const likedCombos = existingCombos.filter((c) => c.score >= 60);

    // 负面示例：30 天内退役的组合
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const retiredCombos = existingCombos.filter(
      (c) => c.status === 'retired' && c.updatedAt >= thirtyDaysAgo
    );

    const client = await getOpenAIClient();
    const model = await getOpenAIModel();

    const prompt = `你是一个专业的信息检索专家。请为以下话题生成 2-3 个新的搜索关键词组合。

话题名称：${topic.name}
话题关键词：${topic.keywords.join('、')}

${likedCombos.length > 0 ? `以下是效果好的组合（正面示例，请参考但不要重复）：\n${likedCombos.map((c) => `- ${c.keywords.join(' + ')}`).join('\n')}` : ''}

${retiredCombos.length > 0 ? `以下是效果差已退役的组合（负面示例，请避免类似的）：\n${retiredCombos.map((c) => `- ${c.keywords.join(' + ')}`).join('\n')}` : ''}

${allCurrentCombos.length > 0 ? `以下是当前已有的组合（请不要重复）：\n${allCurrentCombos.map((c) => `- ${c.keywords.join(' + ')}`).join('\n')}` : ''}

要求：
1. 每个组合包含 2-4 个关键词
2. 从不同角度切入，覆盖话题的不同方面
3. 不要重复已有组合
4. 关键词应该具有搜索价值，能找到有洞察力的内容

请返回 JSON 格式：
{
  "combos": [
    { "keywords": ["关键词1", "关键词2", "关键词3"] }
  ]
}`;

    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_completion_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.log('[KeywordEngine] LLM 返回空响应');
      return [];
    }

    const parsed = JSON.parse(content);
    const combos: Array<{ keywords: string[] }> = parsed.combos || [];

    // 验证并存储
    const created: KeywordCombo[] = [];
    for (const combo of combos) {
      if (!Array.isArray(combo.keywords) || combo.keywords.length < 2) {
        console.log('[KeywordEngine] 跳过无效组合（关键词不足）:', combo);
        continue;
      }

      const record = await prisma.keywordCombo.create({
        data: {
          topicId: topic.id,
          keywords: combo.keywords,
          status: 'new',
          score: 50,
        },
      });
      created.push(record);
    }

    console.log(
      `[KeywordEngine] 为话题 "${topic.name}" 生成了 ${created.length} 个新组合`
    );
    return created;
  } catch (error) {
    console.log(
      `[KeywordEngine] 生成组合失败 (${topic.name}):`,
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

// ============================================================
// 2. selectCombosForResearch
// ============================================================

/**
 * 为指定话题选择关键词组合用于研究。
 *
 * 策略（轮换优先）：
 *  - 48h 冷却期：刚使用过的组合不会被再次选中
 *  - 加权随机选择：得分越高被选中概率越大，但不保证每次选最高分
 *  - 总是选 1 个 new 状态的组合（保持探索）
 *  - 回退：如果以上都没有，放宽冷却期
 */
export async function selectCombosForResearch(
  topicId: string
): Promise<KeywordCombo[]> {
  console.log(`[KeywordEngine] 为话题 ${topicId} 选择研究组合...`);

  const selected: KeywordCombo[] = [];
  const fortyEightHoursAgo = new Date();
  fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

  // 策略 1: 从冷却期外的活跃组合中加权随机选一个
  const activeCandidates = await prisma.keywordCombo.findMany({
    where: {
      topicId,
      status: 'active',
      OR: [
        { lastUsedAt: null },
        { lastUsedAt: { lt: fortyEightHoursAgo } },
      ],
    },
  });

  if (activeCandidates.length > 0) {
    const pick = weightedRandomPick(activeCandidates);
    selected.push(pick);
  }

  // 策略 2: 一个 new 状态的组合（探索新方向）
  const freshCombo = await prisma.keywordCombo.findFirst({
    where: {
      topicId,
      status: 'new',
      id: { notIn: selected.map((s) => s.id) },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (freshCombo) {
    selected.push(freshCombo);
  }

  // 策略 3: 如果策略1没选到，从冷却期外的 active 中再选一个不同的
  if (selected.length < 2 && activeCandidates.length > 1) {
    const remaining = activeCandidates.filter(
      (c) => !selected.some((s) => s.id === c.id)
    );
    if (remaining.length > 0) {
      selected.push(weightedRandomPick(remaining));
    }
  }

  // 回退：如果还是空的，放宽冷却期，找任意非 retired 组合
  if (selected.length === 0) {
    const fallback = await prisma.keywordCombo.findFirst({
      where: {
        topicId,
        status: { not: 'retired' },
      },
      orderBy: { score: 'desc' },
    });

    if (fallback) {
      selected.push(fallback);
    }
  }

  console.log(
    `[KeywordEngine] 选中 ${selected.length} 个组合: ${selected.map((s) => s.keywords.join('+')).join(', ')}`
  );
  return selected;
}

/**
 * 从候选组合中按 score 加权随机选择一个。
 * 得分越高被选中概率越大，但不保证每次选最高分，
 * 从而实现轮换效果。
 */
function weightedRandomPick(combos: KeywordCombo[]): KeywordCombo {
  if (combos.length === 1) return combos[0];

  // 最低分设为 10 以确保所有组合都有机会被选中
  const weights = combos.map((c) => Math.max(c.score, 10));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < combos.length; i++) {
    random -= weights[i];
    if (random <= 0) return combos[i];
  }

  return combos[combos.length - 1];
}

// ============================================================
// 2b. generateVariationCombo (feedback-triggered)
// ============================================================

/**
 * 基于一个被点赞的组合生成 1 个变体组合。
 * 保留核心方向，但从新角度切入。
 */
export async function generateVariationCombo(
  topicId: string,
  likedCombo: KeywordCombo
): Promise<KeywordCombo | null> {
  console.log(
    `[KeywordEngine] 基于点赞组合 "${likedCombo.keywords.join('+')}" 生成变体...`
  );

  try {
    const client = await getOpenAIClient();
    const model = await getOpenAIModel();

    const existingCombos = await prisma.keywordCombo.findMany({
      where: { topicId, status: { not: 'retired' } },
      select: { keywords: true },
    });

    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: `你是信息检索专家。用户喜欢这个搜索关键词组合：${likedCombo.keywords.join(' + ')}

请生成 1 个变体组合，保留核心方向但从新角度切入。

已有组合（不要重复）：
${existingCombos.map((c) => `- ${c.keywords.join(' + ')}`).join('\n')}

要求：2-4 个关键词，与原组合方向相关但覆盖不同子话题。

返回 JSON：{ "keywords": ["关键词1", "关键词2"] }`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
      max_completion_tokens: 200,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.keywords) || parsed.keywords.length < 2) return null;

    const record = await prisma.keywordCombo.create({
      data: {
        topicId,
        keywords: parsed.keywords,
        status: 'new',
        score: 55, // Slightly above default — inspired by a liked combo
      },
    });

    console.log(
      `[KeywordEngine] 生成变体组合: ${record.keywords.join('+')}`
    );
    return record;
  } catch (error) {
    console.log(
      '[KeywordEngine] 生成变体组合失败:',
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

// ============================================================
// 3. generateInitialCombos
// ============================================================

/**
 * 为新创建的话题生成 3-4 个种子关键词组合。
 */
export async function generateInitialCombos(
  topic: InsightTopic
): Promise<KeywordCombo[]> {
  console.log(`[KeywordEngine] 为新话题 "${topic.name}" 生成初始组合...`);

  try {
    const client = await getOpenAIClient();
    const model = await getOpenAIModel();

    const prompt = `你是一个专业的信息检索专家。请为以下话题生成 3-4 个搜索关键词组合，用于在互联网上搜索相关的最新资讯和洞察。

话题名称：${topic.name}
话题关键词：${topic.keywords.join('、')}

要求：
1. 每个组合包含 2-4 个关键词
2. 组合之间应从不同角度切入，覆盖话题的不同方面
3. 关键词应该具有搜索价值，能找到有深度、有洞察力的内容
4. 考虑行业趋势、竞争态势、技术发展等多个维度

请返回 JSON 格式：
{
  "combos": [
    { "keywords": ["关键词1", "关键词2"] },
    { "keywords": ["关键词1", "关键词2", "关键词3"] }
  ]
}`;

    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_completion_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.log('[KeywordEngine] LLM 返回空响应');
      return [];
    }

    const parsed = JSON.parse(content);
    const combos: Array<{ keywords: string[] }> = parsed.combos || [];

    const created: KeywordCombo[] = [];
    for (const combo of combos) {
      if (!Array.isArray(combo.keywords) || combo.keywords.length < 2) {
        console.log('[KeywordEngine] 跳过无效组合（关键词不足）:', combo);
        continue;
      }

      const record = await prisma.keywordCombo.create({
        data: {
          topicId: topic.id,
          keywords: combo.keywords,
          status: 'active',
          score: 50,
        },
      });
      created.push(record);
    }

    console.log(
      `[KeywordEngine] 为话题 "${topic.name}" 生成了 ${created.length} 个初始组合`
    );
    return created;
  } catch (error) {
    console.log(
      `[KeywordEngine] 生成初始组合失败 (${topic.name}):`,
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

// ============================================================
// 4. runKeywordGeneration (nightly runner)
// ============================================================

/**
 * 每夜运行：为所有活跃话题生成新组合，并清理过期的退役组合。
 */
export async function runKeywordGeneration(): Promise<void> {
  console.log('[KeywordEngine] 开始每日关键词生成任务...');

  try {
    // 获取所有活跃话题（未暂停且权重 >= 20）
    const activeTopics = await prisma.insightTopic.findMany({
      where: {
        isPaused: false,
        weight: { gte: 20 },
      },
    });

    console.log(`[KeywordEngine] 找到 ${activeTopics.length} 个活跃话题`);

    for (const topic of activeTopics) {
      try {
        await generateCombosForTopic(topic);
      } catch (error) {
        console.log(
          `[KeywordEngine] 话题 "${topic.name}" 生成失败，继续下一个:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    // 清理 30 天前退役的组合
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const deleted = await prisma.keywordCombo.deleteMany({
      where: {
        status: 'retired',
        updatedAt: { lt: thirtyDaysAgo },
      },
    });

    if (deleted.count > 0) {
      console.log(
        `[KeywordEngine] 清理了 ${deleted.count} 个过期退役组合`
      );
    }

    console.log('[KeywordEngine] 每日关键词生成任务完成');
  } catch (error) {
    console.log(
      '[KeywordEngine] 每日任务运行失败:',
      error instanceof Error ? error.message : error
    );
  }
}
