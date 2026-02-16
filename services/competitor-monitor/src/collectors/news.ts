import Parser from 'rss-parser';
import { prisma } from '../index.js';
import { logger } from '../logger.js';
import { createAlert } from '../alerter.js';

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; POABot/1.0)',
  },
});

export async function collectCompetitorNews() {
  const competitors = await prisma.competitor.findMany({
    where: { enabled: true },
    select: { id: true, name: true, rssFeeds: true, keywords: true },
  });

  logger.info(`[News] Checking ${competitors.length} competitors...`);

  const allFeeds: Array<{ compId: string; compName: string; url: string; label: string; keywords: string[] }> = [];

  for (const comp of competitors) {
    const feeds = comp.rssFeeds as Array<{ url: string; label: string }> || [];
    const keywords = comp.keywords as string[] || [];

    for (const feed of feeds) {
      allFeeds.push({
        compId: comp.id,
        compName: comp.name,
        url: feed.url,
        label: feed.label,
        keywords: [comp.name, ...keywords],
      });
    }
  }

  if (allFeeds.length === 0) {
    logger.info('[News] No RSS feeds configured');
    return;
  }

  for (const feed of allFeeds) {
    try {
      await collectFeed(feed);
    } catch (err: any) {
      logger.error(`[News] Feed ${feed.label} failed: ${err.message}`);
    }
  }
}

async function collectFeed(feed: {
  compId: string;
  compName: string;
  url: string;
  label: string;
  keywords: string[];
}) {
  let parsed;
  try {
    parsed = await parser.parseURL(feed.url);
  } catch (err: any) {
    logger.warn(`[News] Failed to parse RSS ${feed.label}: ${err.message}`);
    return;
  }

  const items = parsed.items || [];
  let newCount = 0;

  for (const item of items) {
    if (!item.title || !item.link) continue;

    const text = `${item.title} ${item.contentSnippet || item.content || ''}`.toLowerCase();
    const matched = feed.keywords.some(kw => text.includes(kw.toLowerCase()));
    if (!matched) continue;

    try {
      await prisma.competitorNews.create({
        data: {
          competitorId: feed.compId,
          title: item.title,
          url: item.link,
          source: feed.label || parsed.title || 'RSS',
          summary: (item.contentSnippet || item.content || '').substring(0, 500),
          publishedAt: item.pubDate ? new Date(item.pubDate) : null,
        },
      });
      newCount++;

      const highImpactTerms = ['融资', '收购', '合并', 'IPO', '上市', '裁员', '关闭',
        'funding', 'acquisition', 'merger', 'layoff', 'shutdown'];
      const isHighImpact = highImpactTerms.some(t => text.includes(t.toLowerCase()));

      if (isHighImpact) {
        await createAlert(
          feed.compId,
          'big_news',
          'HIGH',
          `${feed.compName} 重大新闻: ${item.title}`,
          (item.contentSnippet || '').substring(0, 200)
        );
      }
    } catch (err: any) {
      if (err.code === 'P2002') continue;
      logger.warn(`[News] Failed to save news "${item.title}": ${err.message}`);
    }
  }

  if (newCount > 0) {
    logger.info(`[News] ${feed.compName} (${feed.label}): ${newCount} new articles`);
  }
}
