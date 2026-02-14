import store from 'app-store-scraper';
import { prisma } from '../index.js';
import { logger } from '../logger.js';

export async function collectAllReviews() {
  const games = await prisma.monitoredGame.findMany({
    where: { isActive: true, appStoreId: { not: null } },
    select: { id: true, name: true, appStoreId: true },
  });

  logger.info(`[AppStore] Collecting reviews for ${games.length} games...`);

  for (const game of games) {
    try {
      await collectGameReviews(game.id, game.name, game.appStoreId!);
    } catch (error: any) {
      logger.error(`[AppStore] Failed for ${game.name}:`, error.message);
    }
  }
}

async function collectGameReviews(gameId: string, gameName: string, appStoreId: string) {
  const numericId = appStoreId.replace(/\D/g, '');
  if (!numericId) {
    logger.warn(`[AppStore] Invalid App Store ID for ${gameName}: ${appStoreId}`);
    return;
  }

  let newCount = 0;

  for (const page of [1, 2, 3, 4, 5]) {
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
          await prisma.sentimentReview.create({
            data: {
              gameId,
              platform: 'APP_STORE',
              externalId,
              author: review.userName || null,
              rating: review.score || 3,
              title: review.title || null,
              content: review.text || '',
              publishedAt: review.updated ? new Date(review.updated) : new Date(),
            },
          });
          newCount++;
        } catch (error: any) {
          if (error.code === 'P2002') continue; // duplicate
          throw error;
        }
      }
    } catch (error: any) {
      logger.warn(`[AppStore] Page ${page} failed for ${gameName}:`, error.message);
      break;
    }
  }

  logger.info(`[AppStore] ${gameName}: ${newCount} new reviews`);
}
