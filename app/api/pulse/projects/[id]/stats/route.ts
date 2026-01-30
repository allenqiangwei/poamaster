import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { EntryDimension } from '@prisma/client';

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/pulse/projects/[id]/stats
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const entries = await prisma.pulseEntry.groupBy({
      by: ['dimension'],
      where: {
        projectId: id,
        deletedAt: null
      },
      _count: true
    });

    const byDimension: Record<string, number> = {};
    let total = 0;

    for (const entry of entries) {
      byDimension[entry.dimension] = entry._count;
      total += entry._count;
    }

    const allDimensions: EntryDimension[] = [
      'OVERALL_HEALTH', 'SCHEDULE', 'SCOPE', 'RISKS', 'BLOCKERS',
      'DEPENDENCIES', 'QUALITY', 'RESOURCING', 'DECISIONS',
      'KPI', 'PLAN_CREDIBILITY', 'ALIGNMENT'
    ];

    for (const dim of allDimensions) {
      if (!(dim in byDimension)) {
        byDimension[dim] = 0;
      }
    }

    return NextResponse.json({
      success: true,
      data: { total, byDimension }
    });
  } catch (error) {
    console.error('Failed to fetch project stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
