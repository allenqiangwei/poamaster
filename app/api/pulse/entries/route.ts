import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { EntryDimension } from '@prisma/client';

// GET /api/pulse/entries?projectId=xxx&dimension=xxx&search=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const dimension = searchParams.get('dimension') as EntryDimension | null;
    const search = searchParams.get('search');

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'projectId is required' },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = {
      projectId,
      deletedAt: null
    };

    if (dimension) {
      where.dimension = dimension;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { evidenceCurrent: { contains: search, mode: 'insensitive' } }
      ];
    }

    const entries = await prisma.pulseEntry.findMany({
      where,
      orderBy: { updatedAt: 'desc' }
    });

    return NextResponse.json({ success: true, data: entries });
  } catch (error) {
    console.error('Failed to fetch entries:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch entries' },
      { status: 500 }
    );
  }
}

// POST /api/pulse/entries - Create single entry
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, dimension, title, evidence, source } = body;

    if (!projectId || !dimension || !title || !evidence || !source) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const [entry] = await prisma.$transaction([
      prisma.pulseEntry.create({
        data: {
          projectId,
          dimension,
          title: title.trim(),
          evidenceCurrent: evidence.trim(),
          sourceCurrent: source,
          evidenceHistory: [],
          embedding: []
        }
      }),
      prisma.pulseProject.update({
        where: { id: projectId },
        data: { updatedAt: new Date() }
      })
    ]);

    return NextResponse.json({ success: true, data: entry }, { status: 201 });
  } catch (error) {
    console.error('Failed to create entry:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create entry' },
      { status: 500 }
    );
  }
}
