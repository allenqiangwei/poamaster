import Sentiment from 'sentiment';

const analyzer = new Sentiment();

const GAME_KEYWORDS: Record<string, number> = {
  'bug': -3, 'bugs': -3, 'crash': -4, 'crashes': -4, 'lag': -3, 'laggy': -3,
  'p2w': -4, 'pay2win': -4, 'pay-to-win': -4, 'paywall': -3,
  'scam': -4, 'ripoff': -4, 'greedy': -3,
  'unplayable': -4, 'broken': -3, 'glitch': -3, 'glitchy': -3,
  'boring': -2, 'repetitive': -2, 'grindy': -2,
  'addictive': 3, 'polished': 3, 'smooth': 2,
  'masterpiece': 4, 'gem': 3, 'brilliant': 3,
  'gorgeous': 3, 'stunning': 3, 'beautiful': 2,
  'immersive': 3, 'engaging': 2,
};

export function analyzeReview(
  title: string | null,
  content: string,
  rating: number
): { sentiment: number; tags: string[] } {
  const text = `${title || ''} ${content}`.toLowerCase();

  const textResult = analyzer.analyze(text, { extras: GAME_KEYWORDS });
  const textScore = Math.max(-1, Math.min(1, textResult.comparative * 2));
  const ratingScore = (rating - 3) / 2;
  const sentiment = Math.round((ratingScore * 0.7 + textScore * 0.3) * 100) / 100;

  const ISSUE_PATTERNS = [
    { keywords: ['bug', 'crash', 'glitch', 'broken'], tag: 'bugs' },
    { keywords: ['lag', 'slow', 'fps', 'performance'], tag: 'performance' },
    { keywords: ['pay', 'p2w', 'paywall', 'expensive'], tag: 'monetization' },
    { keywords: ['ad', 'ads', 'popup'], tag: 'ads' },
    { keywords: ['gameplay', 'boring', 'repetitive'], tag: 'gameplay' },
    { keywords: ['server', 'connection', 'disconnect'], tag: 'server' },
  ];

  const tags: string[] = [];
  for (const p of ISSUE_PATTERNS) {
    if (tags.length >= 5) break;
    if (p.keywords.some(kw => text.includes(kw))) tags.push(p.tag);
  }

  return { sentiment, tags };
}
