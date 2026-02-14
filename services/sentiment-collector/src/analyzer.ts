import { prisma } from './index.js';
import { logger } from './logger.js';

const BATCH_SIZE = 20;
const API_BASE = process.env.POA_MASTER_URL || 'http://localhost:3030';
const API_SECRET = process.env.SENTIMENT_API_SECRET || '';

export async function analyzeNewReviews(gameId: string) {
  const unanalyzed = await prisma.sentimentReview.findMany({
    where: { gameId, sentimentLabel: null },
    select: { id: true },
    take: 200,
  });

  if (unanalyzed.length === 0) return;

  logger.info(`[Analyzer] ${unanalyzed.length} unanalyzed reviews for game ${gameId}`);

  for (let i = 0; i < unanalyzed.length; i += BATCH_SIZE) {
    const batch = unanalyzed.slice(i, i + BATCH_SIZE);
    const reviewIds = batch.map(r => r.id);

    try {
      const res = await fetch(`${API_BASE}/api/sentiment/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_SECRET}`,
        },
        body: JSON.stringify({ reviewIds }),
      });

      if (!res.ok) {
        const text = await res.text();
        logger.error(`[Analyzer] API error (${res.status}):`, text);
        continue;
      }

      const data = await res.json();
      logger.info(`[Analyzer] Batch analyzed: ${data.analyzed} items`);
    } catch (error: any) {
      logger.error(`[Analyzer] Request failed:`, error.message);
    }
  }
}
