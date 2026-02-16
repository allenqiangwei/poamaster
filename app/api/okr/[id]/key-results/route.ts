import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

// POST /api/okr/:id/key-results — Add a key result
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { title, targetValue, unit, weight, ownerId } = body;

  if (!title?.trim()) {
    return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
  }

  const kr = await prisma.keyResult.create({
    data: {
      objectiveId: id,
      title: title.trim(),
      targetValue: targetValue ?? 100,
      unit: unit || '%',
      weight: weight ?? 1.0,
      ownerId: ownerId || null,
    },
    include: { owner: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ success: true, data: kr }, { status: 201 });
}

// PATCH /api/okr/:id/key-results — Update a key result (pass krId in body)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 401 });

  await params; // consume params
  const body = await req.json();
  const { krId, currentValue, title, targetValue, unit, weight, ownerId } = body;

  if (!krId) {
    return NextResponse.json({ success: false, error: 'krId is required' }, { status: 400 });
  }

  const data: any = {};
  if (currentValue !== undefined) data.currentValue = currentValue;
  if (title !== undefined) data.title = title;
  if (targetValue !== undefined) data.targetValue = targetValue;
  if (unit !== undefined) data.unit = unit;
  if (weight !== undefined) data.weight = weight;
  if (ownerId !== undefined) data.ownerId = ownerId || null;

  const kr = await prisma.keyResult.update({
    where: { id: krId },
    data,
    include: { owner: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ success: true, data: kr });
}
