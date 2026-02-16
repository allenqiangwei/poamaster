import store from 'app-store-scraper';
import gplay from 'google-play-scraper';
import { prisma } from '../index.js';
import { logger } from '../logger.js';
import { analyzeReview } from '../sentiment.js';
import { createAlert } from '../alerter.js';

export async function collectCompetitorReviews() {
  const competitors = await prisma.competitor.findMany({
    where: { enabled: true },
    select: { id: true, name: true, appStoreId: true, googlePlayId: true },
  });

  logger.info(`[Reviews] Collecting for ${competitors.length} competitors...`);

  for (const comp of competitors) {
    if (comp.appStoreId) {
      await collectAppStoreReviews(comp.id, comp.name, comp.appStoreId).catch(err =>
        logger.error(`[Reviews] App Store failed for ${comp.name}: ${err.message}`)
      );
    }
    if (comp.googlePlayId) {
      await collectGooglePlayReviews(comp.id, comp.name, comp.googlePlayId).catch(err =>
        logger.error(`[Reviews] Google Play failed for ${comp.name}: ${err.message}`)
      );
    }
  }
}

async function collectAppStoreReviews(compId: string, name: string, appStoreId: string) {
  const numericId = appStoreId.replace(/\D/g, '');
  if (!numericId) return;

  try {
    const appInfo = await store.app({ id: numericId });
    await prisma.competitorAppSnapshot.create({
      data: {
        competitorId: compId,
        platform: 'appstore',
        rating: appInfo.score || null,
        ratingCount: appInfo.reviews || null,
        version: appInfo.version || null,
        releaseNotes: appInfo.releaseNotes || null,
        snapshotData: { title: appInfo.title, developer: appInfo.developer },
      },
    });
    await checkRatingDrop(compId, name, 'appstore', appInfo.score);
  } catch (err: any) {
    logger.warn(`[Reviews] App info fetch failed for ${name}: ${err.message}`);
  }

  let newCount = 0;
  for (const page of [1, 2, 3]) {
    try {
      const reviews = await store.reviews({
        id: numericId,
        page,
        sort: store.sort.RECENT,
        country: 'us',
      });
      if (!reviews || reviews.length === 0) break;

      for (const review of reviews) {
        const externalId = String(review.id);
        try {
          const rating = review.score || 3;
          const { sentiment, tags } = analyzeReview(review.title || null, review.text || '', rating);

          await prisma.competitorReview.create({
            data: {
              competitorId: compId,
              platform: 'appstore',
              externalId,
              author: review.userName || null,
              rating,
              title: review.title || null,
              content: review.text || '',
              sentiment,
              tags,
              reviewDate: review.updated ? new Date(review.updated) : new Date(),
            },
          });
          newCount++;
        } catch (err: any) {
          if (err.code === 'P2002') continue;
          throw err;
        }
      }
    } catch (err: any) {
      logger.warn(`[Reviews] App Store page ${page} failed for ${name}: ${err.message}`);
      break;
    }
  }

  logger.info(`[Reviews] ${name} (App Store): ${newCount} new reviews`);
}

async function collectGooglePlayReviews(compId: string, name: string, packageName: string) {
  try {
    const appInfo = await gplay.app({ appId: packageName });
    await prisma.competitorAppSnapshot.create({
      data: {
        competitorId: compId,
        platform: 'googleplay',
        rating: appInfo.score || null,
        ratingCount: appInfo.ratings || null,
        version: appInfo.version || null,
        releaseNotes: appInfo.recentChanges || null,
        snapshotData: { title: appInfo.title, developer: appInfo.developer },
      },
    });
    await checkRatingDrop(compId, name, 'googleplay', appInfo.score);
  } catch (err: any) {
    logger.warn(`[Reviews] Google Play info failed for ${name}: ${err.message}`);
  }

  let newCount = 0;
  try {
    const reviews = await gplay.reviews({
      appId: packageName,
      sort: gplay.sort.NEWEST,
      num: 100,
    });

    for (const item of reviews) {
      const externalId = item.id || String(item.date);
      try {
        const rating = item.score || 3;
        const { sentiment, tags } = analyzeReview(item.title || null, item.text || '', rating);

        await prisma.competitorReview.create({
          data: {
            competitorId: compId,
            platform: 'googleplay',
            externalId,
            author: item.userName || null,
            rating,
            title: item.title || null,
            content: item.text || '',
            sentiment,
            tags,
            reviewDate: item.date ? new Date(item.date) : new Date(),
          },
        });
        newCount++;
      } catch (err: any) {
        if (err.code === 'P2002') continue;
        throw err;
      }
    }
  } catch (err: any) {
    logger.warn(`[Reviews] Google Play reviews failed for ${name}: ${err.message}`);
  }

  logger.info(`[Reviews] ${name} (Google Play): ${newCount} new reviews`);
}

async function checkRatingDrop(compId: string, name: string, platform: string, currentRating: number | null) {
  if (currentRating == null) return;

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const prevSnapshot = await prisma.competitorAppSnapshot.findFirst({
    where: {
      competitorId: compId,
      platform,
      createdAt: { lt: yesterday },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (prevSnapshot?.rating && prevSnapshot.rating - currentRating > 0.3) {
    await createAlert(
      compId,
      'rating_drop',
      'HIGH',
      `${name} ${platform} 评分骤降`,
      `评分从 ${prevSnapshot.rating.toFixed(1)} 降至 ${currentRating.toFixed(1)}（降幅 ${(prevSnapshot.rating - currentRating).toFixed(2)}）`
    );
  }
}
