import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const searchParams = request.nextUrl.searchParams;
  const competitorId = searchParams.get('competitorId');
  const acknowledged = searchParams.get('acknowledged');

  const where: any = {};
  if (competitorId) where.competitorId = competitorId;
  if (acknowledged !== null) where.acknowledged = acknowledged === 'true';

  const alerts = await prisma.competitorAlert.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { competitor: { select: { name: true } } },
  });

  return NextResponse.json({ success: true, alerts });
}

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const { id, acknowledged } = await request.json();
  if (!id) return NextResponse.json({ error: 'Missing alert id' }, { status: 400 });

  await prisma.competitorAlert.update({
    where: { id },
    data: { acknowledged: acknowledged ?? true },
  });

  return NextResponse.json({ success: true });
}
