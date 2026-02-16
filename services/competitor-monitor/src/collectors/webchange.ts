import { createHash } from 'crypto';
import * as cheerio from 'cheerio';
import { prisma } from '../index.js';
import { logger } from '../logger.js';
import { createAlert } from '../alerter.js';

export async function detectWebChanges() {
  const competitors = await prisma.competitor.findMany({
    where: { enabled: true },
    select: { id: true, name: true, websiteUrl: true, monitorUrls: true },
  });

  logger.info(`[WebChange] Checking ${competitors.length} competitors...`);

  for (const comp of competitors) {
    const urls: { url: string; label: string }[] = [];

    if (comp.websiteUrl) {
      urls.push({ url: comp.websiteUrl, label: '官网' });
    }

    const extraUrls = comp.monitorUrls as Array<{ url: string; label: string }> || [];
    urls.push(...extraUrls);

    for (const { url, label } of urls) {
      try {
        await checkUrl(comp.id, comp.name, url, label);
      } catch (err: any) {
        logger.error(`[WebChange] ${comp.name} (${label}): ${err.message}`);
      }
    }
  }
}

async function checkUrl(compId: string, compName: string, url: string, label: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    logger.warn(`[WebChange] ${compName} (${label}): HTTP ${response.status}`);
    return;
  }

  const html = await response.text();

  const $ = cheerio.load(html);
  $('script, style, nav, header, footer, noscript, iframe').remove();
  const textContent = $('body').text().replace(/\s+/g, ' ').trim();

  const currentHash = createHash('sha256').update(textContent).digest('hex');

  const lastChange = await prisma.competitorWebChange.findFirst({
    where: { competitorId: compId, url },
    orderBy: { createdAt: 'desc' },
  });

  if (!lastChange) {
    await prisma.competitorWebChange.create({
      data: {
        competitorId: compId,
        url,
        changeType: 'baseline',
        summary: `首次采集 ${label} 页面`,
        previousHash: null,
        currentHash,
      },
    });
    logger.info(`[WebChange] ${compName} (${label}): baseline saved`);
    return;
  }

  if (lastChange.currentHash === currentHash) {
    return;
  }

  const prevLength = lastChange.diffText?.length || textContent.length;
  const changePct = Math.abs(textContent.length - prevLength) / Math.max(prevLength, 1);

  const changeType = changePct > 0.3 ? 'major_update' : 'content';
  const diffPreview = textContent.substring(0, 500);

  await prisma.competitorWebChange.create({
    data: {
      competitorId: compId,
      url,
      changeType,
      summary: `${label}页面有${changeType === 'major_update' ? '重大' : ''}更新（变化 ${Math.round(changePct * 100)}%）`,
      diffText: diffPreview,
      previousHash: lastChange.currentHash,
      currentHash,
    },
  });

  logger.info(`[WebChange] ${compName} (${label}): ${changeType} detected (${Math.round(changePct * 100)}% change)`);

  if (changeType === 'major_update') {
    await createAlert(
      compId,
      'website_change',
      'MEDIUM',
      `${compName} ${label}页面重大更新`,
      `页面内容变化 ${Math.round(changePct * 100)}%，可能涉及产品/运营策略调整`
    );
  }
}
