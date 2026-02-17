// lib/insights/researcher.ts

import { prisma } from '@/lib/prisma';
import { getOpenAIClient, getOpenAIModel } from '@/lib/openai';
import { getConfig } from '@/lib/config';
import type { InsightTopic } from '@prisma/client';

// ========== Recently Used URL Cache ==========

/**
 * Get URLs that have been cited in InsightCards in the last N days.
 * Used to filter out already-analyzed search results.
 */
async function getRecentlyUsedUrls(days: number = 7): Promise<Set<string>> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const recentCards = await prisma.insightCard.findMany({
    where: { createdAt: { gte: since } },
    select: { sources: true },
  });

  const urls = new Set<string>();
  for (const card of recentCards) {
    const sources = card.sources as any[];
    if (Array.isArray(sources)) {
      for (const s of sources) {
        if (s?.url) urls.add(s.url);
      }
    }
  }
  return urls;
}

/**
 * Get recent card titles for a specific topic (for dedup context in prompts).
 */
export async function getRecentCardTitles(topicId: string, days: number = 3): Promise<string[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const cards = await prisma.insightCard.findMany({
    where: { topicId, createdAt: { gte: since } },
    select: { title: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  return cards.map(c => c.title);
}

// ========== Types ==========

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  date?: string;
}

export interface InsightAnalysis {
  category: string;
  priority: string;
  title: string;
  summary: string;
  details: string;
  impact: string | null;
  action: string | null;
  sources: { title: string; url: string }[];
}

// Serper API response types
interface SerperOrganicResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
}

interface SerperResponse {
  organic?: SerperOrganicResult[];
}

// ========== Search ==========

/**
 * Generate search queries from topic name and keywords.
 * Produces 1-3 queries mixing Chinese and English terms.
 */
function buildSearchQueries(topic: InsightTopic): string[] {
  const queries: string[] = [];

  // Primary query: topic name directly
  queries.push(topic.name);

  // If there are keywords, create combined queries
  if (topic.keywords && topic.keywords.length > 0) {
    // Second query: topic name + first few keywords
    const keywordStr = topic.keywords.slice(0, 3).join(' ');
    queries.push(`${topic.name} ${keywordStr}`);

    // Third query: keywords only (if there are enough to form a meaningful query)
    if (topic.keywords.length >= 2) {
      queries.push(topic.keywords.slice(0, 4).join(' '));
    }
  }

  // Cap at 3 queries
  return queries.slice(0, 3);
}

/**
 * Check if a search result date is within the last 7 days.
 * If no date is available, the result is kept (benefit of the doubt).
 */
function isWithinLast7Days(dateStr?: string): boolean {
  if (!dateStr) return true;

  try {
    const resultDate = new Date(dateStr);
    if (isNaN(resultDate.getTime())) return true;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return resultDate >= sevenDaysAgo;
  } catch {
    return true;
  }
}

/**
 * Search the internet for a given topic using Serper (Google Search API).
 * Generates 1-3 search queries, deduplicates results, and filters out old ones.
 */
export async function searchTopic(topic: InsightTopic): Promise<SearchResult[]> {
  const apiKey = await getConfig('serper.apiKey');
  if (!apiKey) {
    throw new Error(
      'Serper API Key 未配置。请在设置页面添加 serper.apiKey 配置，' +
      '或访问 https://serper.dev 获取 API Key'
    );
  }

  const queries = buildSearchQueries(topic);
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
        body: JSON.stringify({
          q: query,
          gl: 'cn',
          hl: 'zh-cn',
          num: 10,
        }),
      });

      if (!response.ok) {
        console.error(
          `[Researcher] Serper API error for query "${query}": ${response.status} ${response.statusText}`
        );
        continue;
      }

      const data: SerperResponse = await response.json();
      const organicResults = data.organic || [];

      for (const item of organicResults) {
        // Deduplicate by URL
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
      console.error(`[Researcher] Search failed for query "${query}":`, error);
      // Continue with other queries
    }
  }

  // Filter out results older than 7 days
  const recentResults = allResults.filter((r) => isWithinLast7Days(r.date));

  return recentResults;
}

// ========== Analysis ==========

const ANALYSIS_SYSTEM_PROMPT = `你是一位顶级情报分析师，为 CEO 提供深度行业洞察。你的分析风格类似于顶级咨询公司的研究报告——**叙事流畅、论据扎实、洞见独到**。

## 核心原则

**不要写模板化的分析，要写有血有肉的研究报告。**

好的分析像这样：
> 这段时间里有一个明显的短期爆发性流量现象——不是因为游戏做了大的系统性改动，而是一次"事件驱动 + 社区内容涌现"的组合引爆了市场关注。围绕 Frontline Breakthrough 活动的攻略视频在 YouTube 密集出现，形成了"付费曝光 → 教学内容 → 玩家兴趣 → 更多点击"的循环放大效应...

差的分析像这样：
> 近期行业出现了一些新动态。多家企业发布了新产品。市场表现有所波动。建议持续关注。

## 输出格式

返回严格 JSON，字段如下：

- **category**: risk | industry | competitor | internal | tech | opportunity
- **priority**: high | medium | low
- **title**: 一句话标题，要有信息量（如"《Last War》Frontline Breakthrough 活动引爆短期 SLG 流量"，而非"SLG行业动态"）
- **summary**: 3-5 句话，包含具体事件名、企业名、数据点、时间——读完 summary 就能知道发生了什么
- **details**: Markdown 格式的**叙事式深度分析**（中文），至少 400 字，要求：
  1. **用叙事方式展开**，不要用"事件概述""关键发现"等模板标题，像写一篇分析文章一样自然展开
  2. **提到具体名称**：产品名、公司名、人名、活动名、数字、日期——越具体越好
  3. **构建因果链**：A 导致了 B，B 又引发了 C，形成了 D 效应
  4. **多源交叉验证**：综合多条搜索结果的信息，形成完整画面，在分析中自然提及信息来源
  5. **前瞻性判断**：这意味着什么？接下来会怎样？需要关注什么信号？
  6. 可以使用 **加粗** 强调关键信息
- **impact**: 对我们业务的具体影响路径（不是泛泛的"可能有影响"，要说清楚怎么影响、影响多大），无明显影响则为 null
- **action**: 可执行的下一步建议（具体到做什么），无需行动则为 null
- **sources**: [{title, url}] 引用的信息源

## 分类标准

- risk: 风险信号（政策、市场波动、安全威胁）
- industry: 行业趋势、市场动态
- competitor: 竞品动态、产品发布
- internal: 与公司内部运营相关
- tech: 技术突破、新工具
- opportunity: 商业机会、市场空白

## 优先级标准

- high: 需要立即关注或重大影响
- medium: 值得了解但不紧急
- low: 背景参考信息`;

/**
 * Analyze a topic using LLM based on search results and optional internal context.
 */
export async function analyzeTopicWithContext(
  topic: InsightTopic,
  searchResults: SearchResult[],
  internalContext?: string,
  modelOverride?: string
): Promise<InsightAnalysis> {
  const client = await getOpenAIClient();
  const model = modelOverride || await getOpenAIModel();

  // Build the search results context block — structured for easy cross-referencing
  const searchContext = searchResults
    .map((r, i) => {
      let entry = `[来源${i + 1}] ${r.title}`;
      if (r.date) entry += ` (${r.date})`;
      entry += `\n链接: ${r.url}`;
      entry += `\n内容: ${r.snippet}`;
      return entry;
    })
    .join('\n\n');

  // Get recent card titles for this topic to avoid repetition (Layer 3 dedup)
  const recentTitles = await getRecentCardTitles(topic.id, 3);

  // Build the user prompt
  let userPrompt = `## 研究话题
话题名称：${topic.name}`;

  if (topic.keywords && topic.keywords.length > 0) {
    userPrompt += `\n关键词：${topic.keywords.join('、')}`;
  }

  userPrompt += `\n\n## 搜索结果\n${searchContext || '（无搜索结果）'}`;

  if (internalContext) {
    userPrompt += `\n\n## 内部数据参考\n${internalContext}`;
  }

  // Inject recent coverage to prevent repetition
  if (recentTitles.length > 0) {
    userPrompt += `\n\n## 近期已覆盖事件（请勿重复分析）\n以下是近 3 天该话题已生成的洞察卡片标题，请聚焦新发现，不要重复这些内容：\n${recentTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
  }

  userPrompt += `\n\n请基于以上搜索结果，撰写一篇深度洞察分析。

写作指导：
1. 先通读所有搜索结果，找出其中的**核心事件/趋势**
2. 用叙事方式展开分析，像写一篇行业研究文章，不要用模板化的"事件概述""关键发现"等小标题
3. details 中要具体提到搜索结果里的**产品名、公司名、活动名、数据、日期**
4. 如果多条搜索结果从不同角度说同一件事，要综合成完整画面并构建因果链
5. 在分析中自然地引用信息来源（如"根据 XX 报道..."、"XX 社区的讨论显示..."）
6. **重要：如果搜索结果中的事件与"近期已覆盖事件"高度重叠，请聚焦增量信息（新进展、新数据、新观点），不要重复旧分析**
7. 如果所有搜索结果都是旧事件的重复报道，没有任何新信息，请在 title 中标注 "[无增量]" 前缀

返回 JSON 格式。`;

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.4,
    max_completion_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI 返回了空响应');
  }

  const parsed = JSON.parse(content);

  // Validate and normalize the response
  const validCategories = ['risk', 'industry', 'competitor', 'internal', 'tech', 'opportunity'];
  const validPriorities = ['high', 'medium', 'low'];

  const analysis: InsightAnalysis = {
    category: validCategories.includes(parsed.category) ? parsed.category : 'industry',
    priority: validPriorities.includes(parsed.priority) ? parsed.priority : 'medium',
    title: parsed.title || topic.name,
    summary: parsed.summary || '',
    details: parsed.details || '',
    impact: parsed.impact || null,
    action: Array.isArray(parsed.action) ? parsed.action.join('\n') : (parsed.action || null),
    sources: Array.isArray(parsed.sources)
      ? parsed.sources
          .filter((s: any) => s && s.title && s.url)
          .map((s: any) => ({ title: String(s.title), url: String(s.url) }))
      : [],
  };

  return analysis;
}

// ========== Orchestrator ==========

/**
 * Full research pipeline for a single topic:
 * 1. Search the internet for the topic
 * 2. Analyze search results with LLM
 * 3. Update topic.lastHitAt on success
 *
 * Returns null on failure (errors are logged, not thrown).
 */
export async function researchTopic(topic: InsightTopic, modelOverride?: string): Promise<InsightAnalysis | null> {
  try {
    console.log(`[Researcher] Starting research for topic: "${topic.name}" (${topic.id}) with model: ${modelOverride || 'default'}`);

    // Step 1: Search
    const searchResults = await searchTopic(topic);
    console.log(`[Researcher] Found ${searchResults.length} search results for "${topic.name}"`);

    if (searchResults.length === 0) {
      console.log(`[Researcher] No search results found for "${topic.name}", skipping analysis`);
      return null;
    }

    // Step 2: Analyze with specified model
    const analysis = await analyzeTopicWithContext(topic, searchResults, undefined, modelOverride);
    console.log(
      `[Researcher] Analysis complete for "${topic.name}": ` +
      `category=${analysis.category}, priority=${analysis.priority}`
    );

    // Step 3: Update lastHitAt
    await prisma.insightTopic.update({
      where: { id: topic.id },
      data: { lastHitAt: new Date() },
    });

    return analysis;
  } catch (error) {
    console.error(`[Researcher] Research failed for topic "${topic.name}":`, error);
    return null;
  }
}

// ========== Combo-aware Search & Research ==========

/**
 * Search using a keyword combo instead of the topic's own keywords.
 * Builds 2 queries: topicName + combo keywords, and combo keywords alone (if >= 2).
 * Deduplicates by URL and filters to last 7 days.
 */
export async function searchWithCombo(
  topicName: string,
  combo: { id: string; keywords: string[] }
): Promise<SearchResult[]> {
  const apiKey = await getConfig('serper.apiKey');
  if (!apiKey) {
    throw new Error(
      'Serper API Key 未配置。请在设置页面添加 serper.apiKey 配置，' +
      '或访问 https://serper.dev 获取 API Key'
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
        body: JSON.stringify({
          q: query,
          gl: 'cn',
          hl: 'zh-cn',
          num: 10,
        }),
      });

      if (!response.ok) {
        console.error(
          `[Researcher] Serper API error for combo query "${query}": ${response.status} ${response.statusText}`
        );
        continue;
      }

      const data: SerperResponse = await response.json();
      const organicResults = data.organic || [];

      for (const item of organicResults) {
        // Deduplicate by URL
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
      console.error(`[Researcher] Combo search failed for query "${query}":`, error);
      // Continue with other queries
    }
  }

  // Filter out results older than 7 days
  const recentResults = allResults.filter((r) => isWithinLast7Days(r.date));

  // Filter out URLs already used in recent cards (Layer 1 dedup)
  let usedUrls = await getRecentlyUsedUrls(7);
  let dedupedResults = recentResults.filter(r => !usedUrls.has(r.url));

  // If too few results remain, relax to 3-day window
  if (dedupedResults.length < 3 && recentResults.length >= 3) {
    usedUrls = await getRecentlyUsedUrls(3);
    dedupedResults = recentResults.filter(r => !usedUrls.has(r.url));
    console.log(`[Researcher] URL dedup relaxed to 3-day window: ${dedupedResults.length}/${recentResults.length} results kept`);
  } else {
    const filtered = recentResults.length - dedupedResults.length;
    if (filtered > 0) {
      console.log(`[Researcher] URL dedup: filtered ${filtered} already-used URLs, ${dedupedResults.length} remaining`);
    }
  }

  return dedupedResults;
}

/**
 * Full research pipeline using a keyword combo:
 * 1. Search using combo keywords
 * 2. Analyze with LLM (using combo keywords on a modified topic)
 * 3. Update combo stats (lastUsedAt, usedCount, promote 'new' to 'active')
 * 4. Update topic.lastHitAt
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
      `[Researcher] Starting combo research for topic "${topic.name}" with combo ${combo.id} ` +
      `(keywords: ${combo.keywords.join(', ')})`
    );

    // Step 1: Search with combo
    const searchResults = await searchWithCombo(topic.name, combo);
    console.log(`[Researcher] Found ${searchResults.length} results for combo ${combo.id}`);

    if (searchResults.length === 0) {
      console.log(`[Researcher] No results for combo ${combo.id}, skipping analysis`);
      return null;
    }

    // Step 2: Analyze — create a modified topic with combo keywords
    const modifiedTopic = { ...topic, keywords: combo.keywords };
    const analysis = await analyzeTopicWithContext(modifiedTopic, searchResults, undefined, modelOverride);
    console.log(
      `[Researcher] Combo analysis complete for "${topic.name}" combo ${combo.id}: ` +
      `category=${analysis.category}, priority=${analysis.priority}`
    );

    // Step 3: Update combo stats
    const comboUpdate: Record<string, any> = {
      lastUsedAt: new Date(),
      usedCount: { increment: 1 },
    };
    if (combo.status === 'new') {
      comboUpdate.status = 'active';
    }
    await prisma.keywordCombo.update({
      where: { id: combo.id },
      data: comboUpdate,
    });

    // Step 4: Update topic.lastHitAt
    await prisma.insightTopic.update({
      where: { id: topic.id },
      data: { lastHitAt: new Date() },
    });

    return { analysis, comboId: combo.id };
  } catch (error) {
    console.error(`[Researcher] Combo research failed for topic "${topic.name}" combo ${combo.id}:`, error);
    return null;
  }
}
