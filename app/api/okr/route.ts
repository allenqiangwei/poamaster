import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

// GET /api/okr — List objectives with key results
export async function GET(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const period = sp.get('period');
  const ownerId = sp.get('ownerId');
  const status = sp.get('status');

  const where: any = {};
  if (period) where.periodLabel = period;
  if (ownerId) where.ownerId = ownerId;
  if (status) where.status = status;

  const objectives = await prisma.objective.findMany({
    where,
    include: {
      owner: { select: { id: true, name: true } },
      keyResults: {
        include: { owner: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Compute progress for each objective
  const data = objectives.map(obj => {
    const krs = obj.keyResults;
    const totalWeight = krs.reduce((s, kr) => s + kr.weight, 0);
    const weightedProgress = totalWeight > 0
      ? krs.reduce((s, kr) => {
          const progress = kr.targetValue > 0
            ? Math.min(kr.currentValue / kr.targetValue, 1)
            : 0;
          return s + progress * kr.weight;
        }, 0) / totalWeight
      : 0;

    return {
      ...obj,
      progress: Math.round(weightedProgress * 100),
    };
  });

  // Get available periods for filter
  const periods = await prisma.objective.findMany({
    select: { periodLabel: true },
    distinct: ['periodLabel'],
    orderBy: { periodLabel: 'desc' },
  });

  // Get assignees for filter
  const assignees = await prisma.assignee.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({
    success: true,
    data,
    periods: periods.map(p => p.periodLabel),
    assignees,
  });
}

// POST /api/okr — Create objective
export async function POST(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  const body = await req.json();
  const { title, description, periodType, periodLabel, ownerId, weight, keyResults } = body;

  if (!title?.trim()) {
    return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
  }
  if (!periodLabel?.trim()) {
    return NextResponse.json({ success: false, error: 'Period is required' }, { status: 400 });
  }

  const objective = await prisma.objective.create({
    data: {
      title: title.trim(),
      description: description?.trim() || null,
      periodType: periodType || 'QUARTERLY',
      periodLabel: periodLabel.trim(),
      ownerId: ownerId || null,
      weight: weight ?? 1.0,
      keyResults: keyResults?.length > 0
        ? {
            create: keyResults.map((kr: any) => ({
              title: kr.title,
              targetValue: kr.targetValue ?? 100,
              unit: kr.unit || '%',
              weight: kr.weight ?? 1.0,
              ownerId: kr.ownerId || null,
            })),
          }
        : undefined,
    },
    include: {
      owner: { select: { id: true, name: true } },
      keyResults: { include: { owner: { select: { id: true, name: true } } } },
    },
  });

  return NextResponse.json({ success: true, data: objective }, { status: 201 });
}
