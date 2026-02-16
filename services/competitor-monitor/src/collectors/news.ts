/**
 * Competitor News Collector — Serper.dev Web Search
 *
 * Searches the web using each competitor's keywords via Google Search (Serper API),
 * deduplicates results, and saves new articles as CompetitorNews entries.
 */

import { prisma } from '../index.js';
import { logger } from '../logger.js';
import { createAlert } from '../alerter.js';
import { getConfig } from '../config.js';

interface SerperResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
}

interface SerperResponse {
  organic?: SerperResult[];
}

export async function collectCompetitorNews() {
  const apiKey = await getConfig('serper.apiKey');
  if (!apiKey) {
    logger.error('[News] Serper API Key 未配置，跳过新闻搜索');
    return;
  }

  const competitors = await prisma.competitor.findMany({
    where: { enabled: true },
    select: { id: true, name: true, keywords: true },
  });

  logger.info(`[News] Searching news for ${competitors.length} competitors...`);

  for (const comp of competitors) {
    const keywords = (comp.keywords as string[]) || [];
    if (keywords.length === 0) {
      logger.info(`[News] ${comp.name}: no keywords configured, skipping`);
      continue;
    }

    try {
      await searchForCompetitor(apiKey, comp.id, comp.name, keywords);
    } catch (err: any) {
      logger.error(`[News] ${comp.name}: search failed — ${err.message}`);
    }
  }
}

async function searchForCompetitor(
  apiKey: string,
  compId: string,
  compName: string,
  keywords: string[]
) {
  // Build 1-2 search queries from keywords
  // Query 1: competitor name + "最新" for recent news
  // Query 2: all keywords joined (if there are extra keywords beyond the name)
  const queries: string[] = [`${compName} 最新动态`];
  if (keywords.length > 0) {
    queries.push(keywords.slice(0, 3).join(' '));
  }

  const seenUrls = new Set<string>();
  let totalNew = 0;

  // Load existing URLs to avoid re-inserting
  const existing = await prisma.competitorNews.findMany({
    where: { competitorId: compId },
    select: { url: true },
  });
  for (const e of existing) seenUrls.add(e.url);

  for (const query of queries) {
    try {
      const results = await serperSearch(apiKey, query);

      for (const item of results) {
        if (seenUrls.has(item.link)) continue;
        seenUrls.add(item.link);

        // Check keyword relevance — at least one keyword must appear in title or snippet
        const text = `${item.title} ${item.snippet}`.toLowerCase();
        const relevant = keywords.some(kw => text.includes(kw.toLowerCase()))
          || text.includes(compName.toLowerCase());
        if (!relevant) continue;

        try {
          await prisma.competitorNews.create({
            data: {
              competitorId: compId,
              title: item.title,
              url: item.link,
              source: 'Google Search',
              summary: item.snippet.substring(0, 500),
              publishedAt: item.date ? parseLooseDate(item.date) : null,
            },
          });
          totalNew++;

          // High-impact detection
          const highImpactTerms = [
            '融资', '收购', '合并', 'IPO', '上市', '裁员', '关闭', '倒闭',
            '新版本', '重大更新', '下架',
            'funding', 'acquisition', 'merger', 'layoff', 'shutdown',
          ];
          const isHighImpact = highImpactTerms.some(t => text.includes(t.toLowerCase()));

          if (isHighImpact) {
            await createAlert(
              compId,
              'big_news',
              'HIGH',
              `${compName} 重大新闻: ${item.title}`,
              item.snippet.substring(0, 200)
            );
          }
        } catch (err: any) {
          if (err.code === 'P2002') continue; // duplicate
          logger.warn(`[News] Failed to save "${item.title}": ${err.message}`);
        }
      }
    } catch (err: any) {
      logger.warn(`[News] Serper query "${query}" failed: ${err.message}`);
    }
  }

  if (totalNew > 0) {
    logger.info(`[News] ${compName}: ${totalNew} new articles from web search`);
  }
}

async function serperSearch(apiKey: string, query: string): Promise<SerperResult[]> {
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
      tbs: 'qdr:w', // limit to past week
    }),
  });

  if (!response.ok) {
    throw new Error(`Serper API ${response.status}: ${response.statusText}`);
  }

  const data: SerperResponse = await response.json();
  return data.organic || [];
}

/** Parse loose date strings like "3 days ago", "2026-02-14", etc. */
function parseLooseDate(dateStr: string): Date | null {
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
  } catch {}
  return null;
}
