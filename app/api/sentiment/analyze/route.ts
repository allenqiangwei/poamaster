import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { getOpenAIClient } from '@/lib/openai';

const BATCH_SIZE = 20;

// POST /api/sentiment/analyze — Batch sentiment analysis (manual trigger from UI)
export async function POST(request: NextRequest) {
  // Support both cookie auth (UI) and Bearer token (service)
  const authHeader = request.headers.get('Authorization');
  const expectedSecret = process.env.SENTIMENT_API_SECRET;

  if (authHeader && expectedSecret && authHeader === `Bearer ${expectedSecret}`) {
    // service-to-service auth OK
  } else {
    // cookie auth
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }
  }

  try {
    const body = await request.json();
    const { gameId } = body;

    // Find unanalyzed reviews
    const where: any = { sentimentLabel: null };
    if (gameId) where.gameId = gameId;

    const unanalyzed = await prisma.sentimentReview.findMany({
      where,
      select: { id: true, title: true, content: true, rating: true },
      take: 200,
    });

    if (unanalyzed.length === 0) {
      return NextResponse.json({ success: true, analyzed: 0, message: 'No unanalyzed reviews' });
    }

    let analyzed = 0;

    // Process in batches of BATCH_SIZE
    for (let i = 0; i < unanalyzed.length; i += BATCH_SIZE) {
      const batch = unanalyzed.slice(i, i + BATCH_SIZE);
      const batchTexts = batch.map((r, idx) => {
        const rating = `(${r.rating}★)`;
        const title = r.title ? `${r.title} — ` : '';
        return `[${idx + 1}] ${rating} ${title}${r.content}`.substring(0, 300);
      });

      const results = await analyzeBatch(batchTexts);

      for (let j = 0; j < batch.length; j++) {
        const analysis = results[j];
        if (!analysis) continue;

        await prisma.sentimentReview.update({
          where: { id: batch[j].id },
          data: {
            sentimentScore: analysis.sentimentScore,
            sentimentLabel: analysis.sentimentLabel,
            keyIssues: analysis.keyIssues,
          },
        });
        analyzed++;
      }
    }

    return NextResponse.json({ success: true, analyzed });
  } catch (error: any) {
    console.error('Sentiment analysis failed:', error);
    return NextResponse.json({ error: error.message || 'Sentiment analysis failed' }, { status: 500 });
  }
}

const BATCH_SYSTEM_PROMPT = `You are a game review sentiment analyzer. You will receive multiple reviews numbered [1], [2], etc. Analyze each and return a JSON object:
{
  "results": [
    { "index": 1, "sentimentScore": 0.8, "sentimentLabel": "POSITIVE", "keyIssues": ["gameplay"] },
    ...
  ]
}

Rules:
- sentimentScore: float from -1.0 (very negative) to 1.0 (very positive)
- sentimentLabel: "POSITIVE" (score >= 0.2), "NEGATIVE" (score <= -0.2), "NEUTRAL" (otherwise)
- keyIssues: up to 5 lowercase English tags (e.g. "bugs", "monetization", "gameplay", "graphics", "performance", "customer support", "ads", "updates", "pay-to-win")
- Return valid JSON only, one result per review in order`;

async function analyzeBatch(texts: string[]): Promise<Array<{
  sentimentScore: number;
  sentimentLabel: string;
  keyIssues: string[];
} | null>> {
  const client = await getOpenAIClient();

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: BATCH_SYSTEM_PROMPT },
      { role: 'user', content: texts.join('\n\n') },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return texts.map(() => null);

  const parsed = JSON.parse(content);
  const rawResults: any[] = parsed.results || [];

  return texts.map((_, idx) => {
    const r = rawResults.find((x: any) => x.index === idx + 1) || rawResults[idx];
    if (!r) return null;
    return {
      sentimentScore: typeof r.sentimentScore === 'number' ? r.sentimentScore : 0,
      sentimentLabel: ['POSITIVE', 'NEUTRAL', 'NEGATIVE'].includes(r.sentimentLabel)
        ? r.sentimentLabel : 'NEUTRAL',
      keyIssues: Array.isArray(r.keyIssues)
        ? r.keyIssues.filter((i: unknown) => typeof i === 'string').slice(0, 5) : [],
    };
  });
}
