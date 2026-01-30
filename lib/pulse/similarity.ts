import { prisma } from '@/lib/prisma';
import { getOpenAIClient } from '@/lib/openai';
import { EntryDimension } from '@prisma/client';
import { SimilarityResult, Source } from './types';
import { SIMILARITY_THRESHOLD, KEYWORD_WEIGHT, EMBEDDING_WEIGHT } from './constants';

// Tokenize text for keyword matching (Chinese + English)
export function tokenize(text: string): Set<string> {
  const cleaned = text.toLowerCase().replace(/[^\w\u4e00-\u9fff\s]/g, ' ');
  const tokens = new Set<string>();

  for (const word of cleaned.split(/\s+/)) {
    if (word.length > 1) {
      tokens.add(word);
    }
  }

  for (const char of cleaned) {
    if (/[\u4e00-\u9fff]/.test(char)) {
      tokens.add(char);
    }
  }

  return tokens;
}

// Jaccard similarity for keyword matching
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;

  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);

  return intersection.size / union.size;
}

// Cosine similarity for embeddings
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  if (magA === 0 || magB === 0) return 0;

  return dot / (magA * magB);
}

// Generate embedding for text
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const openai = await getOpenAIClient();

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000)
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Failed to generate embedding:', error);
    return [];
  }
}

// Find similar entries in same project and dimension
export async function findSimilarEntries(
  projectId: string,
  dimension: EntryDimension,
  candidateTitle: string,
  candidateEvidence: string,
  candidateEmbedding?: number[]
): Promise<SimilarityResult[]> {
  const entries = await prisma.pulseEntry.findMany({
    where: {
      projectId,
      dimension,
      deletedAt: null
    }
  });

  if (entries.length === 0) {
    return [];
  }

  const candidateText = candidateTitle + ' ' + candidateEvidence;
  const candidateTokens = tokenize(candidateText);

  const results: SimilarityResult[] = [];

  for (const entry of entries) {
    const entryText = entry.title + ' ' + entry.evidenceCurrent;
    const entryTokens = tokenize(entryText);

    const keywordScore = jaccardSimilarity(candidateTokens, entryTokens);

    let embeddingScore = 0;
    if (candidateEmbedding && candidateEmbedding.length > 0 &&
        entry.embedding && entry.embedding.length > 0) {
      embeddingScore = cosineSimilarity(candidateEmbedding, entry.embedding);
    }

    const score = keywordScore * KEYWORD_WEIGHT + embeddingScore * EMBEDDING_WEIGHT;

    if (score >= SIMILARITY_THRESHOLD) {
      results.push({
        entryId: entry.id,
        title: entry.title,
        evidenceCurrent: entry.evidenceCurrent,
        sourceCurrent: entry.sourceCurrent as unknown as Source,
        score,
        keywordScore,
        embeddingScore
      });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
