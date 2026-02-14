import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOpenAIClient } from '@/lib/openai';

// POST /api/sentiment/analyze — Batch sentiment analysis (service-to-service auth)
export async function POST(request: NextRequest) {
  // Service-to-service auth via Bearer token
  const authHeader = request.headers.get('Authorization');
  const expectedSecret = process.env.SENTIMENT_API_SECRET;

  if (!expectedSecret) {
    console.error('SENTIMENT_API_SECRET not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { reviewIds, mentionIds } = body;

    const results: Array<{ id: string; type: string; sentimentLabel: string; sentimentScore: number; keyIssues: string[] }> = [];

    // Analyze reviews
    if (Array.isArray(reviewIds) && reviewIds.length > 0) {
      const reviews = await prisma.sentimentReview.findMany({
        where: {
          id: { in: reviewIds },
          sentimentLabel: null,
        },
      });

      for (const review of reviews) {
        const text = buildReviewText(review.title, review.content, review.rating);
        const analysis = await analyzeSentiment(text);

        await prisma.sentimentReview.update({
          where: { id: review.id },
          data: {
            sentimentScore: analysis.sentimentScore,
            sentimentLabel: analysis.sentimentLabel,
            keyIssues: analysis.keyIssues,
          },
        });

        results.push({ id: review.id, type: 'review', ...analysis });
      }
    }

    // Analyze mentions
    if (Array.isArray(mentionIds) && mentionIds.length > 0) {
      const mentions = await prisma.sentimentMention.findMany({
        where: {
          id: { in: mentionIds },
          sentimentLabel: null,
        },
      });

      for (const mention of mentions) {
        const text = buildMentionText(mention.content);
        const analysis = await analyzeSentiment(text);

        await prisma.sentimentMention.update({
          where: { id: mention.id },
          data: {
            sentimentScore: analysis.sentimentScore,
            sentimentLabel: analysis.sentimentLabel,
            keyIssues: analysis.keyIssues,
          },
        });

        results.push({ id: mention.id, type: 'mention', ...analysis });
      }
    }

    return NextResponse.json({
      success: true,
      analyzed: results.length,
      results,
    });
  } catch (error) {
    console.error('Sentiment analysis failed:', error);
    return NextResponse.json({ error: 'Sentiment analysis failed' }, { status: 500 });
  }
}

function buildReviewText(title: string | null, content: string, rating: number): string {
  const ratingPrefix = `(${rating}\u2605)`;
  const titlePart = title ? `${title} \u2014 ` : '';
  const fullText = `${ratingPrefix} ${titlePart}${content}`;
  return fullText.substring(0, 500);
}

function buildMentionText(content: string): string {
  return content.substring(0, 500);
}

const SENTIMENT_SYSTEM_PROMPT = `You are a game review sentiment analyzer. Analyze the given game review or social media mention and return a JSON object with:
- sentimentScore: a float between -1 (very negative) and 1 (very positive)
- sentimentLabel: one of "POSITIVE", "NEUTRAL", or "NEGATIVE"
- keyIssues: an array of short tags describing the main topics/issues mentioned (e.g. "bugs", "monetization", "gameplay", "graphics", "performance", "customer support"). Return up to 5 tags.

Rules:
- Score >= 0.2 → POSITIVE
- Score <= -0.2 → NEGATIVE
- Otherwise → NEUTRAL
- Tags should be lowercase English keywords
- Return valid JSON only`;

async function analyzeSentiment(text: string): Promise<{
  sentimentScore: number;
  sentimentLabel: string;
  keyIssues: string[];
}> {
  const client = await getOpenAIClient();

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SENTIMENT_SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from LLM');
  }

  const parsed = JSON.parse(content);

  return {
    sentimentScore: typeof parsed.sentimentScore === 'number' ? parsed.sentimentScore : 0,
    sentimentLabel: ['POSITIVE', 'NEUTRAL', 'NEGATIVE'].includes(parsed.sentimentLabel)
      ? parsed.sentimentLabel
      : 'NEUTRAL',
    keyIssues: Array.isArray(parsed.keyIssues)
      ? parsed.keyIssues.filter((i: unknown) => typeof i === 'string').slice(0, 5)
      : [],
  };
}
