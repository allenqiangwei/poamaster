import { NextRequest, NextResponse } from 'next/server';
import { EntryDimension } from '@prisma/client';
import { findSimilarEntries, generateEmbedding } from '@/lib/pulse/similarity';

// POST /api/pulse/entries/similar
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, dimension, title, evidence } = body;

    if (!projectId || !dimension || !title) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const candidateText = title + ' ' + (evidence || '');
    const embedding = await generateEmbedding(candidateText);

    const similar = await findSimilarEntries(
      projectId,
      dimension as EntryDimension,
      title,
      evidence || '',
      embedding
    );

    return NextResponse.json({
      success: true,
      data: similar
    });
  } catch (error) {
    console.error('Failed to find similar entries:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to find similar entries' },
      { status: 500 }
    );
  }
}
