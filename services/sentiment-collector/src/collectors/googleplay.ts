import gplay from 'google-play-scraper';
import { prisma } from '../index.js';
import { logger } from '../logger.js';
import { analyzeReview } from '../sentiment.js';

export async function collectAllGooglePlayReviews() {
  const games = await prisma.monitoredGame.findMany({
    where: { isActive: true, googlePlayId: { not: null } },
    select: { id: true, name: true, googlePlayId: true },
  });

  logger.info(`[GooglePlay] Collecting reviews for ${games.length} games...`);

  for (const game of games) {
    try {
      await collectGameReviews(game.id, game.name, game.googlePlayId!);
    } catch (error: any) {
      logger.error(`[GooglePlay] Failed for ${game.name}:`, error.message);
    }
  }
}

async function collectGameReviews(gameId: string, gameName: string, googlePlayId: string) {
  let newCount = 0;

  try {
    const reviews = await gplay.reviews({
      appId: googlePlayId,
      sort: gplay.sort.NEWEST,
      num: 200,
      lang: 'en',
      country: 'us',
    });

    const reviewList = (reviews as any).data || reviews || [];

    for (const review of reviewList) {
      const externalId = review.id;
      if (!externalId) continue;

      try {
        const rating = review.score || 3;
        const title = review.title || null;
        const content = review.text || '';
        const sentiment = analyzeReview(title, content, rating);

        await prisma.sentimentReview.create({
          data: {
            gameId,
            platform: 'GOOGLE_PLAY',
            externalId,
            author: review.userName || null,
            rating,
            title,
            content,
            sentimentScore: sentiment.sentimentScore,
            sentimentLabel: sentiment.sentimentLabel,
            keyIssues: sentiment.keyIssues,
            publishedAt: review.date ? new Date(review.date) : new Date(),
          },
        });
        newCount++;
      } catch (error: any) {
        if (error.code === 'P2002') continue;
        throw error;
      }
    }
  } catch (error: any) {
    logger.error(`[GooglePlay] Collection error for ${gameName}:`, error.message);
  }

  logger.info(`[GooglePlay] ${gameName}: ${newCount} new reviews`);
}
