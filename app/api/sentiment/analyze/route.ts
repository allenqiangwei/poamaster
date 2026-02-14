import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import Sentiment from 'sentiment';

const analyzer = new Sentiment();

// Game review keyword boosters for more accurate analysis
const GAME_KEYWORDS: Record<string, number> = {
  // Negative
  'bug': -3, 'bugs': -3, 'crash': -4, 'crashes': -4, 'lag': -3, 'laggy': -3,
  'p2w': -4, 'pay2win': -4, 'pay-to-win': -4, 'paywall': -3,
  'scam': -4, 'ripoff': -4, 'rip-off': -4, 'greedy': -3,
  'unplayable': -4, 'broken': -3, 'glitch': -3, 'glitchy': -3,
  'uninstall': -3, 'uninstalled': -3, 'deleted': -2, 'waste': -3,
  'boring': -2, 'repetitive': -2, 'grindy': -2, 'grind': -1,
  'ads': -2, 'advertisement': -2, 'spammy': -3,
  'nerf': -2, 'nerfed': -2, 'unfair': -3, 'unbalanced': -2,
  'expensive': -2, 'overpriced': -3, 'money grab': -4,
  // Positive
  'addictive': 3, 'addicting': 3, 'polished': 3, 'smooth': 2,
  'f2p': 2, 'free-to-play': 2, 'fair': 2, 'balanced': 2,
  'masterpiece': 4, 'gem': 3, 'brilliant': 3, 'innovative': 3,
  'recommend': 3, 'recommended': 3, 'must-play': 4,
  'gorgeous': 3, 'stunning': 3, 'beautiful': 2,
  'strategic': 2, 'strategy': 1, 'tactical': 1,
  'immersive': 3, 'engaging': 2, 'challenging': 1,
};

// Issue detection keywords
const ISSUE_PATTERNS: Array<{ keywords: string[]; tag: string }> = [
  { keywords: ['bug', 'bugs', 'glitch', 'glitchy', 'crash', 'crashes', 'broken', 'fix'], tag: 'bugs' },
  { keywords: ['lag', 'laggy', 'slow', 'fps', 'frame', 'performance', 'loading'], tag: 'performance' },
  { keywords: ['pay', 'p2w', 'pay2win', 'paywall', 'money', 'price', 'expensive', 'purchase', 'iap', 'microtransaction'], tag: 'monetization' },
  { keywords: ['ad', 'ads', 'advertisement', 'popup', 'pop-up', 'commercial'], tag: 'ads' },
  { keywords: ['graphic', 'graphics', 'visual', 'art', 'animation', 'design', 'gorgeous', 'beautiful', 'ugly'], tag: 'graphics' },
  { keywords: ['gameplay', 'mechanic', 'control', 'combat', 'battle', 'strategy', 'tactical', 'fun', 'boring'], tag: 'gameplay' },
  { keywords: ['update', 'patch', 'version', 'nerf', 'nerfed', 'change', 'changelog'], tag: 'updates' },
  { keywords: ['support', 'customer', 'service', 'help', 'response', 'ticket', 'contact'], tag: 'customer support' },
  { keywords: ['server', 'connection', 'disconnect', 'maintenance', 'downtime', 'online'], tag: 'server' },
  { keywords: ['story', 'plot', 'narrative', 'campaign', 'quest', 'mission', 'lore'], tag: 'story' },
  { keywords: ['balance', 'unbalanced', 'unfair', 'overpowered', 'op', 'nerf', 'buff', 'matchmaking'], tag: 'balance' },
  { keywords: ['grind', 'grindy', 'repetitive', 'boring', 'tedious', 'slow progress'], tag: 'grind' },
];

// POST /api/sentiment/analyze — Local sentiment analysis (no LLM needed)
export async function POST(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { gameId } = body;

    const where: any = { sentimentLabel: null };
    if (gameId) where.gameId = gameId;

    const unanalyzed = await prisma.sentimentReview.findMany({
      where,
      select: { id: true, title: true, content: true, rating: true },
    });

    if (unanalyzed.length === 0) {
      return NextResponse.json({ success: true, analyzed: 0, message: 'No unanalyzed reviews' });
    }

    let analyzed = 0;

    for (const review of unanalyzed) {
      const result = analyzeLocally(review.title, review.content, review.rating);

      await prisma.sentimentReview.update({
        where: { id: review.id },
        data: {
          sentimentScore: result.sentimentScore,
          sentimentLabel: result.sentimentLabel,
          keyIssues: result.keyIssues,
        },
      });
      analyzed++;
    }

    return NextResponse.json({ success: true, analyzed });
  } catch (error: any) {
    console.error('Sentiment analysis failed:', error);
    return NextResponse.json({ error: error.message || 'Sentiment analysis failed' }, { status: 500 });
  }
}

function analyzeLocally(
  title: string | null,
  content: string,
  rating: number
): { sentimentScore: number; sentimentLabel: string; keyIssues: string[] } {
  const text = `${title || ''} ${content}`.toLowerCase();

  // 1. Text-based sentiment score (AFINN + game keywords)
  const textResult = analyzer.analyze(text, { extras: GAME_KEYWORDS });
  // Normalize comparative score to -1..1 range (comparative is typically -5..5)
  const textScore = Math.max(-1, Math.min(1, textResult.comparative * 2));

  // 2. Rating-based score: map 1-5 stars to -1..1
  const ratingScore = (rating - 3) / 2; // 1→-1, 2→-0.5, 3→0, 4→0.5, 5→1

  // 3. Combined: rating is the stronger signal (70%), text refines it (30%)
  const combined = ratingScore * 0.7 + textScore * 0.3;
  const sentimentScore = Math.round(combined * 100) / 100;

  // 4. Label
  let sentimentLabel: string;
  if (sentimentScore >= 0.15) sentimentLabel = 'POSITIVE';
  else if (sentimentScore <= -0.15) sentimentLabel = 'NEGATIVE';
  else sentimentLabel = 'NEUTRAL';

  // 5. Key issues detection
  const keyIssues: string[] = [];
  for (const pattern of ISSUE_PATTERNS) {
    if (keyIssues.length >= 5) break;
    if (pattern.keywords.some(kw => text.includes(kw))) {
      keyIssues.push(pattern.tag);
    }
  }

  return { sentimentScore, sentimentLabel, keyIssues };
}
